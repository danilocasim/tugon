export type Portal = "resident" | "staff" | "tanod";

export const PORTAL_ROOT: Record<Portal, string> = { resident: "/resident", staff: "/barangay", tanod: "/tanod" };
const ORIGIN = "https://tugon.invalid";

export function portalReturnPath(portal: Portal, input: unknown) {
  const root = PORTAL_ROOT[portal];
  if (typeof input !== "string" || !input.startsWith("/") || /[\\\u0000-\u001f\u007f]/u.test(input)) return root;
  let url: URL;
  try { url = new URL(input, ORIGIN); } catch { return root; }
  if (url.origin !== ORIGIN || !(url.pathname === root || url.pathname.startsWith(`${root}/`))) return root;
  if (url.pathname === `${root}/signin` || url.pathname.startsWith(`${root}/signin/`)) return root;
  return `${url.pathname}${url.search}${url.hash}`;
}
