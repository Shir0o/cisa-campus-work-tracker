/**
 * Xcode 27 fails the build when a pod target asks for less than iOS 15, so the
 * plugin lifts every pod target in the Podfile's post_install hook.
 */
const { raisePodsDeploymentTarget, MIN_IOS } = require('./withPodsDeploymentTarget');

const PODFILE = [
  "target 'CISACampusWorkTracker' do",
  '  use_expo_modules!',
  '  post_install do |installer|',
  '    react_native_post_install(installer, config[:reactNativePath])',
  '  end',
  'end',
  '',
].join('\n');

describe('withPodsDeploymentTarget', () => {
  it('raises pod targets inside post_install, before the React Native hook', () => {
    const out = raisePodsDeploymentTarget(PODFILE);
    expect(out).toContain(`build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS}'`);
    expect(out.indexOf('withPodsDeploymentTarget')).toBeGreaterThan(out.indexOf('post_install do |installer|'));
    expect(out.indexOf('withPodsDeploymentTarget')).toBeLessThan(out.indexOf('react_native_post_install'));
  });

  it('is idempotent', () => {
    const once = raisePodsDeploymentTarget(PODFILE);
    expect(raisePodsDeploymentTarget(once)).toBe(once);
  });

  it('fails loudly when the Podfile has no post_install hook', () => {
    expect(() => raisePodsDeploymentTarget("target 'X' do\nend\n")).toThrow(/post_install/);
  });
});
