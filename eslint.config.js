// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    rules: {
      // Legitimate in this codebase: mount-time fetch, prop→form sync, reset on scope change.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
