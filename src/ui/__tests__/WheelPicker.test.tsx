import { createRef } from 'react';
import { Pressable, ScrollView, TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

import { WheelPicker, WheelPickerHandle } from '../components/WheelPicker';

// The grids the arrival picker passes in.
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const HOURS = Array.from({ length: 24 }, (_, h) => String(h));

type WheelProps = Parameters<typeof WheelPicker>[0];

const mountWheel = (overrides: Partial<WheelProps> = {}) => {
  const props: WheelProps = {
    items: MINUTES,
    index: 9, // ':45'
    max: 59,
    onChange: jest.fn(),
    onSubmitText: jest.fn(),
    ...overrides,
  };
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<WheelPicker {...props} />, {
      createNodeMock: () => ({ scrollTo: () => {} }),
    });
  });
  return { renderer, props };
};

const openEditor = (renderer: ReactTestRenderer, index: number) => {
  // Tapping the CENTRED row swaps the centre slot for the TextInput.
  act(() => {
    renderer.root.findAllByType(Pressable)[index].props.onPress();
  });
  return renderer.root.findByType(TextInput);
};

// The original bug: the iOS number-pad has no return key (onSubmitEditing can
// never fire), and tapping the sheet's Set button does not blur a focused
// TextInput — so a blur-only commit silently dropped the typed value and the
// stale 5-minute grid value got confirmed. Typing must commit on every
// keystroke, and the committed value must always match what is on screen.
test('a typed value reaches the parent on every keystroke, without done/blur', () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  // RN fires onChangeText with the full field text on each keystroke.
  act(() => input.props.onChangeText('4'));
  expect(props.onSubmitText).toHaveBeenLastCalledWith('4');

  act(() => input.props.onChangeText('47'));
  expect(props.onSubmitText).toHaveBeenLastCalledWith('47');
});

test('non-digits are stripped before committing', () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('4a7'));
  expect(props.onSubmitText).toHaveBeenLastCalledWith('47');
});

test('an over-max entry clamps in the field itself — display matches the commit', () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('83'));
  expect(props.onSubmitText).toHaveBeenLastCalledWith('59');
  expect(renderer.root.findByType(TextInput).props.value).toBe('59');
});

test('hour wheel clamps to 23', () => {
  const { renderer, props } = mountWheel({ items: HOURS, index: 8, max: 23 });
  const input = openEditor(renderer, 8);

  act(() => input.props.onChangeText('91'));
  expect(props.onSubmitText).toHaveBeenLastCalledWith('23');
});

// Backspacing through '47' emits '4' then '' — the transient '4' must not
// stick as the value the Set button would confirm.
test('emptying the field reverts to the pre-edit value, not a backspace intermediate', () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('4'));
  act(() => input.props.onChangeText('47'));
  act(() => input.props.onChangeText('4'));
  act(() => input.props.onChangeText(''));

  expect(props.onSubmitText).toHaveBeenLastCalledWith('45');
});

test('the empty-field revert honors an off-grid override as the pre-edit value', () => {
  const { renderer, props } = mountWheel({ overrideLabel: '47' });
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('3'));
  act(() => input.props.onChangeText(''));

  expect(props.onSubmitText).toHaveBeenLastCalledWith('47');
});

test("leading zeros are preserved while typing ('05' stays '05')", () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('0'));
  act(() => input.props.onChangeText('05'));

  expect(props.onSubmitText).toHaveBeenLastCalledWith('05');
  expect(renderer.root.findByType(TextInput).props.value).toBe('05');
});

// A Number round-trip ('00' → '0') would bail out of re-rendering and leave
// the native field desynced from state with maxLength consumed.
test("'00' keeps field and state in sync", () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('0'));
  act(() => input.props.onChangeText('00'));

  expect(props.onSubmitText).toHaveBeenLastCalledWith('00');
  expect(renderer.root.findByType(TextInput).props.value).toBe('00');
});

// Scrolling the same wheel while its editor is open must close the editor —
// otherwise the field keeps showing typed digits while the scrolled row is
// what gets committed and confirmed.
test('a user scroll while editing closes the editor — the scrolled row wins', () => {
  jest.useFakeTimers();
  const ITEM_H = 44; // must match WheelPicker's row height
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('4'));
  // Release the programmatic-scroll guard armed on mount.
  act(() => {
    jest.advanceTimersByTime(60);
  });
  act(() => {
    renderer.root.findByType(ScrollView).props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { y: 6 * ITEM_H } },
    });
  });

  expect(props.onChange).toHaveBeenLastCalledWith(6);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
});

test('blur exits editing and the wheel returns to display mode', () => {
  const { renderer } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('47'));
  act(() => input.props.onBlur());

  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
});

test('tapping a NON-centred row selects it instead of opening the editor', () => {
  const { renderer, props } = mountWheel();

  act(() => {
    renderer.root.findAllByType(Pressable)[3].props.onPress();
  });

  expect(props.onChange).toHaveBeenCalledWith(3);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
});

