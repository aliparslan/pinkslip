import ExpoNotifications
import Security
import UIKit
import UserNotifications

/// Save, Queue and Hide on a job alert (owner, 2026-11-08). They happen where
/// the alert is, with the app left closed, so this calls the API itself: iOS
/// doesn't run JavaScript for a button press, and expo-notifications ends the
/// callback at once, so a background task holds the app open for the request.
/// The set and action names match shared/job-alerts.ts.
final class AlertActions: NotificationDelegate {
  static let shared = AlertActions()

  private enum Action: String {
    case save = "alert_save"
    case queue = "alert_queue"
    case hide = "alert_hide"

    /// A send fetches the job's form before it answers.
    var timeout: TimeInterval { self == .queue ? 25 : 15 }
    var verb: String {
      switch self {
      case .save: return "save"
      case .queue: return "queue"
      case .hide: return "hide"
      }
    }
  }

  private let apiKey = "pinkslip.alert-actions.api-url"
  private let productionApi = "https://pinkslip.work/api/v2"

  func remember(apiUrl: String) {
    UserDefaults.standard.set(apiUrl, forKey: apiKey)
  }

  /// The two sets of buttons, here rather than in JavaScript because
  /// expo-notifications can't give a button its icon. Merged with what's
  /// registered already, so the "Apply for you?" buttons stay. `authenticationRequired`
  /// has iOS unlock the phone first, which also frees the session token.
  func registerButtons() {
    func button(_ action: Action, _ title: String, _ icon: UNNotificationActionIcon) -> UNNotificationAction {
      UNNotificationAction(identifier: action.rawValue, title: title, options: [.authenticationRequired], icon: icon)
    }
    let save = button(.save, "Save", UNNotificationActionIcon(systemImageName: "bookmark"))
    // Pinkslip's own bot, the image the in-app menus use (Images.xcassets).
    let queue = button(.queue, "Queue", UNNotificationActionIcon(templateImageName: "menu-bot"))
    let hide = button(.hide, "Hide", UNNotificationActionIcon(systemImageName: "eye.slash"))
    let sets = [
      UNNotificationCategory(identifier: "job_alert", actions: [save, hide], intentIdentifiers: []),
      UNNotificationCategory(identifier: "job_alert_queue", actions: [save, queue, hide], intentIdentifiers: [])
    ]
    let center = UNUserNotificationCenter.current()
    center.getNotificationCategories { existing in
      let names = Set(sets.map(\.identifier))
      center.setNotificationCategories(existing.filter { !names.contains($0.identifier) }.union(sets))
    }
  }

  func didReceive(_ response: UNNotificationResponse, completionHandler: @escaping () -> Void) -> Bool {
    guard let action = Action(rawValue: response.actionIdentifier) else { return false }
    let content = response.notification.request.content
    guard let jobId = jobId(in: content.userInfo) else { return false }
    run(action, jobId: jobId, company: content.title)
    // NotificationCenterManager calls completionHandler once every delegate has returned.
    return true
  }

  private func jobId(in userInfo: [AnyHashable: Any]) -> String? {
    let nested = (userInfo["body"] as? [String: Any])?["job_ids"] as? [String]
    return (userInfo["job_ids"] as? [String])?.first ?? nested?.first
  }

  private func run(_ action: Action, jobId: String, company: String) {
    let application = UIApplication.shared
    var task = UIBackgroundTaskIdentifier.invalid
    let finish = {
      guard task != .invalid else { return }
      application.endBackgroundTask(task)
      task = .invalid
    }
    task = application.beginBackgroundTask(withName: "pinkslip-alert-action", expirationHandler: finish)

    guard let request = request(for: action, jobId: jobId) else {
      tell(action, jobId: jobId, company: company, reason: nil)
      finish()
      return
    }
    URLSession.shared.dataTask(with: request) { [self] data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      if !(200..<300).contains(status) {
        tell(action, jobId: jobId, company: company, reason: refusal(in: data, status: status))
      }
      DispatchQueue.main.async(execute: finish)
    }.resume()
  }

  private func request(for action: Action, jobId: String) -> URLRequest? {
    guard let token = token() else { return nil }
    let base = UserDefaults.standard.string(forKey: apiKey) ?? productionApi
    let path: String
    let method: String
    let body: [String: Any]
    switch action {
    case .save:
      (path, method, body) = ("/jobs/\(jobId)", "PATCH", ["saved": true])
    case .hide:
      (path, method, body) = ("/jobs/\(jobId)", "PATCH", ["dismissed": true])
    case .queue:
      (path, method, body) = ("/apply/sends", "POST", ["job_id": jobId, "dry_run": false])
    }
    guard let url = URL(string: base + path), let json = try? JSONSerialization.data(withJSONObject: body) else {
      return nil
    }
    var request = URLRequest(url: url, timeoutInterval: action.timeout)
    request.httpMethod = method
    request.httpBody = json
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("ios", forHTTPHeaderField: "X-Pinkslip-Client")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return request
  }

  /// The session token as expo-secure-store keeps it (SecureStoreModule.swift).
  /// It's readable only while the phone is unlocked, which is why the buttons
  /// ask for that.
  private func token() -> String? {
    let key = Data("pinkslip-native-token".utf8)
    for service in ["app:no-auth", "app"] {
      let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: service,
        kSecAttrGeneric as String: key,
        kSecAttrAccount as String: key,
        kSecMatchLimit as String: kSecMatchLimitOne,
        kSecReturnData as String: true
      ]
      var item: CFTypeRef?
      if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data {
        return String(data: data, encoding: .utf8)
      }
    }
    return nil
  }

  /// What Pinkslip said no with (the send limit, a closed job). Only a
  /// refusal: a server error's text isn't written for people.
  private func refusal(in data: Data?, status: Int) -> String? {
    guard (400..<500).contains(status), status != 401, let data,
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return nil }
    return object["error"] as? String
  }

  /// A button gives no other sign, so a failure needs saying. Tapping this
  /// opens the job, where it can be done by hand.
  private func tell(_ action: Action, jobId: String, company: String, reason: String?) {
    let content = UNMutableNotificationContent()
    content.title = "Couldn't \(action.verb) \(company)"
    content.body = reason ?? "Open Pinkslip to try again."
    content.userInfo = ["url": "/jobs/\(jobId)", "job_ids": [jobId]]
    let request = UNNotificationRequest(identifier: "alert-action-\(jobId)", content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request)
  }
}
