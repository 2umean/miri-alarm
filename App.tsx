import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AlarmService } from './src/alarm/AlarmService';
import { isOnboarded, markOnboarded } from './src/storage/onboarding';
import { initTelemetry } from './src/telemetry';
import { colors } from './src/ui/theme';
import { ChainScreen } from './src/ui/screens/ChainScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

type Route = 'loading' | 'onboarding' | 'chain';

export default function App() {
  const [route, setRoute] = useState<Route>('loading');
  const [fontsLoaded, fontsError] = useFonts({
    'Pretendard-Regular': require('pretendard/dist/public/static/Pretendard-Regular.otf'),
    'Pretendard-SemiBold': require('pretendard/dist/public/static/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('pretendard/dist/public/static/Pretendard-Bold.otf'),
    'Pretendard-ExtraBold': require('pretendard/dist/public/static/Pretendard-ExtraBold.otf'),
    'Nunito-ExtraBold': Nunito_800ExtraBold,
  });
  const fontsReady = fontsLoaded || !!fontsError; // degrade to system fonts rather than hang on splash

  useEffect(() => {
    void initTelemetry(); // idempotent; starts SDKs iff consent was granted earlier
  }, []);

  useEffect(() => {
    isOnboarded().then((done) => {
      // Re-show onboarding if the device still has a critical at-risk gate
      // (e.g. an OEM reset the battery exemption after a firmware update — spec §8).
      const reliable = AlarmService.getHealth().isArmReliable;
      setRoute(done && reliable ? 'chain' : 'onboarding');
    });
  }, []);

  useEffect(() => {
    if (fontsReady && route !== 'loading') SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady, route]);

  if (!fontsReady || route === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.skyBg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.sky500} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {route === 'onboarding' ? (
          <OnboardingScreen
            onDone={async () => {
              await markOnboarded();
              setRoute('chain');
            }}
          />
        ) : (
          <ChainScreen />
        )}
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
