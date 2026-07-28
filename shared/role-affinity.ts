import type { RoleId } from "./search-profile";

const RELATED_ROLES: Record<RoleId, readonly RoleId[]> = {
  software_engineering: ["frontend", "backend", "full_stack", "mobile", "data_engineering", "machine_learning", "infrastructure", "security"],
  frontend: ["full_stack", "software_engineering", "mobile"],
  backend: ["full_stack", "software_engineering", "infrastructure", "data_engineering", "security"],
  full_stack: ["frontend", "backend", "software_engineering"],
  mobile: ["frontend", "software_engineering", "full_stack"],
  data_engineering: ["backend", "infrastructure", "machine_learning", "software_engineering"],
  machine_learning: ["data_engineering", "backend", "software_engineering"],
  research: [],
  infrastructure: ["backend", "security", "data_engineering", "software_engineering"],
  security: ["infrastructure", "backend", "software_engineering"],
};

/**
 * A small, explicit role graph. Exact primary matches stay strongest, selected
 * secondary roles remain strong, and credible neighboring roles are allowed to
 * compete without pretending they are exact matches.
 */
export function roleAffinity(
  candidate: RoleId,
  _primaryRole: RoleId,
  selectedRoles: readonly RoleId[]
): number {
  if (selectedRoles.includes(candidate)) return 1;
  if (selectedRoles.some((selected) => RELATED_ROLES[selected].includes(candidate))) return 0.75;
  return 0;
}

export function closestSelectedRole(
  candidate: RoleId,
  _primaryRole: RoleId,
  selectedRoles: readonly RoleId[]
): RoleId | null {
  return selectedRoles.find((selected) => selected === candidate)
    ?? selectedRoles.find((selected) => RELATED_ROLES[selected].includes(candidate))
    ?? null;
}
