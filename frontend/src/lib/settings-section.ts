// One-shot deep link into a Profile-page section tab. A page that wants to
// land the user on a specific tab (e.g. Tailor's "set up tailoring" CTA →
// Profile → Tailor) records it here right before navigate("/profile"); the
// Profile page consumes it on mount.

export type SettingsSection = "profile" | "jobs" | "tailoring" | "notifications" | "operations";

let pending: SettingsSection | null = null;

export function setPendingSettingsSection(section: SettingsSection): void {
  pending = section;
}

export function consumePendingSettingsSection(): SettingsSection | null {
  const value = pending;
  pending = null;
  return value;
}
