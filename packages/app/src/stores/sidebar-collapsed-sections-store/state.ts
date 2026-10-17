import { z } from "zod";

/**
 * The board view that shows the sidebar as it was, with every team's rows; the one a team view
 * falls back to, and the one whose collapsed set the pre-view store field becomes.
 */
export const ALL_BOARD_VIEW_KEY = "all";

export interface CollapsedProjectsState {
  collapsedProjectKeys: Set<string>;
  collapsedWorkspaceGroupKeys: Set<string>;
  /**
   * Issues of Desk's board block (`TEAM-N`) whose sub-issue rows are hidden, per board view
   * (`all` or a team key). Each view keeps its own set: collapsing in one view leaves the others
   * as they were. A view without an entry has nothing collapsed.
   */
  collapsedBoardIssueIdsByView: Map<string, Set<string>>;
  collapsedPinned: boolean;
}

export interface PersistedCollapsedProjects {
  collapsedProjectKeys?: string[];
  collapsedWorkspaceGroupKeys?: string[];
  collapsedStatusGroupKeys?: string[];
  collapsedBoardIssueIds?: string[];
  collapsedBoardIssueIdsByView?: Record<string, string[]>;
  collapsedPinned?: boolean;
}

export const PersistedCollapsedProjectsSchema: z.ZodType<PersistedCollapsedProjects> =
  z.strictObject({
    collapsedProjectKeys: z.array(z.string()).optional(),
    collapsedWorkspaceGroupKeys: z.array(z.string()).optional(),
    // COMPAT(sidebarWorkspaceGroupCollapse): added in v0.4.0, remove after 2027-02-14.
    collapsedStatusGroupKeys: z.array(z.string()).optional(),
    // COMPAT(boardCollapseByView): added in the fork after v0.11.4, remove after 2026-12-31. The
    // one set DSK-37 stored is read as the `all` view's when the per-view record is absent.
    collapsedBoardIssueIds: z.array(z.string()).optional(),
    collapsedBoardIssueIdsByView: z.record(z.string(), z.array(z.string())).optional(),
    collapsedPinned: z.boolean().optional(),
  });

const NO_COLLAPSED_BOARD_ISSUE_IDS: ReadonlySet<string> = new Set();

/** The collapsed Issue ids of one board view; one shared empty set for a view without any. */
export function collapsedBoardIssueIdsForView(
  state: Pick<CollapsedProjectsState, "collapsedBoardIssueIdsByView">,
  viewKey: string,
): ReadonlySet<string> {
  return state.collapsedBoardIssueIdsByView.get(viewKey) ?? NO_COLLAPSED_BOARD_ISSUE_IDS;
}

export function togglePinnedCollapsed(state: CollapsedProjectsState): CollapsedProjectsState {
  return { ...state, collapsedPinned: !state.collapsedPinned };
}

export function toggleProjectCollapsed(
  state: CollapsedProjectsState,
  projectKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  if (next.has(projectKey)) {
    next.delete(projectKey);
  } else {
    next.add(projectKey);
  }
  return { ...state, collapsedProjectKeys: next };
}

export function toggleWorkspaceGroupCollapsed(
  state: CollapsedProjectsState,
  workspaceGroupKey: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedWorkspaceGroupKeys);
  if (next.has(workspaceGroupKey)) {
    next.delete(workspaceGroupKey);
  } else {
    next.add(workspaceGroupKey);
  }
  return { ...state, collapsedWorkspaceGroupKeys: next };
}

export function toggleBoardIssueCollapsed(
  state: CollapsedProjectsState,
  viewKey: string,
  issueId: string,
): CollapsedProjectsState {
  const next = new Set(state.collapsedBoardIssueIdsByView.get(viewKey));
  if (next.has(issueId)) {
    next.delete(issueId);
  } else {
    next.add(issueId);
  }
  const byView = new Map(state.collapsedBoardIssueIdsByView);
  if (next.size === 0) {
    byView.delete(viewKey);
  } else {
    byView.set(viewKey, next);
  }
  return { ...state, collapsedBoardIssueIdsByView: byView };
}

