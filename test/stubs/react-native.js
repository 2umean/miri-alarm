// Node-test stand-in for react-native, for logic-level component-contract
// tests under ts-jest (no jest-expo/babel). Host components render as plain
// string-typed elements; only the surface the tested components touch exists.
module.exports = {
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  Modal: ({ visible, children }) => (visible ? children : null),
  StyleSheet: { create: (styles) => styles, flatten: (style) => style, hairlineWidth: 1 },
  Platform: { OS: 'ios', select: (spec) => ('ios' in spec ? spec.ios : spec.default) },
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: {
    currentState: 'active',
    _listeners: new Set(),
    addEventListener(type, fn) {
      if (type !== 'change') return { remove: () => {} };
      this._listeners.add(fn);
      return { remove: () => this._listeners.delete(fn) };
    },
    /** Test hook: fire a state change into every registered listener. */
    __emit(state) {
      this._listeners.forEach((fn) => fn(state));
    },
  },
  Linking: { openURL: () => Promise.resolve(), openSettings: () => Promise.resolve() },
};
