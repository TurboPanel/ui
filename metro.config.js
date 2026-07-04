const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Co-located dev runs Expo with HOME under /var/lib/turbopanel/ui/.local
// (see turbopanel-ui.service). Build caches (.expo) may still live in the
// checkout; Metro's fallback watcher crashes (ENOENT) on ephemeral temp dirs.
config.resolver.blockList = [
  ...config.resolver.blockList,
  /(^|[/\\])\.local([/\\].*)?$/,
  /(^|[/\\])logs([/\\].*)?$/,
];

module.exports = config;
