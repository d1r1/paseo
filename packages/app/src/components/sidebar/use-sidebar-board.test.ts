/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSidebarBoard } from "./use-sidebar-board";

describe("useSidebarBoard outside the desktop app", () => {
  it("has no board, active or not, and needs no query client or settings", () => {
    const active = renderHook(() => useSidebarBoard({ enabled: true }));
    const inactive = renderHook(() => useSidebarBoard({ enabled: false }));

    expect(active.result.current).toBeNull();
    expect(inactive.result.current).toBeNull();
  });
});
