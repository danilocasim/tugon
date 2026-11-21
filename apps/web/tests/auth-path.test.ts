import { describe, expect, it } from "vitest";
import { portalReturnPath } from "@/lib/auth-path";

describe("login return paths", () => {
  it("preserves the selected resident report category", () => {
    expect(portalReturnPath("resident", "/resident/report?category=infra")).toBe("/resident/report?category=infra");
  });

  it.each(["//outside.invalid/resident", "/\\outside.invalid/resident", "https://outside.invalid/resident", "/resident/../barangay", "/residential", "/resident/signin?next=/resident/report", "\n/resident/report"])("falls back on unsafe or looping path %s", (path) => {
    expect(portalReturnPath("resident", path)).toBe("/resident");
  });

  it("does not move a staff login into the resident or tanod portal", () => {
    expect(portalReturnPath("staff", "/tanod/schedule")).toBe("/barangay");
    expect(portalReturnPath("staff", "/barangay/admin?tab=privacy")).toBe("/barangay/admin?tab=privacy");
  });
});
