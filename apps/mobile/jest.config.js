// Component test runner for the mobile app. The Expo-recommended stack:
// jest-expo (SDK-matched preset) + @testing-library/react-native.
//
// The preset already maps the tsconfig's paths (so `@cisa/core` and `@/*`
// resolve to source) and allowlists the node_modules that need Babel. We only
// add what this app needs beyond the preset: the shared core package's TS
// source (kept explicit so it stays mapped even if tsconfig changes) and
// @gorhom/bottom-sheet's ESM build (only reachable once a test renders a real
// sheet; mocked out in the queue tests but harmless to allow).
const preset = require('jest-expo/jest-preset');

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testTimeout: 15000,
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    '^@cisa/core$': '<rootDir>/../../packages/core/src/index.ts',
  },
  // @firebase/* ships a few .mjs entry points (e.g. postinstall.mjs) that the
  // preset's transform map (\.tsx?$|\.jsx?$) doesn't cover.
  transform: {
    ...preset.transform,
    '^.+\\.mjs$': 'babel-jest',
  },
  transformIgnorePatterns: [
    // The preset's allowlist, extended with the ESM-only packages @cisa/core's
    // barrel drags in (firebase, @firebase/*, date-fns), @gorhom/bottom-sheet
    // and react-native-svg (the on-campus goal ring). These REPLACE the
    // preset's list: transformIgnorePatterns are OR'd, so a file is ignored
    // when ANY pattern matches — an appended pattern can't un-ignore what the
    // preset's already ignores.
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@gorhom|firebase|@firebase|date-fns|react-native-svg))',
    // Keep the preset's exclusion: never transform the reanimated babel plugin.
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
