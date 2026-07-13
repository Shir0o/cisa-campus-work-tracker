// Metro config — resolves the shared @cisa/core package from ../../packages/core
// WITHOUT requiring an npm-workspace hoist (the web app is on React 19 while this
// app is on Expo/React 18.3, so hoisting would conflict). We keep apps/mobile's
// node_modules self-contained and point Metro at the core source directly.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const coreRoot = path.resolve(workspaceRoot, 'packages/core');

const config = getDefaultConfig(projectRoot);

// Let Metro watch + transform the shared package's TypeScript source.
config.watchFolders = [coreRoot];

// Resolve `@cisa/core` to the package dir (its package.json main = src/index.ts).
config.resolver.extraNodeModules = {
  '@cisa/core': coreRoot,
};

// Resolve everything else (react, react-native, date-fns, firebase, …) from this
// app's own node_modules.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
