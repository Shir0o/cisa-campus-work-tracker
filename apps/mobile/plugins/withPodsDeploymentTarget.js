const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * Raise every CocoaPods target to at least the app's iOS deployment target.
 *
 * Why this plugin exists
 * ----------------------
 * App Store Connect wants the iOS 27 SDK from April 2027 (ITMS-90725), so the
 * iOS release builds on Xcode 27. Xcode 27 supports deployment targets from
 * iOS 15.0 only and, unlike earlier Xcodes, fails the build instead of warning
 * when a target asks for less. Several pods still declare old minimums in their
 * podspecs (Sentry 11.0, GoogleSignIn 12.0, PromisesObjC 9.0 and others), so
 * the unsigned Xcode 27 build check failed with:
 *
 *   The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to
 *   9.0, but the range of supported deployment target versions is 15.0 to 27.3.x.
 *
 * The app itself already targets 15.1 (Expo SDK 54's default), so lifting a pod
 * to 15.1 changes nothing about which devices can install the app.
 */
const MIN_IOS = '15.1';
const MARKER = '# withPodsDeploymentTarget';

function raisePodsDeploymentTarget(podfile, minIos = MIN_IOS) {
  if (podfile.includes(MARKER)) return podfile;
  const hook = /post_install do \|installer\|\n/;
  if (!hook.test(podfile)) {
    throw new Error('withPodsDeploymentTarget: no `post_install do |installer|` block in the Podfile.');
  }
  const snippet = [
    `    ${MARKER}: Xcode 27 rejects pod targets below iOS 15.`,
    '    installer.pods_project.targets.each do |target|',
    '      target.build_configurations.each do |build_config|',
    "        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
    `        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${minIos}')`,
    `          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${minIos}'`,
    '        end',
    '      end',
    '    end',
    '',
  ].join('\n');
  return podfile.replace(hook, (m) => m + snippet);
}

function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      const contents = fs.readFileSync(file, 'utf8');
      fs.writeFileSync(file, raisePodsDeploymentTarget(contents));
      return cfg;
    },
  ]);
}

module.exports = withPodsDeploymentTarget;
module.exports.raisePodsDeploymentTarget = raisePodsDeploymentTarget;
module.exports.MIN_IOS = MIN_IOS;
