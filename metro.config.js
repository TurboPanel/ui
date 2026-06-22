const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Co-located dev runs Expo with HOME under ui/.local (see turbopanel-ui.service).
// React Native DevTools is fetched via dotslash into ~/.cache under that tree.
// Metro's fallback watcher traverses the project root and crashes (ENOENT) when
// it tries to watch those ephemeral temp directories during first install.
config.resolver.blockList = [
  ...config.resolver.blockList,
  /(^|[/\\])\.local([/\\].*)?$/,
  /(^|[/\\])logs([/\\].*)?$/,
];

module.exports = config;
