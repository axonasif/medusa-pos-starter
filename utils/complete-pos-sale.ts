import type Medusa from '@medusajs/js-sdk';
import type { AdminOrder } from '@medusajs/types';

const ORDER_FIELDS =
  '+currency_code,+sales_channel_id,+total,+metadata,+payment_collections.*,+payment_collections.payments.*,+fulfillments.*,+fulfillments.items.*,+items.detail.*,+items.variant.product.shipping_profile.id';
const activeSales = new Map<string, Promise<void>>();

// Each write uses a native admin endpoint, including Astha's stock/cost guard.
// Retry by reading server state, never by blindly repeating stock adjustments.
export function completePosSale(
  sdk: Medusa,
  orderId: string,
  locationId: string,
  cashReceivedTotal: number,
): Promise<void> {
  const existing = activeSales.get(orderId);
  if (existing) return existing;
  const pending = runSale(sdk, orderId, locationId, cashReceivedTotal).finally(() => activeSales.delete(orderId));
  activeSales.set(orderId, pending);
  return pending;
}

async function runSale(sdk: Medusa, orderId: string, locationId: string, cashReceivedTotal: number) {
  if (!locationId) throw new Error('Select a stock location in Settings before checkout.');
  const read = async () => (await sdk.admin.order.retrieve(orderId, { fields: ORDER_FIELDS })).order;
  let order = await read();
  if (order.status === 'canceled' || order.status === 'archived') {
    throw new Error('This order cannot be checked out. Review it in Medusa Admin.');
  }
  if (order.currency_code !== 'bdt' || !order.items.length) {
    throw new Error('In-store checkout requires a non-empty BDT order.');
  }
  if (minorUnits(order.total) !== minorUnits(cashReceivedTotal)) {
    throw new Error('The order total changed. Reload checkout and confirm the correct cash amount before retrying.');
  }
  assertCashPayments(order, cashReceivedTotal);

  const { stock_location } = await sdk.admin.stockLocation.retrieve(locationId, { fields: '+sales_channels.id' });
  if (!stock_location.sales_channels?.some((channel) => channel.id === order.sales_channel_id)) {
    throw new Error('The selected warehouse must be linked to this order’s sales channel.');
  }
  if (!stock_location.address?.address_1 || stock_location.address.country_code !== 'bd') {
    throw new Error('Set a Bangladesh street address on the selected warehouse before in-store checkout.');
  }
  assertOwnFulfillments(order, locationId);

  // Resolve all options before converting: never accidentally book a courier.
  // Shipping-required and non-shipping items must be fulfilled separately.
  const { shipping_options } = await sdk.admin.shippingOption.list({
    stock_location_id: locationId,
    provider_id: 'manual_manual',
    limit: 100,
    fields: 'id,shipping_profile_id,provider_id,rules.*',
  });
  const groups = new Map<string, { optionId: string; itemIds: string[] }>();
  for (const item of order.items) {
    const profileId = item.variant?.product?.shipping_profile?.id;
    const option = shipping_options.find(
      (candidate) =>
        candidate.shipping_profile_id === profileId &&
        !candidate.rules?.some((rule) => rule.attribute === 'is_return' && String(rule.value) === 'true'),
    );
    if (!profileId || !option) {
      throw new Error(
        'No manual fulfillment option exists for this product at the selected warehouse. Configure it in Medusa Admin.',
      );
    }
    const key = `${profileId}:${Boolean(item.requires_shipping)}`;
    const group = groups.get(key) ?? { optionId: option.id, itemIds: [] };
    group.itemIds.push(item.id);
    groups.set(key, group);
  }

  if (order.status === 'draft') {
    // Medusa's manual fulfillment still needs a delivery address. For a
    // counter sale this is the shop, not a customer's home or a courier booking.
    await sdk.admin.draftOrder.beginEdit(orderId);
    try {
      await sdk.admin.draftOrder.update(orderId, {
        shipping_address: {
          company: stock_location.name,
          address_1: stock_location.address.address_1,
          address_2: stock_location.address.address_2 ?? undefined,
          city: stock_location.address.city ?? undefined,
          province: stock_location.address.province ?? undefined,
          postal_code: stock_location.address.postal_code ?? undefined,
          country_code: 'bd',
          phone: stock_location.address.phone ?? undefined,
        },
      });
      await sdk.admin.draftOrder.confirmEdit(orderId);
    } catch (error) {
      await sdk.admin.draftOrder.cancelEdit(orderId).catch(() => undefined);
      throw error;
    }
    await sdk.admin.draftOrder.convertToOrder(orderId);
  }
  // The cashier has confirmed cash already received. Record it before goods
  // are fulfilled, and recover a lost response by reading the payment state.
  await recordCashPayment(sdk, read, orderId, cashReceivedTotal);
  for (const group of groups.values()) {
    order = await read();
    assertOwnFulfillments(order, locationId);
    const items = order.items
      .filter((item) => group.itemIds.includes(item.id))
      .map((item) => ({ id: item.id, quantity: item.quantity - Number(item.detail?.fulfilled_quantity ?? 0) }))
      .filter((item) => item.quantity > 0);
    if (items.length) {
      await sdk.admin.order.createFulfillment(orderId, {
        location_id: locationId,
        shipping_option_id: group.optionId,
        items,
        no_notification: true,
        metadata: { astha_pos_order_id: orderId },
      });
    }
  }
  order = await read();
  assertOwnFulfillments(order, locationId);
  if (order.items.some((item) => Number(item.detail?.fulfilled_quantity ?? 0) !== item.quantity)) {
    throw new Error('Fulfillment is incomplete. Resume this checkout; do not create another sale.');
  }
  for (const fulfillment of order.fulfillments ?? []) {
    if (!fulfillment.delivered_at) {
      // In-store goods are handed over now, not sent by a carrier. Medusa's
      // delivery endpoint does not require a shipping/tracking-label step.
      await sdk.admin.order.markAsDelivered(orderId, fulfillment.id);
    }
  }
  order = await read();
  if (order.status !== 'completed') {
    await sdk.client.fetch(`/admin/orders/${orderId}/complete`, { method: 'POST' });
  }
}

