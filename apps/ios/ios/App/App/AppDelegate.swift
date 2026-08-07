import UIKit
import Capacitor
import AuthenticationServices
import SafariServices
import Security

class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        if let scrollView = webView?.scrollView {
            scrollView.bounces = true
            scrollView.alwaysBounceVertical = true
        }

        // iOS 26 automatically adds a soft scroll-edge fade above scroll views.
        // pinkslip renders its own web navigation, so the effect becomes an
        // unexplained gray gradient across the status-bar safe area.
        if #available(iOS 26.0, *) {
            webView?.scrollView.topEdgeEffect.isHidden = true
        }

        // App-local plugins are NOT auto-discovered (Capacitor only auto-registers
        // plugins from capacitor.config.json's packageClassList). And
        // registerPluginType() is a no-op while autoRegisterPlugins is true (the
        // default). registerPluginInstance() has no such guard — use it here.
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(ApplicationBrowserPlugin())
        bridge?.registerPluginInstance(NativeActionMenuPlugin())
        bridge?.registerPluginInstance(NativeAppearancePlugin())
        bridge?.registerPluginInstance(SecureSessionPlugin())
    }
}

private struct NativeActionMenuItem {
    let id: String
    let title: String
    let symbol: String?
    let destructive: Bool
    let disabled: Bool
}

private final class NativeActionMenuButton: UIButton {
    var onMenuEnd: (() -> Void)?

    override func contextMenuInteraction(
        _ interaction: UIContextMenuInteraction,
        willEndFor configuration: UIContextMenuConfiguration,
        animator: (any UIContextMenuInteractionAnimating)?
    ) {
        super.contextMenuInteraction(interaction, willEndFor: configuration, animator: animator)
        guard let animator else {
            onMenuEnd?()
            return
        }
        animator.addCompletion { [weak self] in self?.onMenuEnd?() }
    }
}

@available(iOS 17.4, *)
private final class NativeActionMenuPresenter: NSObject {
    private weak var sourceView: UIView?
    private let sourceRect: CGRect
    private let items: [NativeActionMenuItem]
    private let onSelect: (String) -> Void
    private let onFinish: (NativeActionMenuPresenter) -> Void
    private var button: NativeActionMenuButton?
    private var selectionSent = false
    private var finished = false

    init(
        sourceView: UIView,
        sourceRect: CGRect,
        items: [NativeActionMenuItem],
        onSelect: @escaping (String) -> Void,
        onFinish: @escaping (NativeActionMenuPresenter) -> Void
    ) {
        self.sourceView = sourceView
        self.sourceRect = sourceRect
        self.items = items
        self.onSelect = onSelect
        self.onFinish = onFinish
        super.init()
    }

    func present() {
        guard let sourceView else {
            complete()
            return
        }
        let actions = items.map { item in
            var attributes: UIMenuElement.Attributes = []
            if item.destructive { attributes.insert(.destructive) }
            if item.disabled { attributes.insert(.disabled) }
            return UIAction(
                title: item.title,
                image: item.symbol.flatMap(UIImage.init(systemName:)),
                identifier: UIAction.Identifier(item.id),
                attributes: attributes
            ) { [weak self] _ in
                self?.select(item.id)
            }
        }
        let button = NativeActionMenuButton(frame: sourceRect)
        button.backgroundColor = .clear
        button.isAccessibilityElement = false
        button.menu = UIMenu(children: actions)
        button.showsMenuAsPrimaryAction = true
        button.onMenuEnd = { [weak self] in
            self?.complete()
        }
        sourceView.addSubview(button)
        self.button = button
        button.performPrimaryAction()
    }

    func dismiss() {
        guard let button else {
            complete()
            return
        }
        button.contextMenuInteraction?.dismissMenu()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.complete()
        }
    }

    private func select(_ id: String) {
        guard !selectionSent else { return }
        selectionSent = true
        onSelect(id)
        button?.contextMenuInteraction?.dismissMenu()
    }

    private func complete() {
        guard !finished else { return }
        finished = true
        button?.removeFromSuperview()
        button = nil
        onFinish(self)
    }
}

private final class NativeActionMenuCallState {
    private let call: CAPPluginCall
    private var resolved = false

    init(call: CAPPluginCall) {
        self.call = call
    }

    func resolve(_ id: String? = nil) {
        guard !resolved else { return }
        resolved = true
        if let id { call.resolve(["id": id]) }
        else { call.resolve([:]) }
    }
}

