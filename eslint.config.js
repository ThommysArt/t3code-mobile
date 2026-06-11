const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: [
      "dist/*",
      ".expo/*",
      "node_modules/*",
      "packages/*",
      "expo-env.d.ts",
      "uniwind-types.d.ts",
    ],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
