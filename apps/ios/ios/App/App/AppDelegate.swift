import UIKit
import Capacitor
import AuthenticationServices
import SafariServices
import Security
import WebKit

private func pinkslipSurfaceColor(for style: UIUserInterfaceStyle) -> UIColor {
    style == .dark
        ? UIColor(red: 14 / 255, green: 14 / 255, blue: 16 / 255, alpha: 1)
        : UIColor(red: 251 / 255, green: 250 / 255, blue: 249 / 255, alpha: 1)
}

class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        let initialSurface = pinkslipSurfaceColor(for: traitCollection.userInterfaceStyle)
        view.backgroundColor = initialSurface
        view.window?.backgroundColor = initialSurface
        webView?.backgroundColor = initialSurface
        webView?.scrollView.backgroundColor = initialSurface
        webView?.underPageBackgroundColor = initialSurface

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
        bridge?.registerPluginInstance(ApplicationFillerPlugin())
        bridge?.registerPluginInstance(NativeActionMenuPlugin())
        bridge?.registerPluginInstance(NativeAccessibilityPlugin())
        bridge?.registerPluginInstance(NativeAppearancePlugin())
        bridge?.registerPluginInstance(NativeSettingsPlugin())
        bridge?.registerPluginInstance(SecureSessionPlugin())
    }
}

@objc(NativeAccessibilityPlugin)
public class NativeAccessibilityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAccessibilityPlugin"
    public let jsName = "NativeAccessibility"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPreferences", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: UIContentSizeCategory.didChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: UIAccessibility.darkerSystemColorsStatusDidChangeNotification,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(preferencesDidChange),
            name: UIAccessibility.reduceMotionStatusDidChangeNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func normalizedContentSize(_ category: UIContentSizeCategory) -> String {
        switch category {
        case .extraSmall: return "xs"
        case .small: return "small"
        case .medium: return "medium"
        case .large: return "large"
        case .extraLarge: return "xl"
        case .extraExtraLarge: return "xxl"
        case .extraExtraExtraLarge: return "xxxl"
        case .accessibilityMedium: return "accessibility-medium"
        case .accessibilityLarge: return "accessibility-large"
        case .accessibilityExtraLarge: return "accessibility-xl"
        case .accessibilityExtraExtraLarge: return "accessibility-xxl"
        case .accessibilityExtraExtraExtraLarge: return "accessibility-xxxl"
        default: return "large"
        }
    }

    private func currentPreferences() -> [String: Any] {
        [
            "contentSize": normalizedContentSize(UIApplication.shared.preferredContentSizeCategory),
            "increasedContrast": UIAccessibility.isDarkerSystemColorsEnabled,
            "reducedMotion": UIAccessibility.isReduceMotionEnabled
        ]
    }

    @objc private func preferencesDidChange() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.notifyListeners("preferencesChanged", data: self.currentPreferences())
        }
    }

    @objc func getPreferences(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.reject("Native accessibility preferences are unavailable.")
                return
            }
            call.resolve(self.currentPreferences())
        }
    }
}

@objc(NativeSettingsPlugin)
public class NativeSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeSettingsPlugin"
    public let jsName = "NativeSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise)
    ]

    @objc func openAppSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("The app settings URL is unavailable.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("Could not open this app’s settings.") }
            }
        }
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

        let color = pinkslipSurfaceColor(for: theme == "dark" ? .dark : .light)

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