export function setProjectCollapsed(
  state: CollapsedProjectsState,
  projectKey: string,
  collapsed: boolean,
): CollapsedProjectsState {
  const next = new Set(state.collapsedProjectKeys);
  if (collapsed) {
    next.add(projectKey);
  } else {
    next.delete(projectKey);
  }
  return { ...state, collapsedProjectKeys: next };
}

export function serializeCollapsedProjects(state: CollapsedProjectsState): {
  collapsedProjectKeys: string[];
  collapsedWorkspaceGroupKeys: string[];
  collapsedBoardIssueIdsByView: Record<string, string[]>;
  collapsedPinned: boolean;
} {
  return {
    collapsedProjectKeys: Array.from(state.collapsedProjectKeys),
    collapsedWorkspaceGroupKeys: Array.from(state.collapsedWorkspaceGroupKeys),
    collapsedBoardIssueIdsByView: Object.fromEntries(
      Array.from(state.collapsedBoardIssueIdsByView, ([viewKey, issueIds]) => [
        viewKey,
        Array.from(issueIds),
      ]),
    ),
    collapsedPinned: state.collapsedPinned,
  };
}

function readPersistedBoardIssueIdsByView(
  persisted: PersistedCollapsedProjects,
  current: Map<string, Set<string>>,
): Map<string, Set<string>> {
  if (persisted.collapsedBoardIssueIdsByView) {
    return deserializeCollapsedKeysByView(persisted.collapsedBoardIssueIdsByView);
  }
  // COMPAT(boardCollapseByView): added in the fork after v0.11.4, remove after 2026-12-31.
  if (persisted.collapsedBoardIssueIds) {
    return deserializeCollapsedKeysByView({
      [ALL_BOARD_VIEW_KEY]: persisted.collapsedBoardIssueIds,
    });
  }
  return current;
}

export function mergePersistedCollapsedProjects<S extends CollapsedProjectsState>(
  persistedValue: unknown,
  current: S,
): S {
  const result = PersistedCollapsedProjectsSchema.safeParse(persistedValue);
  if (!result.success) {
    return current;
  }
  const persisted = result.data;
  const restoredProjects = deserializeCollapsedKeys(
    persisted.collapsedProjectKeys ?? Array.from(current.collapsedProjectKeys),
  );
  const restoredWorkspaceGroups = deserializeCollapsedKeys(
    persisted.collapsedWorkspaceGroupKeys ??
      persisted.collapsedStatusGroupKeys ??
      Array.from(current.collapsedWorkspaceGroupKeys),
  );
  const restoredBoardIssuesByView = readPersistedBoardIssueIdsByView(
    persisted,
    current.collapsedBoardIssueIdsByView,
  );
  const restoredPinned = persisted.collapsedPinned ?? current.collapsedPinned;
  if (
    areSetsEqual(current.collapsedProjectKeys, restoredProjects) &&
    areSetsEqual(current.collapsedWorkspaceGroupKeys, restoredWorkspaceGroups) &&
    areSetMapsEqual(current.collapsedBoardIssueIdsByView, restoredBoardIssuesByView) &&
    current.collapsedPinned === restoredPinned
  ) {
    return current;
  }
  return {
    ...current,
    collapsedProjectKeys: restoredProjects,
    collapsedWorkspaceGroupKeys: restoredWorkspaceGroups,
    collapsedBoardIssueIdsByView: restoredBoardIssuesByView,
    collapsedPinned: restoredPinned,
  };
}

function deserializeCollapsedKeys(value: string[]): Set<string> {
  return new Set(value);
}

/** A view whose stored list is empty gets no entry, as `toggleBoardIssueCollapsed` keeps none. */
function deserializeCollapsedKeysByView(value: Record<string, string[]>): Map<string, Set<string>> {
  const byView = new Map<string, Set<string>>();
  for (const [viewKey, issueIds] of Object.entries(value)) {
    if (issueIds.length > 0) byView.set(viewKey, new Set(issueIds));
  }
  return byView;
}

function areSetMapsEqual(left: Map<string, Set<string>>, right: Map<string, Set<string>>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [key, leftSet] of left) {
    const rightSet = right.get(key);
    if (!rightSet || !areSetsEqual(leftSet, rightSet)) {
      return false;
    }
  }
  return true;
}

function areSetsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}
