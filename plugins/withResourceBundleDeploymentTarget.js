// CommonJS config plugin (NOT .ts): eas-cli does not transpile referenced
// TypeScript plugin files, so the plugin must be plain JS that any tool can require.
const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# @miri resource-bundle-deployment-target';
const POST_INSTALL = 'post_install do |installer|';

// Xcode 27 rejects any target whose iOS deployment target is below 15.0.
// CocoaPods' resource-bundle targets keep their podspec's platform (Sentry
// 11.0, Google Mobile Ads / UMP 12.0, AsyncStorage 13.4) and
// react_native_post_install only raises the pods' MAIN targets, so raise the
// bundles to React Native's own minimum here. Bundles hold no code.
const RAISE_BUNDLES = `
    ${MARKER}
    # Xcode 27 rejects deployment targets below 15.0; resource-bundle targets keep
    # their podspec's platform, which react_native_post_install does not raise.
    min_bundle_target = '15.1'
    installer.target_installation_results.pod_target_installation_results.each_value do |result|
      result.resource_bundle_targets.each do |bundle|
        bundle.build_configurations.each do |build_config|
          current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
          if current.nil? || current.to_f < min_bundle_target.to_f
            build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_bundle_target
          end
        end
      end
    end`;

function raiseResourceBundleTargets(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!contents.includes(POST_INSTALL)) {
    throw new Error(`withResourceBundleDeploymentTarget: no "${POST_INSTALL}" hook in the Podfile`);
  }
  return contents.replace(POST_INSTALL, `${POST_INSTALL}${RAISE_BUNDLES}`);
}

const withResourceBundleDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = raiseResourceBundleTargets(cfg.modResults.contents);
    return cfg;
  });

module.exports = withResourceBundleDeploymentTarget;
