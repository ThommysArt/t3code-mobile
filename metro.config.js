const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

const projectRoot = __dirname;
const workspaceRoot = projectRoot;
const workspacePackagesRoot = path.resolve(workspaceRoot, "packages");

const config = getDefaultConfig(projectRoot);

// This repo is a pnpm workspace (`packages/*`). Metro must crawl the workspace
// package sources and the root node_modules tree so SHA-1 lookups succeed for
// files resolved through pnpm's `.pnpm` store (including @expo/cli polyfills).
const watchFolders = new Set([
  ...(config.watchFolders ?? []),
  projectRoot,
  workspacePackagesRoot,
  path.resolve(projectRoot, "modules"),
  path.resolve(projectRoot, "node_modules"),
]);
config.watchFolders = [...watchFolders];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  ...((config.resolver.nodeModulesPaths ?? []).filter(
    (entry) => path.resolve(entry) !== path.resolve(projectRoot, "node_modules")
  ) ?? []),
];

// pnpm relies on symlinks into node_modules/.pnpm/<pkg>@<hash>/...
// Keep symlink resolution on so realpaths stay under watchFolders.
config.resolver.unstable_enableSymlinks = true;

config.resolver.assetExts = [...(config.resolver.assetExts ?? []), "wasm"];

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./uniwind-types.d.ts",
  polyfills: { rem: 16 },
});
