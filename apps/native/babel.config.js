// Unistyles rewrites StyleSheet.create calls under src/ so styles follow the
// theme and runtime (appearance, Dynamic Type) without re-rendering.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [["react-native-unistyles/plugin", { root: "src" }]],
  };
};
