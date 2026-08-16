module.exports = function babelConfig(api) {
  const isDev = api.env('development')
  api.cache.using(() => isDev)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './src/lib/tamagui.config.ts',
          logTimings: true,
          // Extraction inlines styles at compile time and breaks Fast Refresh.
          disableExtraction: isDev,
        },
      ],
    ],
  }
}
