/**
 * Apps built with the iOS 27 SDK (Xcode 27) must adopt the UIScene lifecycle,
 * or UIKit aborts them at launch on iOS 27 — 1.2.1 shipped that crash, and it
 * is invisible on iOS 26. Guard the generated Info.plist rather than the
 * plugin options, so the check outlives `enableSceneSupport` (SDK 58+).
 */
import { execFileSync } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const INTROSPECT_TIMEOUT_MS = 60_000;

function introspectedInfoPlist(): Record<string, any> {
  // Runs the real mod pipeline (what prebuild/EAS apply) without writing files.
  const json = execFileSync('npx', ['expo', 'config', '--type', 'introspect', '--json'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(json).ios.infoPlist;
}

describe('iOS scene lifecycle', () => {
  it(
    'declares a scene manifest with a window-scene delegate',
    () => {
      const manifest = introspectedInfoPlist().UIApplicationSceneManifest;

      expect(manifest?.UISceneConfigurations?.UIWindowSceneSessionRoleApplication).toEqual([
        expect.objectContaining({ UISceneDelegateClassName: expect.any(String) }),
      ]);
    },
    INTROSPECT_TIMEOUT_MS,
  );
});
