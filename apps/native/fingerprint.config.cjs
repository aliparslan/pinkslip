// Inputs to the native fingerprint that over-the-air updates match on. Scripts
// in package.json and the EAS project id don't change native code, so editing
// them shouldn't strand installed builds.
/** @type {import('expo/fingerprint').Config} */
module.exports = {
  sourceSkips: ["PackageJsonScriptsAll", "ExpoConfigEASProject"],
};
