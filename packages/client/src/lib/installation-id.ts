const NATIVE_INSTALLATION_ID_KEY = "pinkslip-native-installation-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface InstallationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * A stable, non-secret identity for one native app installation. APNs tokens
 * can rotate; tying them to this value lets the backend replace the old token
 * without mistaking the same phone for a second notification destination.
 */
export function nativeInstallationId(
  storage: InstallationStorage = localStorage,
  createId: () => string = () => crypto.randomUUID(),
): string {
  const stored = storage.getItem(NATIVE_INSTALLATION_ID_KEY)?.trim();
  if (stored && UUID_PATTERN.test(stored)) return stored;

  const created = createId();
  if (!UUID_PATTERN.test(created)) {
    throw new Error("Could not create a valid installation identifier");
  }
  storage.setItem(NATIVE_INSTALLATION_ID_KEY, created);
  return created;
}
