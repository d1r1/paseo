import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { STATUS_BUCKET_ORDER } from "@/hooks/sidebar-status-view-model";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

/** The buckets the state page offers, most urgent first, as the status groups list them. */
export const SIDEBAR_STATE_FILTER_BUCKETS: readonly SidebarStateBucket[] = STATUS_BUCKET_ORDER;

/**
 * Applies the State page's selection to the sidebar's workspace entries.
 *
 * `statusBucket` is already the workspace's aggregated bucket, so this is a plain allowlist over
 * it. An empty selection means every state.
 */
export function filterWorkspacesByState(input: {
  workspaces: readonly SidebarWorkspaceEntry[];
  states: readonly SidebarStateBucket[];
}): SidebarWorkspaceEntry[] {
  const { workspaces, states } = input;
  if (states.length === 0) return [...workspaces];
  const included = new Set(states);
  return workspaces.filter((workspace) => included.has(workspace.statusBucket));
}

/**
 * Narrows the project list and the entries to the selected states, for every group mode alike.
 *
 * Like the label filter, the state filter can only ask about workspaces, so a project it empties
 * has nothing left to show and is dropped. With no state selected both inputs come back as they
 * are, which keeps their references stable for the memos downstream.
 */
export function applyStateFilter(input: {
  projects: SidebarProjectEntry[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  states: readonly SidebarStateBucket[];
}): {
  projects: SidebarProjectEntry[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
} {
  const { projects, workspaceEntriesByKey, states } = input;
  if (states.length === 0) return { projects, workspaceEntriesByKey };
  const kept = filterWorkspacesByState({
    workspaces: [...workspaceEntriesByKey.values()],
    states,
  });
  const keptByKey = new Map(kept.map((workspace) => [workspace.workspaceKey, workspace]));
  return {
    projects: projects.flatMap((project) => {
      const workspaces = project.workspaces.filter((workspace) =>
        keptByKey.has(workspace.workspaceKey),
      );
      return workspaces.length > 0 ? [{ ...project, workspaces }] : [];
    }),
    workspaceEntriesByKey: keptByKey,
  };
}
