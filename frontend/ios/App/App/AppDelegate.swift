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
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // Forward the APNs device token to the Capacitor push-notifications plugin.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
