const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Raise the Gradle JVM memory that `expo prebuild` writes into
 * android/gradle.properties.
 *
 * Why this plugin exists
 * ----------------------
 * app.json previously carried `android.extraGradleProperties` under
 * expo-build-properties. That key does not exist in expo-build-properties
 * 1.0.10 - it exposes compileSdkVersion, buildToolsVersion, kotlinVersion,
 * enableMinifyInReleaseBuilds, enableShrinkResourcesInReleaseBuilds,
 * packagingOptions, networkInspector and usesCleartextTraffic, and nothing for
 * JVM args - so it was silently ignored. Gradle therefore kept the React Native
 * default of -Xmx2048m -XX:MaxMetaspaceSize=512m, and the release build failed:
 *
 *   The Daemon will expire after the build after running out of JVM Metaspace.
 *   The currently configured max heap space is '2 GiB' and the configured max
 *   metaspace is '512 MiB'.
 *   > Task :app:minifyReleaseWithR8 FAILED
 *   > Task :expo-modules-core:lintVitalAnalyzeRelease FAILED
 *
 * This is the supported way to change those values: rewrite the existing
 * org.gradle.jvmargs property in place rather than appending a second one
 * (Java properties take the last occurrence, so a duplicate would work by
 * accident, not by design).
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=2048m';

module.exports = function withGradleJvmArgs(config) {
  return withGradleProperties(config, (cfg) => {
    const key = 'org.gradle.jvmargs';
    const properties = cfg.modResults;
    const existing = properties.find((entry) => entry.type === 'property' && entry.key === key);

    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      properties.push({ type: 'property', key, value: JVM_ARGS });
    }

    return cfg;
  });
};
