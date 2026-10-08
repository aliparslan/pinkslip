/* Links from alerts and the web use the web's paths. Jobs keep theirs;
   Library became Track; anything else opens the feed. */
export function appPath(path: string): string | null {
  if (!path.startsWith("/")) return null;
  if (path === "/" || /^\/jobs\/[^/]+$/.test(path)) return path;
  if (path.startsWith("/library") || path.startsWith("/track")) return "/track";
  return "/";
}
