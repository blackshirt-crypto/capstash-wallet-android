const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    extraNodeModules: {
      // Polyfill Node.js built-ins for React Native
      stream:         require.resolve('readable-stream'),
      events:         require.resolve('events'),
      string_decoder: require.resolve('string_decoder'),
      inherits:       require.resolve('inherits'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
