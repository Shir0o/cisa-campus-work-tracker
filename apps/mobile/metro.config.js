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

// packages/core has its own node_modules (installed for its standalone
// typecheck/test run) that would otherwise shadow this app's copy of firebase
// during Metro's normal upward node_modules crawl — two `Firestore` classes
// means a `db` instance created with one copy fails `instanceof` checks in
// functions bundled from the other. Block it outright rather than disabling
// hierarchical lookup, which would also break resolution of this app's own
// non-hoisted nested deps (e.g. firebase's own node_modules/@firebase/auth).
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const coreNodeModulesBlock = new RegExp(`^${escapeRegExp(path.join(coreRoot, 'node_modules'))}/.*$`);
const defaultBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaultBlockList) ? defaultBlockList : [defaultBlockList].filter(Boolean)),
  coreNodeModulesBlock,
];

module.exports = config;
