/** Joins module class names, skipping empty values. Kit components accept a
 * `className` only where a parent needs to place them (layout containers). */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