@objc(NativeActionMenuPlugin)
public class NativeActionMenuPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeActionMenuPlugin"
    public let jsName = "NativeActionMenu"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)
    ]

    private var activePresenter: NSObject?
    private weak var activeAlert: UIAlertController?

    @objc func present(_ call: CAPPluginCall) {
        guard let source = call.getObject("source"),
              let rawActions = call.getArray("actions", JSObject.self),
              !rawActions.isEmpty else {
            call.reject("A source rectangle and at least one action are required.")
            return
        }

        let items = rawActions.compactMap { action -> NativeActionMenuItem? in
            guard let id = action["id"] as? String,
                  let title = action["title"] as? String,
                  !id.isEmpty,
                  !title.isEmpty else { return nil }
            return NativeActionMenuItem(
                id: id,
                title: title,
                symbol: action["symbol"] as? String,
                destructive: action["destructive"] as? Bool ?? false,
                disabled: action["disabled"] as? Bool ?? false
            )
        }
        guard !items.isEmpty else {
            call.reject("At least one valid action is required.")
            return
        }

        let sourceRect = CGRect(
            x: (source["x"] as? NSNumber)?.doubleValue ?? 0,
            y: (source["y"] as? NSNumber)?.doubleValue ?? 0,
            width: max(1, (source["width"] as? NSNumber)?.doubleValue ?? 1),
            height: max(1, (source["height"] as? NSNumber)?.doubleValue ?? 1)
        )

        DispatchQueue.main.async { [weak self] in
            guard let self,
                  let presenter = self.bridge?.viewController,
                  let webView = self.bridge?.webView else {
                call.reject("The native action menu is unavailable.")
                return
            }

            if #available(iOS 17.4, *) {
                (self.activePresenter as? NativeActionMenuPresenter)?.dismiss()
                let callState = NativeActionMenuCallState(call: call)
                let menuPresenter = NativeActionMenuPresenter(
                    sourceView: webView,
                    sourceRect: sourceRect,
                    items: items,
                    onSelect: { id in callState.resolve(id) },
                    onFinish: { [weak self] finishedPresenter in
                        if (self?.activePresenter as? NativeActionMenuPresenter) === finishedPresenter {
                            self?.activePresenter = nil
                        }
                        callState.resolve()
                    }
                )
                self.activePresenter = menuPresenter
                menuPresenter.present()
                return
            }

            self.activeAlert?.dismiss(animated: false)
            let alert = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
            for item in items {
                let action = UIAlertAction(
                    title: item.title,
                    style: item.destructive ? .destructive : .default
                ) { _ in call.resolve(["id": item.id]) }
                action.isEnabled = !item.disabled
                alert.addAction(action)
            }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in call.resolve([:]) })
            alert.popoverPresentationController?.sourceView = webView
            alert.popoverPresentationController?.sourceRect = sourceRect
            self.activeAlert = alert
            presenter.present(alert, animated: true)
        }
    }
}

@objc(NativeAppearancePlugin)
public class NativeAppearancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAppearancePlugin"
    public let jsName = "NativeAppearance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTheme", returnType: CAPPluginReturnPromise)
    ]

    @objc func setTheme(_ call: CAPPluginCall) {
        guard let theme = call.getString("theme"), theme == "dark" || theme == "light" else {
            call.reject("A light or dark theme is required.")
            return
        }

        let color = theme == "dark"
            ? UIColor(red: 14 / 255, green: 14 / 255, blue: 16 / 255, alpha: 1)
            : UIColor(red: 251 / 255, green: 250 / 255, blue: 249 / 255, alpha: 1)

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("The native appearance bridge is unavailable.")
                return
            }

            let webView = self.bridge?.webView
            webView?.backgroundColor = color
            webView?.scrollView.backgroundColor = color
            webView?.underPageBackgroundColor = color
            self.bridge?.viewController?.view.backgroundColor = color
            self.bridge?.viewController?.view.window?.backgroundColor = color
            call.resolve()
        }
    }
}

@objc(SecureSessionPlugin)
public class SecureSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureSessionPlugin"
    public let jsName = "SecureSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise)
    ]

    private let account = "native-session"
    private var service: String { Bundle.main.bundleIdentifier ?? "dev.alip.pinkslip" }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve([:])
            return
        }
        guard status == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8) else {
            call.reject("Could not read the secure session.", "KEYCHAIN_READ_FAILED")
            return
        }
        call.resolve(["token": token])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty,
              let data = token.data(using: .utf8) else {
            call.reject("A session token is required.")
            return
        }

        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecItemNotFound {
            var item = baseQuery
            attributes.forEach { item[$0.key] = $0.value }
            let addStatus = SecItemAdd(item as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                call.reject("Could not save the secure session.", "KEYCHAIN_WRITE_FAILED")
                return
            }
        } else if updateStatus != errSecSuccess {
            call.reject("Could not update the secure session.", "KEYCHAIN_WRITE_FAILED")
            return
        }
        call.resolve()
    }

    @objc func clear(_ call: CAPPluginCall) {
        let status = SecItemDelete(baseQuery as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("Could not clear the secure session.", "KEYCHAIN_DELETE_FAILED")
            return
        }
        call.resolve()
    }
}

@objc(ApplicationBrowserPlugin)
public class ApplicationBrowserPlugin: CAPPlugin, CAPBridgedPlugin, SFSafariViewControllerDelegate {
    public let identifier = "ApplicationBrowserPlugin"
    public let jsName = "ApplicationBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private var browser: SFSafariViewController?

    @objc func open(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url"),
              let url = URL(string: rawURL),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else {
            call.reject("A valid HTTP or HTTPS application URL is required.")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self,
                  let presenter = self.bridge?.viewController else {
                call.reject("The application browser is unavailable.")
                return
            }

            let presentFreshBrowser = { [weak self, weak presenter] in
                guard let self, let presenter else {
                    call.reject("The application browser is unavailable.")
                    return
                }

                let configuration = SFSafariViewController.Configuration()
                configuration.entersReaderIfAvailable = false
                configuration.barCollapsingEnabled = true
                let browser = SFSafariViewController(url: url, configuration: configuration)
                browser.delegate = self
                browser.dismissButtonStyle = .done
                self.browser = browser
                presenter.present(browser, animated: true) {
                    call.resolve()
                }
            }

            // A new controller per application avoids the stale singleton state
            // that can leave Capacitor's stock Browser plugin unable to present
            // after a previous application sheet has been dismissed.
            if let existing = self.browser {
                self.browser = nil
                if existing.presentingViewController != nil {
                    existing.dismiss(animated: false, completion: presentFreshBrowser)
                } else {
                    presentFreshBrowser()
                }
            } else {
                presentFreshBrowser()
            }
        }
    }

    public func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
        if browser === controller {
            browser = nil
        }
        notifyListeners("finished", data: [:])
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
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    // Forward the APNs device token to the Capacitor push-notifications plugin.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
