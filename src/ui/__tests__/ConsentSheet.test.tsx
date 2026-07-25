import { Pressable, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { ConsentSheet } from '../components/ConsentSheet';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: require('react-native').View,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

type Props = Parameters<typeof ConsentSheet>[0];

const mount = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    visible: true,
    initialGranted: false,
    onCancel: jest.fn(),
    onSave: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<ConsentSheet {...props} />);
  });
  return { renderer, props };
};

const findToggle = (renderer: ReactTestRenderer) =>
  renderer.root.findAllByType(Pressable).find((p) => p.props.accessibilityRole === 'switch')!;

const texts = (renderer: ReactTestRenderer): string[] =>
  renderer.root.findAllByType(Text).map((t) => String(t.props.children));

test('starts from initialGranted and toggles on press', () => {
  const { renderer } = mount({ initialGranted: false });
  expect(findToggle(renderer).props.accessibilityState).toEqual({ checked: false });
  act(() => findToggle(renderer).props.onPress());
  expect(findToggle(renderer).props.accessibilityState).toEqual({ checked: true });
});

test('save reports the CURRENT toggle state', () => {
  const { renderer, props } = mount({ initialGranted: false });
  act(() => findToggle(renderer).props.onPress());
  // The save button is the last Pressable in the sheet ([backdrop, toggle, save]).
  const pressables = renderer.root.findAllByType(Pressable);
  act(() => pressables[pressables.length - 1].props.onPress());
  expect(props.onSave).toHaveBeenCalledWith(true);
  expect(props.onCancel).not.toHaveBeenCalled();
});

test('backdrop press cancels without saving', () => {
  const { renderer, props } = mount();
  act(() => renderer.root.findAllByType(Pressable)[0].props.onPress()); // backdrop is first
  expect(props.onCancel).toHaveBeenCalled();
  expect(props.onSave).not.toHaveBeenCalled();
});

test('shows on/off labels for the toggle state', () => {
  const { renderer } = mount({ initialGranted: true });
  expect(texts(renderer).join(' ')).toContain('Sharing on');
});
