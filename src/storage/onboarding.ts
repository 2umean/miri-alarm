import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED_KEY = 'schedularm.onboarded.v1';

export async function isOnboarded(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDED_KEY)) === 'true';
}

export async function markOnboarded(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}