function minorUnits(value: unknown): number {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  const minor = Math.round(amount * 100);
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(minor)) {
    throw new Error('A valid cash-received total is required before completing the sale.');
  }
  return minor;
}

function assertCashPayments(order: AdminOrder, amount: number) {
  const collections = order.payment_collections ?? [];
  if (
    collections.length > 1 ||
    (order.metadata?.astha_pos_payment_method && order.metadata.astha_pos_payment_method !== 'cash')
  ) {
    throw new Error('This order has a different or split payment. Review its payments in Medusa Admin.');
  }
  const collection = collections[0];
  if (!collection) return;
  if (
    collection.currency_code !== 'bdt' ||
    minorUnits(collection.amount) !== minorUnits(amount) ||
    Number(collection.refunded_amount ?? 0) !== 0 ||
    collection.payments?.some((payment) => payment.provider_id !== 'pp_system_default') ||
    !['not_paid', 'completed'].includes(collection.status) ||
    (collection.status === 'not_paid' &&
      (Number(collection.captured_amount ?? 0) !== 0 || collection.payments?.length)) ||
    (collection.status === 'completed' && minorUnits(collection.captured_amount) !== minorUnits(amount))
  ) {
    throw new Error(
      'This order has an existing, partial, refunded, or different-method payment. Review it in Medusa Admin; do not collect cash again.',
    );
  }
}

async function recordCashPayment(sdk: Medusa, read: () => Promise<AdminOrder>, orderId: string, amount: number) {
  let order = await read();
  if (minorUnits(order.total) !== minorUnits(amount))
    throw new Error('The order total changed. Reload checkout before confirming cash.');
  assertCashPayments(order, amount);
  if (!order.metadata?.astha_pos_payment_method) {
    await sdk.admin.order.update(orderId, {
      metadata: {
        ...order.metadata,
        astha_pos_payment_method: 'cash',
        astha_pos_cash_amount: amount,
        astha_pos_cash_confirmed_at: new Date().toISOString(),
      },
    });
  }
  if (!order.payment_collections?.length) {
    await sdk.client.fetch('/admin/payment-collections', {
      method: 'POST',
      body: { order_id: orderId, amount },
    });
  }
  // Re-read even after creation: a disconnected response must never cause a
  // second collection, and ambiguous/multiple collections need manual review.
  order = await read();
  assertCashPayments(order, amount);
  const collection = order.payment_collections?.[0];
  if (!collection)
    throw new Error('Payment collection is not available yet. Resume this same sale; do not collect cash again.');
  if (collection.status === 'not_paid') {
    await sdk.client.fetch(`/admin/payment-collections/${collection.id}/mark-as-paid`, {
      method: 'POST',
      body: { order_id: orderId, provider_id: 'pp_system_default' },
    });
  }
  order = await read();
  assertCashPayments(order, amount);
  if (order.payment_collections?.[0]?.status !== 'completed') {
    throw new Error('Cash payment is not confirmed yet. Resume this same sale; do not collect cash again.');
  }
}

function assertOwnFulfillments(order: AdminOrder, locationId: string) {
  if (
    order.fulfillments?.some(
      (fulfillment) =>
        fulfillment.canceled_at ||
        fulfillment.location_id !== locationId ||
        fulfillment.metadata?.astha_pos_order_id !== order.id,
    )
  ) {
    throw new Error(
      'This order has a canceled, non-POS, or different-warehouse fulfillment. Review it in Medusa Admin.',
    );
  }
}
