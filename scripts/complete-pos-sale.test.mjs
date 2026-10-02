import test from 'node:test';
import assert from 'node:assert/strict';
import { completePosSale as checkout } from '../utils/complete-pos-sale.ts';
const completePosSale = (sdk, id, location, amount = 300) => checkout(sdk, id, location, amount);

function fixture() {
  const order = {
    id: 'order_test',
    status: 'draft',
    currency_code: 'bdt',
    total: 300,
    metadata: { existing_note: 'Keep me' },
    payment_collections: [],
    sales_channel_id: 'sc_test',
    items: [
      {
        id: 'line_test',
        quantity: 2,
        requires_shipping: true,
        detail: { fulfilled_quantity: 0 },
        variant: { product: { shipping_profile: { id: 'sp_test' } } },
      },
    ],
    fulfillments: [],
  };
  const warehouse = {
    id: 'loc_test',
    name: 'Shop',
    sales_channels: [{ id: 'sc_test' }],
    address: { address_1: 'Counter', country_code: 'bd' },
  };
  const calls = [];
  let stock = 10;
  let failAfter;
  const write = (name) => {
    calls.push(name);
    if (failAfter === name) {
      failAfter = undefined;
      throw new Error('Connection lost after server write');
    }
  };
  const sdk = {
    admin: {
      stockLocation: { retrieve: async () => ({ stock_location: structuredClone(warehouse) }) },
      shippingOption: {
        list: async () => ({ shipping_options: [{ id: 'so_manual', shipping_profile_id: 'sp_test' }] }),
      },
      draftOrder: {
        beginEdit: async () => write('beginEdit'),
        update: async () => write('update'),
        confirmEdit: async () => write('confirmEdit'),
        cancelEdit: async () => write('cancelEdit'),
        convertToOrder: async () => {
          order.status = 'pending';
          write('convert');
        },
      },
      order: {
        retrieve: async () => ({ order: structuredClone(order) }),
        update: async (_id, body) => {
          order.metadata = body.metadata;
          write('cashMetadata');
        },
        createFulfillment: async (id, body) => {
          assert.equal(id, order.id);
          assert.equal(body.location_id, 'loc_test');
          assert.equal(body.shipping_option_id, 'so_manual');
          assert.equal(body.no_notification, true);
          for (const item of body.items) {
            const line = order.items.find((line) => line.id === item.id);
            line.detail.fulfilled_quantity += item.quantity;
            stock -= item.quantity;
          }
          order.fulfillments.push({
            id: `ful_${order.fulfillments.length}`,
            location_id: body.location_id,
            metadata: body.metadata,
            delivered_at: null,
            canceled_at: null,
          });
          write('fulfill');
        },
        markAsDelivered: async (id, fulfillmentId) => {
          order.fulfillments.find((fulfillment) => fulfillment.id === fulfillmentId).delivered_at = 'now';
          write('deliver');
        },
      },
    },
    client: {
      fetch: async (path, options) => {
        if (path === '/admin/payment-collections') {
          assert.equal(options.body.amount, 300);
          order.payment_collections.push({
            id: 'paycol_test',
            currency_code: 'bdt',
            amount: 300,
            captured_amount: 0,
            refunded_amount: 0,
            status: 'not_paid',
            payments: [],
          });
          write('paymentCollection');
          return;
        }
        if (path === '/admin/payment-collections/paycol_test/mark-as-paid') {
          assert.equal(options.body.provider_id, 'pp_system_default');
          const collection = order.payment_collections[0];
          assert.equal(collection.status, 'not_paid');
          collection.status = 'completed';
          collection.captured_amount = 300;
          collection.payments.push({ id: 'pay_test', provider_id: 'pp_system_default' });
          write('cashPayment');
          return;
        }
        assert.equal(path, `/admin/orders/${order.id}/complete`);
        order.status = 'completed';
        write('complete');
      },
    },
  };
  return {
    sdk,
    order,
    warehouse,
    calls,
    stock: () => stock,
    fail: (name) => {
      failAfter = name;
    },
  };
}

