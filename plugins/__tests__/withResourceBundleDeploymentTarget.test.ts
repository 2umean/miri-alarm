/**
 * Xcode 27 rejects any target whose iOS deployment target is below 15.0.
 * CocoaPods' resource-bundle targets keep their podspec's platform (Sentry
 * 11.0, Google Mobile Ads 12.0, …) and react_native_post_install only raises
 * the pods' main targets — so the Podfile must raise the bundles itself.
 */
jest.mock('@expo/config-plugins', () => ({
  // Run the plugin's action directly against a Podfile fixture instead of
  // Expo's mod pipeline.
  withPodfile: (config: any, action: (cfg: any) => any) => action(config),
}));

// CJS on purpose — eas-cli does not transpile referenced TypeScript plugins.
const withResourceBundleDeploymentTarget = require('../withResourceBundleDeploymentTarget');

const PODFILE = `target 'MIRIAlarm' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(
      installer,
      config[:reactNativePath],
      :mac_catalyst_enabled => false,
    )
  end
end
`;

const runPlugin = (contents: string): string =>
  withResourceBundleDeploymentTarget({ modResults: { contents } }).modResults.contents;

describe('withResourceBundleDeploymentTarget', () => {
  it('raises every resource-bundle target inside post_install', () => {
    const out = runPlugin(PODFILE);
    const hookAt = out.indexOf('post_install do |installer|');
    const raiseAt = out.indexOf('resource_bundle_targets');
    expect(hookAt).toBeGreaterThanOrEqual(0);
    expect(raiseAt).toBeGreaterThan(hookAt);
    expect(raiseAt).toBeLessThan(out.lastIndexOf('end\nend'));
    expect(out).toContain("'IPHONEOS_DEPLOYMENT_TARGET'");
    expect(out).toContain("'15.1'");
  });

  it('is idempotent when prebuild re-runs on an existing Podfile', () => {
    const once = runPlugin(PODFILE);
    expect(runPlugin(once)).toBe(once);
  });

  it('fails loudly when the Podfile has no post_install hook to extend', () => {
    expect(() => runPlugin("target 'MIRIAlarm' do\nend\n")).toThrow(/post_install/);
  });
});
