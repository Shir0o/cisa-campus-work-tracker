/**
 * SVGO Configuration for Autonomous Micro-Improvements
 * Preserves viewBox and dimensions to prevent layout collapse and CLS.
 */
export default {
  multipass: true,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          cleanupIds: false,
          mergePaths: false,
        },
      },
    },
    {
      name: 'prefixIds',
      active: true,
    },
  ],
};
