import { useAuthCtx } from '@/contexts/auth';
import { useSettings } from '@/contexts/settings';
import { SplashScreen } from 'expo-router';
import * as React from 'react';

SplashScreen.preventAutoHideAsync();

export function SplashScreenController() {
  const auth = useAuthCtx();
  const settings = useSettings();

  React.useEffect(() => {
    if (
      auth.state.status !== 'loading' &&
      (!settings.isEnabled || settings.isSuccess || auth.connection === 'reconnecting')
    ) {
      SplashScreen.hideAsync();
    }
  }, [auth.state.status, auth.connection, settings.isEnabled, settings.isSuccess]);

  return null;
}
