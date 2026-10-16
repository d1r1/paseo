import type { Board } from "@/desktop/board/board-file";

/**
 * Desk's board for the sidebar. Only the desktop app has one; its implementation is
 * `use-sidebar-board.electron.ts`, which Metro picks for the Electron build. Everywhere else the
 * sidebar has no board and is exactly what it is without one.
 */
export function useSidebarBoard(_input: { enabled: boolean }): Board | null {
  return null;
}
