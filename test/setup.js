// react-test-renderer 19 under plain jest/node needs both flags: the first
// opts in to act() (every act() call console.errors without it), the second is
// RTR's react-native-test gate, which also silences its per-create()
// deprecation notice — appropriate here since these ARE react-native component
// tests (see test/stubs/react-native.js).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IS_REACT_NATIVE_TEST_ENVIRONMENT = true;
