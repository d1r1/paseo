import { describe, expect, it } from "vitest";
import { reconcileFirstSeen } from "./needs-you-first-seen";

describe("reconcileFirstSeen", () => {
  it("records a new key at the time it was first seen", () => {
    expect(reconcileFirstSeen(new Map(), ["run:DSK-1"], 100)).toEqual(
      new Map([["run:DSK-1", 100]]),
    );
  });

  it("keeps a key's first time while it stays pending", () => {
    const first = reconcileFirstSeen(new Map(), ["a"], 100);
    const second = reconcileFirstSeen(first, ["a", "b"], 200);
    expect(second).toEqual(
      new Map([
        ["a", 100],
        ["b", 200],
      ]),
    );
  });

  it("drops a key when it clears", () => {
    const seen = new Map([
      ["a", 100],
      ["b", 100],
    ]);
    expect(reconcileFirstSeen(seen, ["b"], 300)).toEqual(new Map([["b", 100]]));
  });

  it("gives a re-appearing key a new time", () => {
    const gone = reconcileFirstSeen(new Map([["a", 100]]), [], 200);
    expect(gone.size).toBe(0);
    expect(reconcileFirstSeen(gone, ["a"], 300)).toEqual(new Map([["a", 300]]));
  });

  it("returns the same map when nothing changed", () => {
    const seen = new Map([["a", 100]]);
    expect(reconcileFirstSeen(seen, ["a"], 500)).toBe(seen);
    expect(reconcileFirstSeen(seen, ["a", "a"], 500)).toBe(seen);
  });
});
