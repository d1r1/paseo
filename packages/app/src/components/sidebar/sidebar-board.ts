import type {
  SidebarBoardRowInfo,
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import type { Board, BoardIssue } from "@/desktop/board/board-file";
import { ALL_BOARD_VIEW_KEY } from "@/stores/sidebar-collapsed-sections-store/state";

export { ALL_BOARD_VIEW_KEY };

/** The view that lists what needs the user (the Needs-you section) alone. Not a team. */
export const NEEDS_YOU_VIEW_KEY = "needs-you";

const ISSUE_TITLE_TOKEN = /^([A-Z][A-Z0-9]*-\d+)(?=\s|$)/;

export interface SidebarBoardRow<T> {
  workspace: T;
  info: SidebarBoardRowInfo;
}

/**
 * The Issue a workspace title names: a leading `TEAM-N` (an uppercase team key, a dash, digits)
 * followed by whitespace or the end. Whether the Issue is on the board is the caller's question.
 */
export function parseBoardIssueId(title: string): string | null {
  return ISSUE_TITLE_TOKEN.exec(title)?.[1] ?? null;
}

export interface BoardView {
  /** `ALL_BOARD_VIEW_KEY`, `NEEDS_YOU_VIEW_KEY`, or a team exactly as the board file spells it (`DSK`). */
  key: string;
  /** The segment label: the team lowercased (`dsk`), or `all` / `needs-you` for the caller to translate. */
  label: string;
}

/**
 * The views the sidebar filter offers: one per distinct `team` in the order the board file first
 * names them, then `all`, then the Needs-you view when `needsYou` is set. No team views for no
 * board, an unusable board or a board without an Issue; with `needsYou` unset that leaves no views
 * at all, so the filter is not shown when there is nothing to filter. With it set the views are
 * `all` and Needs-you at least, because the Needs-you section needs no board file.
 */
export function resolveBoardViews(
  board: Board | null,
  options: { needsYou?: boolean } = {},
): BoardView[] {
  const needsYou: BoardView[] = options.needsYou
    ? [{ key: NEEDS_YOU_VIEW_KEY, label: NEEDS_YOU_VIEW_KEY }]
    : [];
  if (!board || board.issues.length === 0 || !indexIssues(board)) {
    return needsYou.length === 0
      ? []
      : [{ key: ALL_BOARD_VIEW_KEY, label: ALL_BOARD_VIEW_KEY }, ...needsYou];
  }
  const teams: string[] = [];
  for (const issue of board.issues) {
    if (!teams.includes(issue.team)) teams.push(issue.team);
  }
  return [
    ...teams.map((team) => ({ key: team, label: team.toLowerCase() })),
    { key: ALL_BOARD_VIEW_KEY, label: ALL_BOARD_VIEW_KEY },
    ...needsYou,
  ];
}

/**
 * The view to show for a stored key: the key itself when `views` carries it, `all` otherwise. A
 * stored team the current file does not carry is resolved away here, never deleted, so it applies
 * again when the file carries it.
 */
export function resolveBoardView(views: readonly BoardView[], storedKey: string): string {
  return views.some((view) => view.key === storedKey) ? storedKey : ALL_BOARD_VIEW_KEY;
}

/**
 * The team a view filters by: null for `all` and for the Needs-you view, else the view key as the
 * file spells the team.
 */
export function boardViewTeam(viewKey: string): string | null {
  return viewKey === ALL_BOARD_VIEW_KEY || viewKey === NEEDS_YOU_VIEW_KEY ? null : viewKey;
}

export interface BoardViewLayout {
  /** The team the board block is cut to; null keeps every team. */
  team: string | null;
  /** A team view: the list is the board block alone. */
  boardOnly: boolean;
  /** The Needs-you view: the list is the Needs-you section alone, with no workspace row at all. */
  needsYouOnly: boolean;
}

/** What the view in effect does to the lists below the Needs-you section. */
export function resolveBoardViewLayout(viewKey: string): BoardViewLayout {
  const team = boardViewTeam(viewKey);
  return { team, boardOnly: team !== null, needsYouOnly: viewKey === NEEDS_YOU_VIEW_KEY };
}

/** The Issue's status, and its run step when it has one: `In Progress · challenge`. */
export function formatBoardCaption(board: Pick<SidebarBoardRowInfo, "status" | "step">): string {
  return board.step ? `${board.status} · ${board.step}` : board.status;
}

function indexIssues(board: Board): Map<string, BoardIssue> | null {
  const byId = new Map<string, BoardIssue>();
  for (const issue of board.issues) {
    if (byId.has(issue.id)) return null;
    byId.set(issue.id, issue);
  }
  for (const issue of board.issues) {
    const seen = new Set<string>([issue.id]);
    let parentId = issue.parent;
    while (parentId !== null) {
      if (seen.has(parentId)) return null;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parent ?? null;
    }
  }
  return byId;
}

function bySortOrder(left: BoardIssue, right: BoardIssue): number {
  return left.sortOrder - right.sortOrder;
}

/**
 * Orders the workspaces whose title names an Issue of the board: a parent's workspaces before its
 * sub-issues', siblings by ascending `sortOrder`, siblings with equal values in the order the board
 * file lists their Issues, several workspaces of one Issue in the order `workspaces` gives
 * (Array.sort is stable). Workspaces that match nothing are not
 * returned. An Issue without a workspace adds no row and no level, so its matched descendants
 * stay visible one level up.
 *
 * Each row names its matched ancestors, and the first row of an Issue that has a matched
 * descendant row is marked `hasChildren`; `applyBoardCollapse` reads both. Rows come out expanded.
 *
 * `team` keeps the rows of that team's Issues only: an Issue of another team adds no row and no
 * level, exactly as an Issue without a workspace, so `hasChildren` and depth are computed over the
 * rows that stay. Null, the default, keeps every team.
 *
 * An invalid board (a repeated Issue id or a parent cycle) matches nothing.
 */
export function projectSidebarBoard<T extends { name: string }>(input: {
  board: Board | null;
  workspaces: readonly T[];
  team?: string | null;
}): SidebarBoardRow<T>[] {
  if (!input.board) return [];
  const issuesById = indexIssues(input.board);
  if (!issuesById) return [];
  const team = input.team ?? null;

  const workspacesByIssueId = new Map<string, T[]>();
  for (const workspace of input.workspaces) {
    const issueId = parseBoardIssueId(workspace.name);
    if (issueId === null) continue;
    const issue = issuesById.get(issueId);
    if (!issue || (team !== null && issue.team !== team)) continue;
    const matched = workspacesByIssueId.get(issueId);
    if (matched) matched.push(workspace);
    else workspacesByIssueId.set(issueId, [workspace]);
  }
  if (workspacesByIssueId.size === 0) return [];

  const childrenByParentId = new Map<string, BoardIssue[]>();
  const roots: BoardIssue[] = [];
  for (const issue of input.board.issues) {
    if (issue.parent === null || !issuesById.has(issue.parent)) {
      roots.push(issue);
      continue;
    }
    const siblings = childrenByParentId.get(issue.parent);
    if (siblings) siblings.push(issue);
    else childrenByParentId.set(issue.parent, [issue]);
  }

  const rows: SidebarBoardRow<T>[] = [];
  // Returns whether the Issue or any descendant added a row.
  const visit = (
    issue: BoardIssue,
    depth: number,
    ancestorIssueIds: readonly string[],
  ): boolean => {
    const matched = workspacesByIssueId.get(issue.id) ?? [];
    const firstRowIndex = rows.length;
    for (const workspace of matched) {
      rows.push({
        workspace,
        info: {
          issueId: issue.id,
          depth,
          ancestorIssueIds,
          hasChildren: false,
          collapsed: false,
          status: issue.status,
          step: issue.run?.step ?? null,
        },
      });
    }
    const hasRows = matched.length > 0;
    const childDepth = hasRows ? depth + 1 : depth;
    const childAncestorIssueIds = hasRows ? [...ancestorIssueIds, issue.id] : ancestorIssueIds;
    let hasDescendantRows = false;
    for (const child of [...(childrenByParentId.get(issue.id) ?? [])].sort(bySortOrder)) {
      if (visit(child, childDepth, childAncestorIssueIds)) hasDescendantRows = true;
    }
    const firstRow = rows[firstRowIndex];
    if (hasRows && hasDescendantRows && firstRow) {
      rows[firstRowIndex] = { ...firstRow, info: { ...firstRow.info, hasChildren: true } };
    }
    return hasRows || hasDescendantRows;
  };
  for (const root of [...roots].sort(bySortOrder)) {
    visit(root, 0, []);
  }
  return rows;
}

const NO_COLLAPSED_ISSUE_IDS: ReadonlySet<string> = new Set();

/**
 * Hides the subtree of every collapsed Issue: a row goes when one of its matched ancestors is in
 * the set, and a row of a collapsed Issue itself stays, marked `collapsed`. An Issue without a row
 * is never an ancestor, so collapsing it hides nothing. An empty set returns `rows` itself.
 */
export function applyBoardCollapse<T>(
  rows: readonly SidebarBoardRow<T>[],
  collapsedIssueIds: ReadonlySet<string>,
): readonly SidebarBoardRow<T>[] {
  if (collapsedIssueIds.size === 0) return rows;
  const visible: SidebarBoardRow<T>[] = [];
  for (const row of rows) {
    if (row.info.ancestorIssueIds.some((issueId) => collapsedIssueIds.has(issueId))) continue;
    visible.push(
      collapsedIssueIds.has(row.info.issueId)
        ? { ...row, info: { ...row.info, collapsed: true } }
        : row,
    );
  }
  return visible;
}

const NO_BOARD_WORKSPACES: SidebarWorkspaceEntry[] = [];

export interface SidebarBoardSplit {
  /** The board block, in board order, each entry carrying its `board` info. */
  boardWorkspaces: SidebarWorkspaceEntry[];
  /**
   * `projects` without the workspaces the board took, and without a project the board emptied: one
   * that had workspaces and has none left would show only its header and its New workspace row.
   * A project that never had a workspace is not touched.
   */
  projects: SidebarProjectEntry[];
  /** `workspaceEntriesByKey` without the workspaces the board took. */
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
}

/**
 * Takes the workspaces the board orders out of the lists the sidebar already builds, so each shows
 * once. The stored project, workspace and pin orders are not touched (a project hidden here stays
 * in the stored order). The status grouping needs no such step: it groups `workspaceEntriesByKey`
 * and has no group without a row. With no usable board or no match it returns the inputs themselves, which is the sidebar as it was.
 *
 * `collapsedIssueIds` hides the rows under those Issues (`applyBoardCollapse`); a hidden row is
 * still the board's, so it does not go back to the lists below. `team` keeps one team's rows
 * (`projectSidebarBoard`); the other teams' workspaces are then not the board's and stay in the
 * lists below, which a team view does not show.
 */
export function splitSidebarBoard(input: {
  board: Board | null;
  projects: SidebarProjectEntry[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  collapsedIssueIds?: ReadonlySet<string>;
  team?: string | null;
}): SidebarBoardSplit {
  const rows = projectSidebarBoard({
    board: input.board,
    workspaces: input.projects.flatMap((project) =>
      project.workspaces.flatMap((placement) => {
        const entry = input.workspaceEntriesByKey.get(placement.workspaceKey);
        return entry ? [entry] : [];
      }),
    ),
    team: input.team,
  });
  if (rows.length === 0) {
    return {
      boardWorkspaces: NO_BOARD_WORKSPACES,
      projects: input.projects,
      workspaceEntriesByKey: input.workspaceEntriesByKey,
    };
  }
  const boardKeys = new Set(rows.map((row) => row.workspace.workspaceKey));
  const boardWorkspaces: SidebarWorkspaceEntry[] = [];
  for (const { workspace, info } of applyBoardCollapse(
    rows,
    input.collapsedIssueIds ?? NO_COLLAPSED_ISSUE_IDS,
  )) {
    boardWorkspaces.push({ ...workspace, board: info });
  }
  return {
    boardWorkspaces,
    projects: input.projects.flatMap((project) => {
      const workspaces = project.workspaces.filter(
        (workspace) => !boardKeys.has(workspace.workspaceKey),
      );
      if (workspaces.length === 0 && project.workspaces.length > 0) return [];
      return [{ ...project, workspaces }];
    }),
    workspaceEntriesByKey: new Map(
      [...input.workspaceEntriesByKey].filter(([workspaceKey]) => !boardKeys.has(workspaceKey)),
    ),
  };
}
