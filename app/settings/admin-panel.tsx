import { AdminBarcodeScanner } from '@/components/AdminBarcodeScanner';
import { Text } from '@/components/ui/Text';
import { useAuthenticated } from '@/contexts/auth';
import {
  adminBarcodeBridge,
  acknowledgeAdminScan,
  finishAdminScan,
  readAdminScanRequest,
  type AdminScanRequest,
} from '@/utils/admin-barcode-bridge';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import WebView from 'react-native-webview';
import type { WebViewSource } from 'react-native-webview/lib/WebViewTypes';

export default function AdminPanelScreen() {
  const auth = useAuthenticated();
  const origin = new URL(auth.medusaUrl).origin;
  const browser = React.useRef<WebView>(null);
  const bootstrapping = React.useRef(true);
  const bootstrapStarted = React.useRef(false);
  const sessionCreated = React.useRef(false);
  const mounted = React.useRef(true);
  const bootstrapAbort = React.useRef<AbortController | null>(null);
  const [source, setSource] = React.useState<WebViewSource>({ uri: `${origin}/app/login` });
  const [canGoBack, setCanGoBack] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [scan, setScan] = React.useState<AdminScanRequest | null>(null);

  React.useEffect(() => {
    if (!loading) return;
    // This is a visual hint, not a navigation lock. Android SPA redirects can
    // emit a start without the matching finish event; never spin indefinitely.
    const timeout = setTimeout(() => setLoading(false), 15000);
    return () => clearTimeout(timeout);
  }, [loading]);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      bootstrapAbort.current?.abort();
      if (sessionCreated.current) {
        // Destroy only the embedded browser's cookie session, not the POS JWT.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        void fetch(`${origin}/auth/session`, {
          method: 'DELETE',
          credentials: 'include',
          signal: controller.signal,
        })
          .then((response) => {
            if (!response.ok) throw new Error('Session cleanup failed');
          })
          .catch(() => {
            Toast.show({
              type: 'error',
              text1: 'Could not end admin browser session',
              text2: 'Its cookies will be cleared next time the panel opens.',
            });
          })
          .finally(() => clearTimeout(timeout));
      }
    };
  }, [origin]);

  const startSession = async () => {
    if (bootstrapStarted.current) return;
    bootstrapStarted.current = true;
    const controller = new AbortController();
    bootstrapAbort.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      // Android's RN ForwardingCookieHandler and WebView use the same native
      // CookieManager. Wait until WebView mounts (incognito clears old cookies),
      // then exchange the JWT natively. WebView POST itself drops custom headers.
      // No token is exposed to injected JS or browser storage.
      if (Platform.OS !== 'android') throw new Error('Use normal admin login on this platform');
      const response = await fetch(`${origin}/auth/session`, {
        method: 'POST',
        credentials: 'include',
        headers: { Authorization: `Bearer ${auth.apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Session handoff failed');
      sessionCreated.current = true;
      const verification = await fetch(`${origin}/admin/users/me`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!verification.ok || (await verification.json()).user?.id !== auth.user.id) {
        throw new Error('Browser cookie session was not established');
      }
      if (mounted.current) setSource({ uri: `${origin}/app` });
    } catch {
      if (mounted.current)
        setError('Automatic sign-in was unavailable. Check the connection or use the normal admin login.');
    } finally {
      clearTimeout(timeout);
      bootstrapping.current = false;
      if (mounted.current) setLoading(false);
    }
  };

  const close = React.useCallback(() => {
    Alert.alert(
      'Close Admin Panel?',
      'Any unsaved changes will be lost. The private admin browser session will be closed.',
      [
        { text: 'Keep open', style: 'cancel' },
        { text: 'Close', onPress: () => router.back() },
      ],
    );
  }, []);

  const handlePageReady = () => {
    if (bootstrapping.current) {
      void startSession();
    } else {
      setLoading(false);
      browser.current?.injectJavaScript(adminBarcodeBridge);
    }
  };

  React.useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scan) {
        browser.current?.injectJavaScript(finishAdminScan(scan, null));
        setScan(null);
      } else if (canGoBack) {
        browser.current?.goBack();
      } else {
        close();
      }
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack, close, scan]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-row items-center justify-between border-b border-gray-200 px-4 py-3">
        <Pressable accessibilityRole="button" disabled={!canGoBack} onPress={() => browser.current?.goBack()}>
          <Text className={!canGoBack ? 'text-gray-300' : ''}>Back</Text>
        </Pressable>
        <Text className="text-xl">Admin Panel</Text>
        <Pressable accessibilityRole="button" onPress={close}>
          <Text>Close</Text>
        </Pressable>
      </View>
      {error && (
        <View className="gap-2 bg-orange-50 p-3">
          <Text>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setError(null);
              bootstrapping.current = false;
              setSource({ uri: `${origin}/app/login` });
              if ('uri' in source && source.uri === `${origin}/app/login`) browser.current?.reload();
            }}
          >
            <Text>Open normal admin login</Text>
          </Pressable>
        </View>
      )}
      <View className="relative flex-1">
        <WebView
          ref={browser}
          source={source}
          incognito
          sharedCookiesEnabled={false}
          thirdPartyCookiesEnabled={false}
          allowFileAccess={false}
          mixedContentMode="never"
          javaScriptCanOpenWindowsAutomatically={false}
          // Handle every URL ourselves; otherwise rejected origins open in the OS browser.
          originWhitelist={['*']}
          onOpenWindow={() => Alert.alert('External link', 'This browser is limited to your Medusa admin server.')}
          onShouldStartLoadWithRequest={({ url }) => {
            try {
              return url === 'about:blank' || new URL(url).origin === origin;
            } catch {
              return false;
            }
          }}
          injectedJavaScript={adminBarcodeBridge}
          style={bootstrapping.current ? { opacity: 0 } : undefined}
          onNavigationStateChange={(state) => {
            if (!bootstrapping.current && !state.loading) setLoading(false);
            if (!bootstrapping.current && new URL(state.url, origin).origin === origin) {
              browser.current?.injectJavaScript(adminBarcodeBridge);
            }
            setCanGoBack(!bootstrapping.current && state.canGoBack && !state.url.endsWith('/auth/session'));
            const path = new URL(state.url, origin).pathname;
            if (!bootstrapping.current && path.startsWith('/app') && path !== '/app/login') {
              sessionCreated.current = true;
            }
            if (scan && path + new URL(state.url, origin).search !== scan.path) {
              browser.current?.injectJavaScript(finishAdminScan(scan, null));
              setScan(null);
            }
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={handlePageReady}
          // Android WebView may suppress onLoadEnd after a redirect/SPA URL
          // change. Progress completion is an independent readiness signal.
          onLoadProgress={({ nativeEvent }) => {
            if (nativeEvent.progress >= 1) handlePageReady();
          }}
          onHttpError={() => {
            setLoading(false);
            if (bootstrapping.current) {
              setError('Automatic sign-in was unavailable. You can use the normal admin login.');
            } else {
              setError('The admin page returned an error. Check the server or tunnel connection.');
            }
          }}
          onError={() => {
            bootstrapAbort.current?.abort();
            bootstrapping.current = false;
            setLoading(false);
            setError('Could not load the admin panel. Check the server, tunnel, or network connection.');
          }}
          onMessage={(event) => {
            try {
              const message = JSON.parse(event.nativeEvent.data);
              if (new URL(event.nativeEvent.url).origin !== origin) return;
              if (message.type === 'astha-scan-timeout') {
                Toast.show({
                  type: 'error',
                  text1: 'Scanner did not start',
                  text2: 'Please try Scan again or reopen the editor.',
                });
                return;
              }
              if (
                new URL(event.nativeEvent.url).origin === origin &&
                JSON.parse(event.nativeEvent.data).type === 'astha-admin-ready' &&
                !bootstrapping.current
              ) {
                setLoading(false);
                return;
              }
            } catch {
              return;
            }
            const request = readAdminScanRequest(event.nativeEvent.data, event.nativeEvent.url, origin);
            if (request && !scan && !bootstrapping.current) {
              browser.current?.injectJavaScript(acknowledgeAdminScan(request));
              setScan(request);
            }
          }}
        />
        {loading && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: '#ffffffdd',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ActivityIndicator size="small" color="#666" accessibilityLabel="Loading Admin Panel" />
          </View>
        )}
      </View>
      {scan && (
        <AdminBarcodeScanner
          onScan={(barcode) => {
            browser.current?.injectJavaScript(finishAdminScan(scan, barcode));
            setScan(null);
          }}
          onCancel={() => {
            browser.current?.injectJavaScript(finishAdminScan(scan, null));
            setScan(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}
