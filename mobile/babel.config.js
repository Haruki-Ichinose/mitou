const path = require('path');

module.exports = function babelConfig(api) {
  api.cache(true);
  const expoPreset = require.resolve('babel-preset-expo', {
    // Force the Expo SDK's preset version even if an older one exists at the project root.
    paths: [path.join(__dirname, 'node_modules/expo')],
  });
  return {
    presets: [expoPreset],
  };
};
