import { loadBoardFile, type Board } from "@/desktop/board/board-file";
import { useFetchQuery } from "@/data/query";
import { useDesktopSettings } from "@/desktop/settings/desktop-settings";

export const BOARD_REFRESH_INTERVAL_MS = 60_000;

/**
 * Desk's board, read from the path in the desktop settings; null whenever there is none to show:
 * with no path, while `enabled` is false, and after a failed read. A failed read
 * keeps no board over, so the sidebar falls back to its own order until a later read succeeds.
 *
 * The path is part of the query key and nothing is kept for a key nobody observes (`gcTime: 0`), so
 * an answer read for an earlier path can never be shown for the current one.
 *
 * This is the Electron build of the hook. Web and native resolve `use-sidebar-board.ts`, which
 * reads nothing, so those sidebars never touch the desktop settings or the query client.
 */
export function useSidebarBoard({ enabled }: { enabled: boolean }): Board | null {
  const { settings } = useDesktopSettings();
  const path = settings.boardFilePath;
  const active = enabled && path !== "";
  const query = useFetchQuery<Board | null>({
    queryKey: ["sidebar-board-file", path],
    queryFn: () => loadBoardFile(path),
    dataShape: "value",
    staleTimeMs: 0,
    enabled: active,
    refetchInterval: BOARD_REFRESH_INTERVAL_MS,
    gcTime: 0,
    retry: false,
  });
  if (!active || query.isError) return null;
  return query.data ?? null;
}
