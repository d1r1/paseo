import type {
  SidebarBoardRowInfo,
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/sidebar-workspaces-view-model";
import type { Board, BoardIssue } from "@/desktop/board/board-file";

const ISSUE_TITLE_TOKEN = /^(DSK-\d+)(?=\s|$)/;

export interface SidebarBoardRow<T> {
  workspace: T;
  info: SidebarBoardRowInfo;
}

/** The Issue a workspace title names: a leading `DSK-N` followed by whitespace or the end. */
export function parseBoardIssueId(title: string): string | null {
  return ISSUE_TITLE_TOKEN.exec(title)?.[1] ?? null;
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
 * An invalid board (a repeated Issue id or a parent cycle) matches nothing.
 */
export function projectSidebarBoard<T extends { name: string }>(input: {
  board: Board | null;
  workspaces: readonly T[];
}): SidebarBoardRow<T>[] {
  if (!input.board) return [];
  const issuesById = indexIssues(input.board);
  if (!issuesById) return [];

  const workspacesByIssueId = new Map<string, T[]>();
  for (const workspace of input.workspaces) {
    const issueId = parseBoardIssueId(workspace.name);
    if (issueId === null || !issuesById.has(issueId)) continue;
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
  const visit = (issue: BoardIssue, depth: number): void => {
    const matched = workspacesByIssueId.get(issue.id) ?? [];
    for (const workspace of matched) {
      rows.push({
        workspace,
        info: { issueId: issue.id, depth, status: issue.status, step: issue.run?.step ?? null },
      });
    }
    const childDepth = matched.length > 0 ? depth + 1 : depth;
    for (const child of [...(childrenByParentId.get(issue.id) ?? [])].sort(bySortOrder)) {
      visit(child, childDepth);
    }
  };
  for (const root of [...roots].sort(bySortOrder)) {
    visit(root, 0);
  }
  return rows;
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
 */
export function splitSidebarBoard(input: {
  board: Board | null;
  projects: SidebarProjectEntry[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
}): SidebarBoardSplit {
  const rows = projectSidebarBoard({
    board: input.board,
    workspaces: input.projects.flatMap((project) =>
      project.workspaces.flatMap((placement) => {
        const entry = input.workspaceEntriesByKey.get(placement.workspaceKey);
        return entry ? [entry] : [];
      }),
    ),
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
  for (const { workspace, info } of rows) {
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
