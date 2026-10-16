/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Board } from "@/desktop/board/board-file";

const state = vi.hoisted(() => ({
  boardFilePath: "/desk/board.json",
}));
const loadBoardFile = vi.hoisted(() => vi.fn());

vi.mock("@/desktop/board/board-file", () => ({ loadBoardFile }));
vi.mock("@/desktop/settings/desktop-settings", () => ({
  useDesktopSettings: () => ({ settings: { boardFilePath: state.boardFilePath } }),
}));

import { BOARD_REFRESH_INTERVAL_MS, useSidebarBoard } from "./use-sidebar-board.electron";

function boardOf(generatedAt: string): Board {
  return { generatedAt, issues: [] };
}

function createWrapper() {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe("useSidebarBoard", () => {
  beforeEach(() => {
    state.boardFilePath = "/desk/board.json";
    loadBoardFile.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the configured path as soon as it is active", async () => {
    loadBoardFile.mockResolvedValue(boardOf("t1"));

    const { result } = renderHook(() => useSidebarBoard({ enabled: true }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current).toEqual(boardOf("t1")));
    expect(loadBoardFile).toHaveBeenCalledWith("/desk/board.json");
  });

  it("reads nothing with no path or while inactive", async () => {
    loadBoardFile.mockResolvedValue(boardOf("t1"));
    const wrapper = createWrapper();

    state.boardFilePath = "";
    const noPath = renderHook(() => useSidebarBoard({ enabled: true }), { wrapper });
    state.boardFilePath = "/desk/board.json";
    const inactive = renderHook(() => useSidebarBoard({ enabled: false }), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(noPath.result.current).toBeNull();
    expect(inactive.result.current).toBeNull();
    expect(loadBoardFile).not.toHaveBeenCalled();
  });

  it("refreshes every 60 seconds while active and stops when unmounted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loadBoardFile.mockResolvedValueOnce(boardOf("t1")).mockResolvedValue(boardOf("t2"));

    const { result, unmount } = renderHook(() => useSidebarBoard({ enabled: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("t1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_INTERVAL_MS + 100);
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("t2")));
    const callsWhileMounted = loadBoardFile.mock.calls.length;

    unmount();
    await vi.advanceTimersByTimeAsync(BOARD_REFRESH_INTERVAL_MS * 3);
    expect(loadBoardFile.mock.calls.length).toBe(callsWhileMounted);
  });

  it("drops the board when a later read fails and shows it again after a later success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loadBoardFile
      .mockResolvedValueOnce(boardOf("t1"))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(boardOf("t3"));

    const { result } = renderHook(() => useSidebarBoard({ enabled: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("t1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_INTERVAL_MS + 100);
    });
    await waitFor(() => expect(result.current).toBeNull());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_INTERVAL_MS + 100);
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("t3")));
  });

  it("drops the board when a later read throws", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    loadBoardFile.mockResolvedValueOnce(boardOf("t1")).mockRejectedValueOnce(new Error("ipc down"));

    const { result } = renderHook(() => useSidebarBoard({ enabled: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("t1")));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOARD_REFRESH_INTERVAL_MS + 100);
    });

    await waitFor(() => expect(result.current).toBeNull());
  });

  it("shows no board while the new path is read, and never the old path's board", async () => {
    let resolveSecond: (board: Board | null) => void = () => {};
    loadBoardFile.mockImplementation((path: string) =>
      path === "/desk/board.json"
        ? Promise.resolve(boardOf("old"))
        : new Promise<Board | null>((resolve) => {
            resolveSecond = resolve;
          }),
    );

    const { result, rerender } = renderHook(() => useSidebarBoard({ enabled: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("old")));

    state.boardFilePath = "/other/board.json";
    rerender();
    expect(result.current).toBeNull();

    await act(async () => {
      resolveSecond(boardOf("new"));
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("new")));
  });

  it("returns to no board when the path is cleared", async () => {
    loadBoardFile.mockResolvedValue(boardOf("t1"));
    const { result, rerender } = renderHook(() => useSidebarBoard({ enabled: true }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current).toEqual(boardOf("t1")));

    state.boardFilePath = "";
    rerender();

    expect(result.current).toBeNull();
  });
});
