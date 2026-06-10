import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { AlarmService } from './src/alarm/AlarmService';
import { ChainScreen } from './src/ui/screens/ChainScreen';
import { OnboardingScreen } from './src/ui/screens/OnboardingScreen';
import { isOnboarded, markOnboarded } from './src/storage/onboarding';

type Route = 'loading' | 'onboarding' | 'chain';

export default function App() {
  const [route, setRoute] = useState<Route>('loading');

  useEffect(() => {
    isOnboarded().then((done) => {
      // Re-show onboarding if the device still has a critical at-risk gate
      // (e.g. an OEM reset the battery exemption after a firmware update — spec §8).
      const reliable = AlarmService.getHealth().isArmReliable;
      setRoute(done && reliable ? 'chain' : 'onboarding');
    });
  }, []);

  if (route === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: '#0B1021', justifyContent: 'center' }}>
        <ActivityIndicator color="#3D6BFF" />
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <>
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
      <StatusBar style="light" />
    </>
  );
}