/// Opens an application form in a web view the app can drive: `run` executes
/// a script in the page and returns its JSON result, and "loaded" fires after
/// each page load. The app reads, fills, and submits through these.
@objc(ApplicationFillerPlugin)
public class ApplicationFillerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ApplicationFillerPlugin"
    public let jsName = "ApplicationFiller"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "run", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    private weak var navigation: UINavigationController?
    private weak var filler: ApplicationFillerViewController?

    @objc func open(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url"),
              let url = URL(string: rawURL),
              url.scheme?.lowercased() == "https" else {
            call.reject("A valid HTTPS application URL is required.")
            return
        }
        let script = call.getString("script") ?? ""

        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else {
                call.reject("The application browser is unavailable.")
                return
            }
            let filler = ApplicationFillerViewController(
                url: url,
                script: script,
                onLoaded: { [weak self] loaded in
                    self?.notifyListeners("loaded", data: ["url": loaded.absoluteString])
                },
                onRefill: { [weak self] in
                    self?.notifyListeners("refill", data: [:])
                },
                onFinished: { [weak self] in
                    self?.notifyListeners("finished", data: [:])
                }
            )
            let navigation = UINavigationController(rootViewController: filler)
            // Over, not instead of: a full-screen modal takes the app's web view
            // out of the window, iOS then suspends it, and the fill it drives
            // stalls until the form is closed.
            navigation.modalPresentationStyle = .overFullScreen
            let present = {
                presenter.present(navigation, animated: true) { call.resolve() }
            }
            if let existing = self.navigation, existing.presentingViewController != nil {
                existing.dismiss(animated: false, completion: present)
            } else {
                present()
            }
            self.navigation = navigation
            self.filler = filler
        }
    }

    /// Runs `script` as the body of an async function in the form page and
    /// resolves with what it returns, which must be a string (JSON).
    @objc func run(_ call: CAPPluginCall) {
        guard let script = call.getString("script") else {
            call.reject("A script is required.")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let filler = self?.filler else {
                call.reject("The application browser is closed.", "CLOSED")
                return
            }
            filler.run(script) { result in
                switch result {
                case .success(let value):
                    call.resolve(["value": value as? String ?? ""])
                case .failure(let error):
                    call.reject(error.localizedDescription, "SCRIPT_FAILED")
                }
            }
        }
    }

    @objc func setStatus(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        DispatchQueue.main.async { [weak self] in
            self?.filler?.navigationItem.title = text.isEmpty ? nil : text
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.filler?.closeFromApp()
            call.resolve()
        }
    }
}

final class ApplicationFillerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private static let reportHandler = "pinkslipAutofill"

    private let url: URL
    private let script: String
    private let onLoaded: (URL) -> Void
    private let onRefill: () -> Void
    private let onFinished: () -> Void
    private var webView: WKWebView?
    private var finished = false

    init(
        url: URL,
        script: String,
        onLoaded: @escaping (URL) -> Void,
        onRefill: @escaping () -> Void,
        onFinished: @escaping () -> Void
    ) {
        self.url = url
        self.script = script
        self.onLoaded = onLoaded
        self.onRefill = onRefill
        self.onFinished = onFinished
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        let contentController = WKUserContentController()
        if !script.isEmpty {
            contentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }
        contentController.add(WeakScriptMessageHandler(self), name: Self.reportHandler)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])
        self.webView = webView

        navigationItem.title = url.host
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(close)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "Fill", style: .plain, target: self, action: #selector(fillAgain)
        )

        webView.load(URLRequest(url: url))
    }

    func run(_ source: String, completion: @escaping (Result<Any?, Error>) -> Void) {
        guard let webView else {
            completion(.failure(NSError(domain: "ApplicationFiller", code: 1)))
            return
        }
        webView.callAsyncJavaScript(source, arguments: [:], in: nil, in: .page) { result in
            completion(result.map { $0 })
        }
    }

    @objc private func close() {
        dismiss(animated: true) { [weak self] in self?.finish() }
    }

    func closeFromApp() {
        close()
    }

    /// Asks the app to read and fill again, for fields that appeared after the
    /// page loaded. The legacy injected script reruns too.
    @objc private func fillAgain() {
        if !script.isEmpty { webView?.evaluateJavaScript(script, completionHandler: nil) }
        onRefill()
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.reportHandler)
        onFinished()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let loaded = webView.url { onLoaded(loaded) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let report = message.body as? [String: Any],
              let filled = report["filled"] as? Int,
              let total = report["total"] as? Int else { return }
        navigationItem.title = "Filled \(filled) of \(total)"
    }

    /// Links that open a new window load here instead.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil { webView.load(navigationAction.request) }
        return nil
    }
}

/// WKUserContentController retains its handlers; this keeps it from retaining
/// the view controller.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
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
