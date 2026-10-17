import { useEffect } from "react";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";

/**
 * Publishes what the sidebar's keyboard shortcuts act on: the numbered workspace targets and
 * the board view keys, both in the order the sidebar shows them.
 */
export function WorkspaceShortcutTargetsSubscriber({ enabled }: { enabled: boolean }) {
  const { shortcutModel, boardViews } = useSidebarModel();
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets,
  );
  const setBoardViewKeys = useKeyboardShortcutsStore((state) => state.setBoardViewKeys);

  useEffect(() => {
    if (!enabled) {
      setSidebarShortcutWorkspaceTargets([]);
      return;
    }

    setSidebarShortcutWorkspaceTargets(shortcutModel.shortcutTargets);
  }, [enabled, setSidebarShortcutWorkspaceTargets, shortcutModel.shortcutTargets]);

  useEffect(() => {
    if (!enabled) {
      setBoardViewKeys([]);
      return;
    }

    setBoardViewKeys(boardViews.map((view) => view.key));
  }, [boardViews, enabled, setBoardViewKeys]);

  useEffect(() => {
    return () => {
      setSidebarShortcutWorkspaceTargets([]);
      setBoardViewKeys([]);
    };
  }, [setBoardViewKeys, setSidebarShortcutWorkspaceTargets]);

  return null;
}
