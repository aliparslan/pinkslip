import ExpoModulesCore
import ExpoNotifications

public class AlertActionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AlertActions")

    Function("configure") { (apiUrl: String) in
      AlertActions.shared.remember(apiUrl: apiUrl)
    }
  }
}

/// Registers at launch, before any JavaScript runs: pressing a button with
/// the app closed starts it in the background just long enough to handle it.
public class AlertActionsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    NotificationCenterManager.shared.addDelegate(AlertActions.shared)
    AlertActions.shared.registerButtons()
    return true
  }
}
