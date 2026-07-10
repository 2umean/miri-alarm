import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** Android's keyboardDidHide payload under-reports the visible frame on
    edge-to-edge windows (facebook/react-native#52596), which would leave stale
    avoider padding after dismissal — track visibility to disable it instead. */
export function useIsKeyboardShown() {
  const [isShown, setIsShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setIsShown(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setIsShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return isShown;
}
