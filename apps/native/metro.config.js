// Expo monorepo layout: watch the whole workspace, resolve hoisted packages
// from the root, and force one React/Query instance (Bun's isolated install
// gives shared packages their own peer-resolved copies).
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

const singletons = ["react", "react-dom", "@tanstack/react-query"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (singletons.some((name) => moduleName === name || moduleName.startsWith(`${name}/`))) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, "index.ts") },
      moduleName,
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
