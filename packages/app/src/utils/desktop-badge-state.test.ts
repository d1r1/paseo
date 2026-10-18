import { describe, expect, it } from "vitest";
import { deriveMacDockBadgeCount } from "./desktop-badge-state";

describe("desktop-badge-state", () => {
  it("shows no badge when nothing needs the user", () => {
    expect(deriveMacDockBadgeCount(0)).toBeUndefined();
  });

  it("shows the Needs-you row count", () => {
    expect(deriveMacDockBadgeCount(1)).toBe(1);
    expect(deriveMacDockBadgeCount(7)).toBe(7);
  });
});
