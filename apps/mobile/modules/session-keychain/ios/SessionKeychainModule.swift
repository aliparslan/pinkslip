import ExpoModulesCore
import Security

/// The session token in the Keychain. It uses the same service and account
/// as the Capacitor app's SecureSession plugin did, so updating from that app
/// keeps whoever was signed in signed in.
public class SessionKeychainModule: Module {
  private let account = "native-session"

  private var service: String {
    Bundle.main.bundleIdentifier ?? "dev.alip.pinkslip"
  }

  private var baseQuery: [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
  }

  public func definition() -> ModuleDefinition {
    Name("SessionKeychain")

    AsyncFunction("get") { () -> String? in
      var query = self.baseQuery
      query[kSecReturnData as String] = true
      query[kSecMatchLimit as String] = kSecMatchLimitOne
      var result: CFTypeRef?
      let status = SecItemCopyMatching(query as CFDictionary, &result)
      guard status == errSecSuccess, let data = result as? Data else {
        return nil
      }
      return String(data: data, encoding: .utf8)
    }

    AsyncFunction("set") { (token: String) throws in
      guard !token.isEmpty, let data = token.data(using: .utf8) else {
        throw KeychainException(errSecParam)
      }
      let attributes: [String: Any] = [
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
      ]
      let updateStatus = SecItemUpdate(self.baseQuery as CFDictionary, attributes as CFDictionary)
      if updateStatus == errSecItemNotFound {
        var item = self.baseQuery
        for (key, value) in attributes {
          item[key] = value
        }
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        if addStatus != errSecSuccess {
          throw KeychainException(addStatus)
        }
      } else if updateStatus != errSecSuccess {
        throw KeychainException(updateStatus)
      }
    }

    AsyncFunction("clear") { () -> Void in
      _ = SecItemDelete(self.baseQuery as CFDictionary)
    }
  }
}

internal final class KeychainException: GenericException<OSStatus> {
  override var reason: String {
    "The Keychain returned status \(param)."
  }
}
