internal import Expo

/// iOS 27 won't launch an app built with its SDK unless the app uses the
/// scene life cycle. Expo's base class creates the window from the scene,
/// starts React Native in it, and passes links and activities on to the
/// app delegate. Expo's SDK 58 template ships this file; SDK 57's doesn't,
/// so it's added here by hand.
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
