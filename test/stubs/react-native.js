// Node-test stand-in for react-native, for logic-level component-contract
// tests under ts-jest (no jest-expo/babel). Host components render as plain
// string-typed elements; only the surface the tested components touch exists.
module.exports = {
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: (styles) => styles, flatten: (style) => style, hairlineWidth: 1 },
  Platform: { OS: 'ios', select: (spec) => ('ios' in spec ? spec.ios : spec.default) },
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
};
