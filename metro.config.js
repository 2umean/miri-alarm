// Sentry's wrapper around expo/metro-config: assigns unique Debug IDs to
// bundles + source maps so crash stacks symbolicate (required for EAS upload).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