// Auto-advance (typed-complete): once the typed entry can't accept another
// digit, onFilled tells the parent to hop focus to the next wheel. Two digits
// always complete the entry; a lone first digit of 3-9 completes an hour
// immediately (a second digit would push past 23), while 0-2 must wait —
// 0X/1X/2X are all still reachable.
test('onFilled fires once a second digit completes the hour', () => {
  const onFilled = jest.fn();
  const { renderer } = mountWheel({ items: HOURS, index: 8, max: 23, onFilled });
  const input = openEditor(renderer, 8);

  act(() => input.props.onChangeText('1'));
  expect(onFilled).not.toHaveBeenCalled();

  act(() => input.props.onChangeText('13'));
  expect(onFilled).toHaveBeenCalledTimes(1);
});

test('a lone first digit of 3-9 completes the hour immediately', () => {
  const onFilled = jest.fn();
  const { renderer } = mountWheel({ items: HOURS, index: 8, max: 23, onFilled });
  const input = openEditor(renderer, 8);

  act(() => input.props.onChangeText('3'));

  expect(onFilled).toHaveBeenCalledTimes(1);
});

test('a lone first digit of 0-2 waits — a two-digit hour may follow', () => {
  const onFilled = jest.fn();
  const { renderer } = mountWheel({ items: HOURS, index: 8, max: 23, onFilled });
  const input = openEditor(renderer, 8);

  for (const digit of ['0', '1', '2']) {
    act(() => input.props.onChangeText(digit));
    expect(onFilled).not.toHaveBeenCalled();
  }
});

test("a clamping second keystroke still completes — '29' commits '23' and fires", () => {
  const onFilled = jest.fn();
  const { renderer, props } = mountWheel({ items: HOURS, index: 8, max: 23, onFilled });
  const input = openEditor(renderer, 8);

  act(() => input.props.onChangeText('2'));
  act(() => input.props.onChangeText('29'));

  expect(props.onSubmitText).toHaveBeenLastCalledWith('23');
  expect(onFilled).toHaveBeenCalledTimes(1);
});

// Backspacing to empty reverts to the pre-edit value — that revert commit must
// never read as "entry complete" and yank focus away mid-correction.
test('emptying the field never fires onFilled', () => {
  const onFilled = jest.fn();
  const { renderer } = mountWheel({ items: HOURS, index: 8, max: 23, onFilled });
  const input = openEditor(renderer, 8);

  act(() => input.props.onChangeText('1'));
  act(() => input.props.onChangeText(''));

  expect(onFilled).not.toHaveBeenCalled();
});

// The hop target: the parent opens the NEXT wheel's editor imperatively; its
// TextInput mounts with autoFocus, so focus (and the keypad) move there.
test('startEditing() opens the editor imperatively', () => {
  const ref = createRef<WheelPickerHandle>();
  const { renderer } = mountWheel({ ref });

  act(() => ref.current!.startEditing());

  expect(renderer.root.findAllByType(TextInput)).toHaveLength(1);
});

test('the ref-opened editor reverts an emptied field to the wheel value, like a tap', () => {
  const ref = createRef<WheelPickerHandle>();
  const { renderer, props } = mountWheel({ ref }); // minutes grid, index 9 → '45'
  act(() => ref.current!.startEditing());
  const input = renderer.root.findByType(TextInput);

  act(() => input.props.onChangeText('3'));
  act(() => input.props.onChangeText(''));

  expect(props.onSubmitText).toHaveBeenLastCalledWith('45');
});

// The hour→minute bug: with the ScrollView default ('never'), the first tap on
// the minute wheel while the hour keypad is up only DISMISSES the keyboard —
// the tap never reaches the row, so moving to the minute field took two taps
// with a jarring keyboard hide/show. 'handled' delivers row taps (focus hops
// straight to the next field, keypad stays); empty-space taps still dismiss.
test("row taps stay live while the keypad is up (keyboardShouldPersistTaps='handled')", () => {
  const { renderer } = mountWheel();

  expect(renderer.root.findByType(ScrollView).props.keyboardShouldPersistTaps).toBe('handled');
});

// Reachable once row taps persist the keypad: tapping ANOTHER row while the
// editor is open must take over exactly like a scroll does — otherwise the
// field keeps showing typed digits while the tapped row is what gets committed.
test('tapping another row while editing closes the editor — the tapped row wins', () => {
  const { renderer, props } = mountWheel();
  const input = openEditor(renderer, 9);

  act(() => input.props.onChangeText('4'));
  act(() => {
    renderer.root.findAllByType(Pressable)[3].props.onPress();
  });

  expect(props.onChange).toHaveBeenLastCalledWith(3);
  expect(renderer.root.findAllByType(TextInput)).toHaveLength(0);
});
