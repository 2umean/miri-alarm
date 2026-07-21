// src/ui/components/WheelPicker.tsx
import { useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, fonts, spacing } from '../theme';

const ITEM_H = 44;
const VISIBLE_ROWS = 5; // odd, so one row sits exactly centred
const PAD_H = ((VISIBLE_ROWS - 1) / 2) * ITEM_H;
// Release window for the isProgrammatic flag after a programmatic scrollTo.
const SCROLL_SETTLE_MS = 50;

type Props = {
  /** Display label per grid slot (e.g. '0'…'23' or '00','05',…'55'). */
  items: string[];
  /** Selected grid index. An off-grid value keeps the wheel at this index and overrides the text. */
  index: number;
  /** Shown in the centre slot instead of items[index] (e.g. a typed ':47'). */
  overrideLabel?: string | null;
  onChange: (index: number) => void;
  /** Largest typeable value (23 for hours, 59 for minutes) — typed digits clamp to it. */
  max: number;
  /** Centre-TextInput commit (clamped digits), fired on EVERY keystroke. Parent parses. */
  onSubmitText: (text: string) => void;
};

/**
 * One wheel column, "scroll + tap" (spec): scroll snaps to the grid; tapping a
 * NON-centred row selects it; tapping the CENTRED value swaps it for a numeric
 * TextInput. Taps live on the items INSIDE the ScrollView (the ScrollView is
 * their ancestor, so a drag that starts on any row — centre included — is
 * stolen by the scroll as usual; a sibling overlay would dead-zone it). An
 * off-grid override is display-only until the next scroll snaps back.
 */
export function WheelPicker({ items, index, overrideLabel, onChange, max, onSubmitText }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState('');
  // The value displayed when editing began — an emptied field reverts to it.
  const preEdit = useRef('');
  // Distinguish user scrolls from our own scrollTo (which must not re-fire onChange).
  const isProgrammatic = useRef(false);

  // Keep the wheel positioned on the selected index whenever it changes from
  // outside (open/seed, typed commit). animated:false → no momentum events.
  useEffect(() => {
    isProgrammatic.current = true;
    scrollRef.current?.scrollTo({ y: index * ITEM_H, animated: false });
    // scrollTo with animated:false emits no momentum-end; release the flag next tick.
    const id = setTimeout(() => {
      isProgrammatic.current = false;
    }, SCROLL_SETTLE_MS);
    return () => clearTimeout(id);
  }, [index, items.length]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (isProgrammatic.current) return;
    const raw = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
    const next = Math.min(items.length - 1, Math.max(0, raw));
    // A scroll while the editor is open takes over: close it, so the field
    // can't keep showing typed digits while the scrolled row is committed.
    if (isEditing) {
      setIsEditing(false);
      setText('');
    }
    if (next !== index || overrideLabel != null) onChange(next); // a scroll also clears an off-grid override
  };

  // Commit on every keystroke (PillEditorSheet recipe), NOT on blur/submit:
  // the iOS number-pad has no return key, so onSubmitEditing can never fire
  // there, and tapping the sheet's confirm button does not blur a focused
  // TextInput — a blur-only commit silently dropped the typed value. So that
  // the committed value always matches what is on screen, an over-max entry
  // clamps in the field itself (capped resync, same recipe) and an emptied
  // field reverts to the pre-edit value instead of leaving a stale keystroke.
  // Digits stay exactly as typed unless clamping is needed ('05' keeps its
  // zero) — a Number round-trip would bail out of re-rendering on '0'→'00'
  // and strand the native field out of sync with state.
  const editText = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, 2);
    const shown = Number(digits) > max ? String(max) : digits;
    setText(shown);
    onSubmitText(shown || preEdit.current);
  };

  const stopEditing = () => setIsEditing(false);

  return (
    <View style={styles.column}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentOffset={{ x: 0, y: index * ITEM_H }}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onMomentumScrollEnd={settle}
        // A drag that ends dead-on a snap point emits no momentum phase (Android);
        // settle() is idempotent so handling both events is safe.
        onScrollEndDrag={settle}
      >
        <View style={{ height: PAD_H }} />
        {items.map((label, i) => (
          <Pressable
            key={i}
            style={styles.item}
            onPress={() => {
              if (i === index) {
                preEdit.current = (overrideLabel ?? items[i]).replace(/[^0-9]/g, '');
                setText('');
                setIsEditing(true); // tap the centred number → type an exact value
              } else {
                onChange(i); // tap any other row → select it (the effect scrolls to it)
              }
            }}
          >
            <Text style={[styles.itemText, i === index && !overrideLabel && styles.itemTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
        <View style={{ height: PAD_H }} />
      </ScrollView>

      {/* Centre slot overlay: hairlines, the off-grid value, and the edit input.
          Touch-transparent except while editing — taps reach the items below. */}
      <View pointerEvents={isEditing ? 'auto' : 'none'} style={styles.centerBand}>
        <View style={styles.hairline} />
        {isEditing ? (
          <TextInput
            style={styles.centerInput}
            value={text}
            onChangeText={editText}
            keyboardType="number-pad"
            maxLength={2}
            autoFocus
            selectTextOnFocus
            onBlur={stopEditing}
            onSubmitEditing={stopEditing}
          />
        ) : (
          <View style={styles.centerSlot}>
            {overrideLabel != null ? <Text style={styles.centerOverride}>{overrideLabel}</Text> : null}
          </View>
        )}
        <View style={styles.hairline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { height: ITEM_H * VISIBLE_ROWS, flex: 1 },
  scroll: { flex: 1 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { color: colors.disabledText, fontSize: 20, fontFamily: fonts.clock },
  itemTextActive: { color: colors.ink, fontSize: 24 },
  centerBand: {
    position: 'absolute',
    top: PAD_H,
    left: 0,
    right: 0,
    height: ITEM_H,
    justifyContent: 'space-between',
  },
  hairline: { height: 1.5, backgroundColor: colors.line, marginHorizontal: spacing.s },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // An off-grid value paints OVER the (nearest-grid) item behind it.
  centerOverride: {
    color: colors.ink,
    fontSize: 24,
    fontFamily: fonts.clock,
    backgroundColor: colors.skyBgBottom,
    paddingHorizontal: spacing.m,
  },
  centerInput: {
    flex: 1,
    textAlign: 'center',
    color: colors.ink,
    fontSize: 24,
    fontFamily: fonts.clock,
    backgroundColor: colors.skyBg,
    padding: 0,
  },
});
