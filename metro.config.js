const { getDefaultConfig } = require('expo/metro-config');
const {
  installMetroPollWatch,
} = require('./scripts/metro-virtfs-poll-watch.cjs');

// Vagrant VirtioFS / UTM 9p do not deliver host inotify events into the guest.
// Metro's Linux FallbackWatcher is fs.watch-only, so Fast Refresh never fires
// until a full reload. Poll watch no-ops on a local disk.
installMetroPollWatch(__dirname);

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

// react-native-gifted-charts' shared LinearGradient helper does a
// `require('react-native-linear-gradient')` first and only falls back to
// `expo-linear-gradient` inside a try/catch. Metro resolves that static
// require at bundle time even though it is never taken, so alias it to the
// installed expo-linear-gradient to keep `pnpm web` / `pnpm export` from
// failing on the unresolved peer.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName === 'react-native-linear-gradient') {
    return resolve(context, 'expo-linear-gradient', platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
