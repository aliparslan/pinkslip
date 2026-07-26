import type { RoleId } from "./search-profile";

const RELATED_ROLES: Record<RoleId, readonly RoleId[]> = {
  software_engineering: ["frontend", "backend", "full_stack", "mobile", "data_engineering", "machine_learning", "infrastructure", "security"],
  frontend: ["full_stack", "software_engineering", "mobile", "design"],
  backend: ["full_stack", "software_engineering", "infrastructure", "data_engineering", "security"],
  full_stack: ["frontend", "backend", "software_engineering", "design"],
  mobile: ["frontend", "software_engineering", "full_stack"],
  data_engineering: ["backend", "infrastructure", "machine_learning", "software_engineering"],
  machine_learning: ["data_engineering", "backend", "software_engineering"],
  product_management: ["technical_program_management", "design"],
  technical_program_management: ["product_management", "software_engineering", "infrastructure"],
  infrastructure: ["backend", "security", "data_engineering", "software_engineering"],
  security: ["infrastructure", "backend", "software_engineering"],
  design: ["frontend", "full_stack", "product_management"],
};

/**
 * A small, explicit role graph. Exact primary matches stay strongest, selected
 * secondary roles remain strong, and credible neighboring roles are allowed to
 * compete without pretending they are exact matches.
 */
export function roleAffinity(
  candidate: RoleId,
  primaryRole: RoleId,
  selectedRoles: readonly RoleId[]
): number {
  if (candidate === primaryRole) return 1;
  if (selectedRoles.includes(candidate)) return 0.9;
  if (RELATED_ROLES[primaryRole].includes(candidate)) return 0.75;
  if (selectedRoles.some((selected) => RELATED_ROLES[selected].includes(candidate))) return 0.65;
  return 0;
}

export function closestSelectedRole(
  candidate: RoleId,
  primaryRole: RoleId,
  selectedRoles: readonly RoleId[]
): RoleId | null {
  if (candidate === primaryRole || RELATED_ROLES[primaryRole].includes(candidate)) return primaryRole;
  return selectedRoles.find((selected) => selected === candidate || RELATED_ROLES[selected].includes(candidate)) ?? null;
}
