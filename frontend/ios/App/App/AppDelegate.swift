import UIKit
import Capacitor
import AuthenticationServices

class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // App-local plugins are NOT auto-discovered (Capacitor only auto-registers
        // plugins from capacitor.config.json's packageClassList). And
        // registerPluginType() is a no-op while autoRegisterPlugins is true (the
        // default). registerPluginInstance() has no such guard — use it here.
        bridge?.registerPluginInstance(AppleSignInPlugin())
    }
}

@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var activeCall: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        guard #available(iOS 13.0, *) else {
            call.unavailable("Sign in with Apple requires iOS 13 or later.")
            return
        }

        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]

        if let state = call.getString("state"), !state.isEmpty {
            request.state = state
        }
        if let nonce = call.getString("nonce"), !nonce.isEmpty {
            request.nonce = nonce
        }

        activeCall = call
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    @available(iOS 13.0, *)
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = activeCall else { return }
        defer { activeCall = nil }

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            call.reject("Apple sign-in did not return an Apple ID credential.")
            return
        }

        let identityToken = credential.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        guard let identityToken else {
            call.reject("Apple sign-in did not return an identity token.")
            return
        }

        let authorizationCode = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        let givenName = credential.fullName?.givenName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let familyName = credential.fullName?.familyName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let fullName = [givenName, familyName].filter { !$0.isEmpty }.joined(separator: " ")

        call.resolve([
            "identityToken": identityToken,
            "authorizationCode": authorizationCode ?? "",
            "user": credential.user,
            "email": credential.email ?? "",
            "fullName": fullName,
            "state": credential.state ?? ""
        ])
    }

    @available(iOS 13.0, *)
    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { activeCall = nil }
        // User dismissing the sheet isn't a failure — tag it so the web layer can
        // silently ignore it instead of surfacing an error.
        if let authError = error as? ASAuthorizationError,
           authError.code == .canceled || authError.code == .unknown {
            activeCall?.reject("Sign in with Apple was canceled.", "CANCELED")
            return
        }
        activeCall?.reject(error.localizedDescription)
    }

    @available(iOS 13.0, *)
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    // Forward the APNs device token to the Capacitor push-notifications plugin.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