test('fulfills, hands over and completes once; repeated checkout does not deduct twice', async () => {
  const f = fixture();
  await completePosSale(f.sdk, f.order.id, 'loc_test');
  await completePosSale(f.sdk, f.order.id, 'loc_test');
  assert.equal(f.stock(), 8);
  assert.equal(f.order.status, 'completed');
  assert.deepEqual(f.calls, [
    'beginEdit',
    'update',
    'confirmEdit',
    'convert',
    'cashMetadata',
    'paymentCollection',
    'cashPayment',
    'fulfill',
    'deliver',
    'complete',
  ]);
  assert.equal(f.order.metadata.existing_note, 'Keep me');
  assert.equal(f.order.metadata.astha_pos_payment_method, 'cash');
  assert.equal(f.order.payment_collections[0].captured_amount, 300);
});
for (const phase of ['convert', 'cashMetadata', 'paymentCollection', 'cashPayment', 'fulfill', 'deliver', 'complete']) {
  test(`resumes after a lost ${phase} response without double deduction`, async () => {
    const f = fixture();
    f.fail(phase);
    await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /Connection lost/);
    await completePosSale(f.sdk, f.order.id, 'loc_test');
    assert.equal(f.stock(), 8);
    assert.equal(f.order.status, 'completed');
    assert.equal(f.calls.filter((call) => call === 'fulfill').length, 1);
    assert.equal(f.calls.filter((call) => call === 'deliver').length, 1);
    assert.equal(f.order.payment_collections.length, 1);
    assert.equal(f.order.payment_collections[0].payments.length, 1);
  });
}
test('coalesces simultaneous taps on the same device', async () => {
  const f = fixture();
  await Promise.all([completePosSale(f.sdk, f.order.id, 'loc_test'), completePosSale(f.sdk, f.order.id, 'loc_test')]);
  assert.equal(f.stock(), 8);
  assert.equal(f.calls.filter((call) => call === 'fulfill').length, 1);
});

test('changed or invalid cash totals cannot start checkout', async () => {
  const f = fixture();
  for (const amount of [299, NaN, -1]) await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test', amount));
  assert.deepEqual(f.calls, []);
});

test('different, partial and refunded payments require manual review', async () => {
  for (const overrides of [
    { status: 'partially_captured', captured_amount: 150 },
    { status: 'completed', captured_amount: 300, refunded_amount: 10 },
    { payments: [{ provider_id: 'pp_bkash' }] },
  ]) {
    const f = fixture();
    f.order.payment_collections = [
      {
        id: 'paycol_test',
        currency_code: 'bdt',
        amount: 300,
        captured_amount: 0,
        refunded_amount: 0,
        status: 'not_paid',
        payments: [],
        ...overrides,
      },
    ];
    await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /Review/);
    assert.deepEqual(f.calls, []);
  }
});
test('missing manual option fails before conversion or stock changes', async () => {
  const f = fixture();
  f.sdk.admin.shippingOption.list = async () => ({ shipping_options: [] });
  await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /No manual fulfillment option/);
  assert.deepEqual(f.calls, []);
});
test('unlinked warehouse, missing address and missing location cannot start checkout', async () => {
  const f = fixture();
  f.warehouse.sales_channels = [];
  await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /sales channel/);
  f.warehouse.sales_channels = [{ id: 'sc_test' }];
  f.warehouse.address = null;
  await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /Bangladesh street address/);
  await assert.rejects(completePosSale(f.sdk, f.order.id, ''), /Select a stock location/);
  assert.deepEqual(f.calls, []);
});
test('rejects canceled orders and foreign or canceled fulfillments instead of reprocessing', async () => {
  const f = fixture();
  f.order.status = 'canceled';
  await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /cannot be checked out/);
  f.order.status = 'pending';
  f.order.fulfillments = [{ id: 'foreign', location_id: 'loc_test', metadata: {} }];
  await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /non-POS/);
  f.order.fulfillments[0].metadata = { astha_pos_order_id: f.order.id };
  f.order.fulfillments[0].canceled_at = 'now';
  await assert.rejects(completePosSale(f.sdk, f.order.id, 'loc_test'), /canceled/);
  assert.deepEqual(f.calls, []);
});
