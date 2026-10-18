import { describe, expect, it } from "vitest";
import type { Board, BoardIssue } from "@/desktop/board/board-file";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import {
  ALL_BOARD_VIEW_KEY,
  applyBoardCollapse,
  boardViewTeam,
  formatBoardCaption,
  NEEDS_YOU_VIEW_KEY,
  parseBoardIssueId,
  projectSidebarBoard,
  resolveBoardView,
  resolveBoardViewLayout,
  resolveBoardViews,
  splitSidebarBoard,
  type SidebarBoardRow,
} from "./sidebar-board";

function issue(id: string, overrides: Partial<Omit<BoardIssue, "id">> = {}): BoardIssue {
  return {
    id,
    title: `Title of ${id}`,
    team: "DSK",
    status: "Todo",
    parent: null,
    sortOrder: 0,
    run: null,
    ...overrides,
  };
}

function board(...issues: BoardIssue[]): Board {
  return { generatedAt: "2026-10-16T19:40:02Z", issues };
}

function ws(name: string, key = name) {
  return { name, key };
}

function ids(rows: readonly SidebarBoardRow<{ key: string }>[]): string[] {
  return rows.map((row) => row.workspace.key);
}

describe("parseBoardIssueId", () => {
  it.each([
    ["DSK-34 sidebar board", "DSK-34"],
    ["DSK-34", "DSK-34"],
    ["DSK-34\tfork", "DSK-34"],
    ["FLU-12 other team", "FLU-12"],
    ["X1-7 a team key with a digit", "X1-7"],
  ])("reads the leading token of %j", (title, expected) => {
    expect(parseBoardIssueId(title)).toBe(expected);
  });

  it.each([
    ["feat/dsk-34-sidebar"],
    ["notes on DSK-34"],
    ["DSK-345x"],
    ["DSK-34-fork"],
    ["DSK-"],
    ["-34 no team"],
    ["1A-34 team key starting with a digit"],
    ["dsk-34 lowercase"],
    [" DSK-34 leading space"],
    [""],
  ])("reads no token from %j", (title) => {
    expect(parseBoardIssueId(title)).toBeNull();
  });
});

describe("resolveBoardViews", () => {
  it("offers one view per team in file order, then all", () => {
    expect(resolveBoardViews(board(issue("DSK-1"), issue("DSK-2")))).toEqual([
      { key: "DSK", label: "dsk" },
      { key: ALL_BOARD_VIEW_KEY, label: "all" },
    ]);
    expect(
      resolveBoardViews(
        board(
          issue("DSK-1"),
          issue("FLU-1", { team: "FLU" }),
          issue("DSK-2"),
          issue("FLU-2", { team: "FLU" }),
        ),
      ),
    ).toEqual([
      { key: "DSK", label: "dsk" },
      { key: "FLU", label: "flu" },
      { key: ALL_BOARD_VIEW_KEY, label: "all" },
    ]);
  });

  it("keeps the team key as the file spells it", () => {
    expect(resolveBoardViews(board(issue("Per-1", { team: "Per" })))).toEqual([
      { key: "Per", label: "per" },
      { key: ALL_BOARD_VIEW_KEY, label: "all" },
    ]);
  });

  it.each([
    ["no board", null],
    ["an empty board", board()],
    ["a board with a repeated id", board(issue("DSK-1"), issue("DSK-1"))],
    ["a board with a parent cycle", board(issue("DSK-1", { parent: "DSK-1" }))],
  ])("offers no view for %s", (_label, unusable) => {
    expect(resolveBoardViews(unusable)).toEqual([]);
  });

  it("is as before when needsYou is omitted or false", () => {
    const withTeams = board(issue("DSK-1"), issue("FLU-1", { team: "FLU" }));
    expect(resolveBoardViews(withTeams, {})).toEqual(resolveBoardViews(withTeams));
    expect(resolveBoardViews(withTeams, { needsYou: false })).toEqual(resolveBoardViews(withTeams));
    expect(resolveBoardViews(null, { needsYou: false })).toEqual([]);
  });

  it("appends the Needs-you view after the team views and all", () => {
    const withTeams = board(issue("DSK-1"), issue("FLU-1", { team: "FLU" }));
    expect(resolveBoardViews(withTeams, { needsYou: true })).toEqual([
      { key: "DSK", label: "dsk" },
      { key: "FLU", label: "flu" },
      { key: ALL_BOARD_VIEW_KEY, label: ALL_BOARD_VIEW_KEY },
      { key: NEEDS_YOU_VIEW_KEY, label: NEEDS_YOU_VIEW_KEY },
    ]);
  });

  it.each([
    ["no board", null],
    ["an empty board", board()],
    ["a board with a repeated id", board(issue("DSK-1"), issue("DSK-1"))],
  ])("offers all and Needs-you for %s", (_label, unusable) => {
    expect(resolveBoardViews(unusable, { needsYou: true })).toEqual([
      { key: ALL_BOARD_VIEW_KEY, label: ALL_BOARD_VIEW_KEY },
      { key: NEEDS_YOU_VIEW_KEY, label: NEEDS_YOU_VIEW_KEY },
    ]);
  });
});

describe("resolveBoardView", () => {
  const views = resolveBoardViews(board(issue("DSK-1"), issue("FLU-1", { team: "FLU" })));

  it("keeps a stored key the views carry", () => {
    expect(resolveBoardView(views, "DSK")).toBe("DSK");
    expect(resolveBoardView(views, "FLU")).toBe("FLU");
    expect(resolveBoardView(views, ALL_BOARD_VIEW_KEY)).toBe(ALL_BOARD_VIEW_KEY);
  });

  it("falls back to all for a team the views do not carry, a lowercase key, or no views", () => {
    expect(resolveBoardView(views, "PER")).toBe(ALL_BOARD_VIEW_KEY);
    expect(resolveBoardView(views, "dsk")).toBe(ALL_BOARD_VIEW_KEY);
    expect(resolveBoardView([], "DSK")).toBe(ALL_BOARD_VIEW_KEY);
  });

  it("names the team a view filters by, and none for all", () => {
    expect(boardViewTeam("DSK")).toBe("DSK");
    expect(boardViewTeam(ALL_BOARD_VIEW_KEY)).toBeNull();
  });

  it("is not a team: the Needs-you view filters by none", () => {
    expect(boardViewTeam(NEEDS_YOU_VIEW_KEY)).toBeNull();
  });

  it("keeps a stored Needs-you view where the views carry it, else resolves it to all", () => {
    const withNeedsYou = resolveBoardViews(board(issue("DSK-1")), { needsYou: true });
    expect(resolveBoardView(withNeedsYou, NEEDS_YOU_VIEW_KEY)).toBe(NEEDS_YOU_VIEW_KEY);
    expect(resolveBoardView(views, NEEDS_YOU_VIEW_KEY)).toBe(ALL_BOARD_VIEW_KEY);
    expect(resolveBoardView([], NEEDS_YOU_VIEW_KEY)).toBe(ALL_BOARD_VIEW_KEY);
  });
});

describe("resolveBoardViewLayout", () => {
  it("keeps every list for all", () => {
    expect(resolveBoardViewLayout(ALL_BOARD_VIEW_KEY)).toEqual({
      team: null,
      boardOnly: false,
      needsYouOnly: false,
    });
  });

  it("cuts a team view to the board block alone", () => {
    expect(resolveBoardViewLayout("DSK")).toEqual({
      team: "DSK",
      boardOnly: true,
      needsYouOnly: false,
    });
  });

  it("makes the Needs-you view the Needs-you section alone, not a board team", () => {
    expect(resolveBoardViewLayout(NEEDS_YOU_VIEW_KEY)).toEqual({
      team: null,
      boardOnly: false,
      needsYouOnly: true,
    });
  });
});

describe("formatBoardCaption", () => {
  it("shows the status alone, or the status and the run step", () => {
    expect(formatBoardCaption({ status: "Backlog", step: null })).toBe("Backlog");
    expect(formatBoardCaption({ status: "In Progress", step: "challenge" })).toBe(
      "In Progress · challenge",
    );
  });
});

describe("projectSidebarBoard", () => {
  const feature = board(
    issue("DSK-34", { status: "In Progress", sortOrder: 100 }),
    issue("DSK-36", {
      parent: "DSK-34",
      status: "In Progress",
      sortOrder: 412.5,
      run: { state: "waiting", step: "challenge", waitsForUser: true },
    }),
    issue("DSK-37", { parent: "DSK-34", status: "Backlog", sortOrder: -80.25 }),
    issue("DSK-38", {
      parent: "DSK-34",
      status: "Todo",
      sortOrder: 3,
      run: { state: "running", step: null, waitsForUser: false },
    }),
  );

  it("lists a Feature's workspace first and its sub-issues' under it by ascending sortOrder", () => {
    const rows = projectSidebarBoard({
      board: feature,
      workspaces: [
        ws("DSK-36 sidebar reads board"),
        ws("DSK-38 filters"),
        ws("DSK-34 board feature"),
        ws("DSK-37 collapse"),
      ],
    });

    expect(ids(rows)).toEqual([
      "DSK-34 board feature",
      "DSK-37 collapse",
      "DSK-38 filters",
      "DSK-36 sidebar reads board",
    ]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 1, 1, 1]);
  });

  it("carries the status and the run step, and a null step or null run shows status alone", () => {
    const rows = projectSidebarBoard({
      board: feature,
      workspaces: [ws("DSK-34 a"), ws("DSK-36 b"), ws("DSK-37 c"), ws("DSK-38 d")],
    });

    expect(rows.map((row) => [row.info.issueId, row.info.status, row.info.step])).toEqual([
      ["DSK-34", "In Progress", null],
      ["DSK-37", "Backlog", null],
      ["DSK-38", "Todo", null],
      ["DSK-36", "In Progress", "challenge"],
    ]);
  });

  it("keeps the given order for equal sortOrder values", () => {
    const rows = projectSidebarBoard({
      board: board(
        issue("DSK-1"),
        issue("DSK-2", { parent: "DSK-1", sortOrder: 5 }),
        issue("DSK-3", { parent: "DSK-1", sortOrder: 5 }),
        issue("DSK-4", { parent: "DSK-1", sortOrder: 5 }),
      ),
      workspaces: [ws("DSK-4 d"), ws("DSK-1 a"), ws("DSK-3 c"), ws("DSK-2 b")],
    });

    // Equal values fall back to the board file's order, which is the Issue number.
    expect(ids(rows)).toEqual(["DSK-1 a", "DSK-2 b", "DSK-3 c", "DSK-4 d"]);
  });

  it("treats a negative, a fractional and a large sortOrder as plain numbers", () => {
    const rows = projectSidebarBoard({
      board: board(
        issue("DSK-1", { sortOrder: 1e9 }),
        issue("DSK-2", { sortOrder: -1e9 }),
        issue("DSK-3", { sortOrder: 0.5 }),
        issue("DSK-4", { sortOrder: -0.5 }),
      ),
      workspaces: [ws("DSK-1 a"), ws("DSK-2 b"), ws("DSK-3 c"), ws("DSK-4 d")],
    });

    expect(ids(rows)).toEqual(["DSK-2 b", "DSK-4 d", "DSK-3 c", "DSK-1 a"]);
  });

  it("keeps every workspace of one Issue, in the given order, before the Issue's children", () => {
    const rows = projectSidebarBoard({
      board: feature,
      workspaces: [
        ws("DSK-37 collapse"),
        ws("DSK-34 desk", "34-desk"),
        ws("DSK-34 paseo", "34-paseo"),
      ],
    });

    expect(ids(rows)).toEqual(["34-desk", "34-paseo", "DSK-37 collapse"]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 0, 1]);
  });

  it("keeps descendants of an Issue that has no workspace, one level up", () => {
    const rows = projectSidebarBoard({
      board: board(
        issue("DSK-1"),
        issue("DSK-2", { parent: "DSK-1" }),
        issue("DSK-3", { parent: "DSK-2" }),
        issue("DSK-4", { parent: "DSK-3" }),
      ),
      workspaces: [ws("DSK-1 a"), ws("DSK-3 c"), ws("DSK-4 d")],
    });

    expect(ids(rows)).toEqual(["DSK-1 a", "DSK-3 c", "DSK-4 d"]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 1, 2]);
  });

  it("shows a child whose parent is not on the board at the top", () => {
    const rows = projectSidebarBoard({
      board: board(
        issue("DSK-5", { parent: "FLU-9", sortOrder: 2 }),
        issue("DSK-6", { sortOrder: 1 }),
      ),
      workspaces: [ws("DSK-5 a"), ws("DSK-6 b")],
    });

    expect(ids(rows)).toEqual(["DSK-6 b", "DSK-5 a"]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 0]);
  });

  it("matches nothing for an unknown Issue, a misleading title or a title without a token", () => {
    const rows = projectSidebarBoard({
      board: feature,
      workspaces: [
        ws("DSK-99 unknown"),
        ws("feat/dsk-36-branch"),
        ws("see DSK-36"),
        ws("DSK-360 near miss"),
        ws("Scratch"),
      ],
    });

    expect(rows).toEqual([]);
  });

  it("returns nothing for no board and for an empty board", () => {
    const workspaces = [ws("DSK-34 a")];

    expect(projectSidebarBoard({ board: null, workspaces })).toEqual([]);
    expect(projectSidebarBoard({ board: board(), workspaces })).toEqual([]);
  });

  it("returns nothing when no workspace is eligible", () => {
    expect(projectSidebarBoard({ board: feature, workspaces: [] })).toEqual([]);
  });

  it("treats a repeated Issue id as an unavailable board", () => {
    const rows = projectSidebarBoard({
      board: board(issue("DSK-1"), issue("DSK-1", { status: "Done" })),
      workspaces: [ws("DSK-1 a")],
    });

    expect(rows).toEqual([]);
  });

  it("treats a parent cycle, a self-parent and a long loop as an unavailable board", () => {
    const workspaces = [ws("DSK-1 a"), ws("DSK-2 b"), ws("DSK-3 c")];

    expect(
      projectSidebarBoard({
        board: board(issue("DSK-1", { parent: "DSK-2" }), issue("DSK-2", { parent: "DSK-1" })),
        workspaces,
      }),
    ).toEqual([]);
    expect(
      projectSidebarBoard({ board: board(issue("DSK-1", { parent: "DSK-1" })), workspaces }),
    ).toEqual([]);
    expect(
      projectSidebarBoard({
        board: board(
          issue("DSK-1", { parent: "DSK-3" }),
          issue("DSK-2", { parent: "DSK-1" }),
          issue("DSK-3", { parent: "DSK-2" }),
        ),
        workspaces,
      }),
    ).toEqual([]);
  });

  it("marks the first workspace of an Issue with a matched descendant row, and names the ancestors", () => {
    const rows = projectSidebarBoard({
      board: feature,
      workspaces: [
        ws("DSK-37 collapse"),
        ws("DSK-34 desk", "34-desk"),
        ws("DSK-34 paseo", "34-paseo"),
        ws("DSK-36 reads"),
      ],
    });

    expect(rows.map((row) => [row.workspace.key, row.info.hasChildren])).toEqual([
      ["34-desk", true],
      ["34-paseo", false],
      ["DSK-37 collapse", false],
      ["DSK-36 reads", false],
    ]);
    expect(rows.map((row) => row.info.ancestorIssueIds)).toEqual([[], [], ["DSK-34"], ["DSK-34"]]);
    expect(rows.every((row) => row.info.collapsed === false)).toBe(true);
  });

  it("gives no chevron to an Issue whose descendants have no workspace", () => {
    const rows = projectSidebarBoard({
      board: feature,
      workspaces: [ws("DSK-34 a"), ws("DSK-37 b")],
    });

    expect(rows.map((row) => [row.info.issueId, row.info.hasChildren])).toEqual([
      ["DSK-34", true],
      ["DSK-37", false],
    ]);
    expect(
      projectSidebarBoard({ board: feature, workspaces: [ws("DSK-34 a")] }).map(
        (row) => row.info.hasChildren,
      ),
    ).toEqual([false]);
  });

  it("skips an Issue without a workspace in the ancestors and still marks the nearest matched one", () => {
    const rows = projectSidebarBoard({
      board: board(
        issue("DSK-1"),
        issue("DSK-2", { parent: "DSK-1" }),
        issue("DSK-3", { parent: "DSK-2" }),
        issue("DSK-4", { parent: "DSK-3" }),
      ),
      workspaces: [ws("DSK-1 a"), ws("DSK-3 c"), ws("DSK-4 d")],
    });

    expect(rows.map((row) => [row.info.issueId, row.info.hasChildren])).toEqual([
      ["DSK-1", true],
      ["DSK-3", true],
      ["DSK-4", false],
    ]);
    expect(rows.map((row) => row.info.ancestorIssueIds)).toEqual([
      [],
      ["DSK-1"],
      ["DSK-1", "DSK-3"],
    ]);
  });

  it("does not mutate its inputs", () => {
    const workspaces = [ws("DSK-36 a"), ws("DSK-34 b")];
    const before = JSON.stringify([feature, workspaces]);

    projectSidebarBoard({ board: feature, workspaces });

    expect(JSON.stringify([feature, workspaces])).toBe(before);
  });
});

describe("projectSidebarBoard with two teams", () => {
  const twoTeams = board(
    issue("DSK-1", { sortOrder: 1 }),
    issue("FLU-1", { team: "FLU", parent: "DSK-1", sortOrder: 1 }),
    issue("DSK-2", { parent: "FLU-1", sortOrder: 1 }),
    issue("DSK-3", { parent: "DSK-1", sortOrder: 2 }),
    issue("FLU-2", { team: "FLU", sortOrder: 2 }),
  );
  const workspaces = [ws("FLU-2 b"), ws("DSK-3 c"), ws("DSK-2 d"), ws("FLU-1 a"), ws("DSK-1 root")];

  it("matches a FLU-N workspace once the file carries that Issue, and an id not in the file never", () => {
    const rows = projectSidebarBoard({
      board: twoTeams,
      workspaces: [ws("FLU-2 b"), ws("FLU-9 unknown"), ws("PER-1 other file")],
    });

    expect(ids(rows)).toEqual(["FLU-2 b"]);
  });

  it("lists every team's rows with no team, as before", () => {
    const rows = projectSidebarBoard({ board: twoTeams, workspaces, team: null });

    expect(ids(rows)).toEqual(["DSK-1 root", "FLU-1 a", "DSK-2 d", "DSK-3 c", "FLU-2 b"]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 1, 2, 1, 0]);
    expect(ids(projectSidebarBoard({ board: twoTeams, workspaces }))).toEqual(ids(rows));
  });

  it("keeps one team's rows and recomputes depth, ancestors and hasChildren over them", () => {
    const rows = projectSidebarBoard({ board: twoTeams, workspaces, team: "DSK" });

    // FLU-1 adds no row and no level, so DSK-2 sits directly under DSK-1 beside DSK-3.
    expect(ids(rows)).toEqual(["DSK-1 root", "DSK-2 d", "DSK-3 c"]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 1, 1]);
    expect(rows.map((row) => row.info.ancestorIssueIds)).toEqual([[], ["DSK-1"], ["DSK-1"]]);
    expect(rows.map((row) => row.info.hasChildren)).toEqual([true, false, false]);
  });

  it("gives a parent of another team no row, so its only child of the team has no chevron", () => {
    const rows = projectSidebarBoard({ board: twoTeams, workspaces, team: "FLU" });

    expect(ids(rows)).toEqual(["FLU-1 a", "FLU-2 b"]);
    expect(rows.map((row) => row.info.depth)).toEqual([0, 0]);
    expect(rows.map((row) => row.info.hasChildren)).toEqual([false, false]);
  });

  it("matches nothing for a team the file does not carry", () => {
    expect(projectSidebarBoard({ board: twoTeams, workspaces, team: "PER" })).toEqual([]);
  });
});

describe("applyBoardCollapse", () => {
  const tree = board(
    issue("DSK-1", { sortOrder: 1 }),
    issue("DSK-2", { parent: "DSK-1", sortOrder: 2 }),
    issue("DSK-3", { parent: "DSK-1", sortOrder: 1 }),
    issue("DSK-4", { parent: "DSK-2", sortOrder: 1 }),
    issue("DSK-5", { sortOrder: 2 }),
  );
  const rows = projectSidebarBoard({
    board: tree,
    workspaces: [
      ws("DSK-4 d"),
      ws("DSK-2 b"),
      ws("DSK-1 a"),
      ws("DSK-3 c"),
      ws("DSK-5 e"),
      ws("DSK-2 second", "2-second"),
    ],
  });

  it("shows a Feature with two sub-issues as one parent row and two children, in sortOrder order", () => {
    const feature = projectSidebarBoard({
      board: board(
        issue("DSK-34", { sortOrder: 100 }),
        issue("DSK-36", { parent: "DSK-34", sortOrder: 2 }),
        issue("DSK-37", { parent: "DSK-34", sortOrder: 1 }),
      ),
      workspaces: [ws("DSK-36 b"), ws("DSK-34 a"), ws("DSK-37 c")],
    });

    const expanded = applyBoardCollapse(feature, new Set());
    expect(ids(expanded)).toEqual(["DSK-34 a", "DSK-37 c", "DSK-36 b"]);
    expect(expanded.map((row) => [row.info.depth, row.info.hasChildren])).toEqual([
      [0, true],
      [1, false],
      [1, false],
    ]);

    const collapsed = applyBoardCollapse(feature, new Set(["DSK-34"]));
    expect(ids(collapsed)).toEqual(["DSK-34 a"]);
    expect(collapsed[0]?.info).toMatchObject({ hasChildren: true, collapsed: true });
  });

  it("returns the rows unchanged for an empty collapsed set", () => {
    expect(applyBoardCollapse(rows, new Set())).toBe(rows);
    expect(ids(rows)).toEqual(["DSK-1 a", "DSK-3 c", "DSK-2 b", "2-second", "DSK-4 d", "DSK-5 e"]);
  });

  it("collapsing a root hides its whole subtree and leaves the root and the other roots", () => {
    const visible = applyBoardCollapse(rows, new Set(["DSK-1"]));

    expect(ids(visible)).toEqual(["DSK-1 a", "DSK-5 e"]);
    expect(visible.map((row) => row.info.collapsed)).toEqual([true, false]);
  });

  it("collapsing a middle node hides only its subtree", () => {
    const visible = applyBoardCollapse(rows, new Set(["DSK-2"]));

    expect(ids(visible)).toEqual(["DSK-1 a", "DSK-3 c", "DSK-2 b", "2-second", "DSK-5 e"]);
    expect(visible.map((row) => row.info.collapsed)).toEqual([false, false, true, true, false]);
  });

  it("keeps a second workspace of the collapsed Issue itself", () => {
    const visible = applyBoardCollapse(rows, new Set(["DSK-2"]));

    expect(visible.map((row) => [row.workspace.key, row.info.hasChildren])).toContainEqual([
      "2-second",
      false,
    ]);
  });

  it("adds no collapse level for an Issue without a workspace", () => {
    const gap = projectSidebarBoard({
      board: board(
        issue("DSK-1"),
        issue("DSK-2", { parent: "DSK-1" }),
        issue("DSK-3", { parent: "DSK-2" }),
      ),
      workspaces: [ws("DSK-1 a"), ws("DSK-3 c")],
    });

    // DSK-2 has no row, so collapsing it hides nothing; collapsing DSK-1 hides DSK-3's row.
    expect(ids(applyBoardCollapse(gap, new Set(["DSK-2"])))).toEqual(["DSK-1 a", "DSK-3 c"]);
    expect(ids(applyBoardCollapse(gap, new Set(["DSK-1"])))).toEqual(["DSK-1 a"]);
  });

  it("ignores a collapsed id that is not on the board and leaves the hidden rows out of the result", () => {
    const visible = applyBoardCollapse(rows, new Set(["DSK-99"]));

    expect(ids(visible)).toEqual(ids(rows));
    expect(visible.every((row) => row.info.collapsed === false)).toBe(true);
  });

  it("does not mutate the rows it was given", () => {
    const before = JSON.stringify(rows);

    applyBoardCollapse(rows, new Set(["DSK-1", "DSK-2"]));

    expect(JSON.stringify(rows)).toBe(before);
  });
});

function makeEntry(name: string, projectViewKey: string): SidebarWorkspaceEntry {
  const placement: SidebarWorkspacePlacement = {
    workspaceKey: `srv:${name}`,
    serverId: "srv",
    workspaceId: name,
    projectViewKey,
    projectName: projectViewKey,
    projectKind: "git",
    workspaceKind: "worktree",
    name,
  };
  return {
    ...placement,
    workspaceDirectory: "",
    workspaceDirectoryLabel: "",
    title: null,
    currentBranch: null,
    statusBucket: "done",
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
  };
}

function makeProject(viewKey: string, entries: SidebarWorkspaceEntry[]): SidebarProjectEntry {
  return {
    viewKey,
    projectName: viewKey,
    projectKind: "git",
    iconWorkingDir: `/repo/${viewKey}`,
    hosts: [],
    workspaces: entries,
  };
}

const desk = [makeEntry("DSK-36 sidebar", "desk"), makeEntry("scratch", "desk")];
const paseo = [makeEntry("DSK-34 board", "paseo"), makeEntry("DSK-37 collapse", "paseo")];
const projects = [makeProject("desk", desk), makeProject("paseo", paseo)];
const entries = new Map([...desk, ...paseo].map((entry) => [entry.workspaceKey, entry]));

describe("splitSidebarBoard", () => {
  const feature = board(
    issue("DSK-34", { status: "In Progress" }),
    issue("DSK-36", {
      parent: "DSK-34",
      sortOrder: 2,
      status: "In Progress",
      run: { state: "running", step: "implement", waitsForUser: false },
    }),
    issue("DSK-37", { parent: "DSK-34", sortOrder: 1, status: "Backlog" }),
  );

  it("builds one block across projects and takes its workspaces out of the lists below it", () => {
    const split = splitSidebarBoard({ board: feature, projects, workspaceEntriesByKey: entries });

    expect(split.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual([
      "DSK-34 board",
      "DSK-37 collapse",
      "DSK-36 sidebar",
    ]);
    expect(split.boardWorkspaces.map((entry) => entry.board)).toEqual([
      {
        issueId: "DSK-34",
        depth: 0,
        ancestorIssueIds: [],
        hasChildren: true,
        collapsed: false,
        status: "In Progress",
        step: null,
      },
      {
        issueId: "DSK-37",
        depth: 1,
        ancestorIssueIds: ["DSK-34"],
        hasChildren: false,
        collapsed: false,
        status: "Backlog",
        step: null,
      },
      {
        issueId: "DSK-36",
        depth: 1,
        ancestorIssueIds: ["DSK-34"],
        hasChildren: false,
        collapsed: false,
        status: "In Progress",
        step: "implement",
      },
    ]);
    expect(split.projects.map((project) => project.workspaces.length)).toEqual([1]);
    expect(split.projects[0]?.workspaces[0]?.workspaceId).toBe("scratch");
    expect([...split.workspaceEntriesByKey.keys()]).toEqual(["srv:scratch"]);
  });

  it("hides a project whose every workspace moved into the block", () => {
    const split = splitSidebarBoard({ board: feature, projects, workspaceEntriesByKey: entries });

    expect(split.projects.map((project) => project.viewKey)).toEqual(["desk"]);
  });

  it("keeps a project that has an unmatched workspace left, with its rows in their order", () => {
    const mixed = [
      makeEntry("scratch one", "mixed"),
      makeEntry("DSK-34 board", "mixed"),
      makeEntry("scratch two", "mixed"),
    ];
    const mixedProjects = [makeProject("mixed", mixed)];
    const split = splitSidebarBoard({
      board: feature,
      projects: mixedProjects,
      workspaceEntriesByKey: new Map(mixed.map((entry) => [entry.workspaceKey, entry])),
    });

    expect(split.projects.map((project) => project.viewKey)).toEqual(["mixed"]);
    expect(split.projects[0]?.workspaces.map((placement) => placement.workspaceId)).toEqual([
      "scratch one",
      "scratch two",
    ]);
  });

  it("keeps a project that had no workspace to begin with", () => {
    const bare = makeProject("bare", []);
    const split = splitSidebarBoard({
      board: feature,
      projects: [bare, ...projects],
      workspaceEntriesByKey: entries,
    });

    expect(split.projects.map((project) => project.viewKey)).toEqual(["bare", "desk"]);
  });

  it("leaves the stored lists untouched", () => {
    const before = JSON.stringify([projects, [...entries]]);

    splitSidebarBoard({ board: feature, projects, workspaceEntriesByKey: entries });

    expect(JSON.stringify([projects, [...entries]])).toBe(before);
  });

  it("does not put a board field on the entries it leaves out of the block", () => {
    const split = splitSidebarBoard({ board: feature, projects, workspaceEntriesByKey: entries });

    expect(
      [...split.workspaceEntriesByKey.values()].every((entry) => entry.board === undefined),
    ).toBe(true);
    expect(entries.get("srv:DSK-36 sidebar")?.board).toBeUndefined();
  });

  it("hides the rows under a collapsed Issue and still keeps them out of the lists below", () => {
    const split = splitSidebarBoard({
      board: feature,
      projects,
      workspaceEntriesByKey: entries,
      collapsedIssueIds: new Set(["DSK-34"]),
    });

    expect(split.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual(["DSK-34 board"]);
    expect(split.boardWorkspaces[0]?.board).toMatchObject({ hasChildren: true, collapsed: true });
    // The hidden sub-issue workspaces are collapsed, not returned to their projects.
    expect(split.projects.map((project) => project.viewKey)).toEqual(["desk"]);
    expect(split.projects[0]?.workspaces.map((placement) => placement.workspaceId)).toEqual([
      "scratch",
    ]);
    expect([...split.workspaceEntriesByKey.keys()]).toEqual(["srv:scratch"]);
  });

  it("collapses nothing for an empty set or a set of Issues that are not on the board", () => {
    const expanded = splitSidebarBoard({
      board: feature,
      projects,
      workspaceEntriesByKey: entries,
    });
    const unrelated = splitSidebarBoard({
      board: feature,
      projects,
      workspaceEntriesByKey: entries,
      collapsedIssueIds: new Set(["DSK-99"]),
    });

    expect(unrelated.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual(
      expanded.boardWorkspaces.map((entry) => entry.workspaceId),
    );
    expect(unrelated.boardWorkspaces.every((entry) => entry.board?.collapsed === false)).toBe(true);
  });

  const unusableBoards: [string, Board | null][] = [
    ["no board", null],
    ["an empty board", board()],
    ["a board that matches no workspace", board(issue("DSK-99"))],
    ["a board with a repeated id", board(issue("DSK-34"), issue("DSK-34"))],
    [
      "a board with a parent cycle",
      board(issue("DSK-34", { parent: "DSK-36" }), issue("DSK-36", { parent: "DSK-34" })),
    ],
  ];

  it.each(unusableBoards)("returns the sidebar exactly as it was for %s", (_label, unusable) => {
    const split = splitSidebarBoard({
      board: unusable,
      projects,
      workspaceEntriesByKey: entries,
    });

    expect(split.boardWorkspaces).toEqual([]);
    expect(split.projects).toBe(projects);
    expect(split.workspaceEntriesByKey).toBe(entries);
  });

  it.each(unusableBoards)(
    "returns the sidebar exactly as it was for %s even with stored collapsed Issues",
    (_label, unusable) => {
      const split = splitSidebarBoard({
        board: unusable,
        projects,
        workspaceEntriesByKey: entries,
        collapsedIssueIds: new Set(["DSK-34", "DSK-36"]),
      });

      expect(split.boardWorkspaces).toEqual([]);
      expect(split.projects).toBe(projects);
      expect(split.workspaceEntriesByKey).toBe(entries);
    },
  );

  it("returns the sidebar as it was after a valid board becomes unavailable", () => {
    const withBoard = splitSidebarBoard({
      board: feature,
      projects,
      workspaceEntriesByKey: entries,
    });
    const withoutBoard = splitSidebarBoard({
      board: null,
      projects,
      workspaceEntriesByKey: entries,
    });

    expect(withBoard.boardWorkspaces.length).toBe(3);
    expect(withoutBoard.boardWorkspaces).toEqual([]);
    expect(withoutBoard.projects).toBe(projects);
  });

  it("only considers the workspaces the sidebar currently shows", () => {
    const visibleEntries = new Map([...entries].filter(([key]) => key !== "srv:DSK-34 board"));
    const visibleProjects = [projects[0]!, makeProject("paseo", [paseo[1]!])];

    const split = splitSidebarBoard({
      board: feature,
      projects: visibleProjects,
      workspaceEntriesByKey: visibleEntries,
    });

    // The Feature's workspace is filtered out, so its sub-issues stay visible at the top level.
    expect(split.boardWorkspaces.map((entry) => [entry.workspaceId, entry.board?.depth])).toEqual([
      ["DSK-37 collapse", 0],
      ["DSK-36 sidebar", 0],
    ]);
  });
});

describe("splitSidebarBoard with a team", () => {
  const flu = [makeEntry("FLU-1 widget", "fluent")];
  const twoTeamProjects = [...projects, makeProject("fluent", flu)];
  const twoTeamEntries = new Map(
    [...desk, ...paseo, ...flu].map((entry) => [entry.workspaceKey, entry]),
  );
  const twoTeams = board(
    issue("DSK-34", { status: "In Progress" }),
    issue("DSK-37", { parent: "DSK-34", sortOrder: 1, status: "Backlog" }),
    issue("DSK-36", { parent: "DSK-34", sortOrder: 2, status: "In Progress" }),
    issue("FLU-1", { team: "FLU", status: "Todo" }),
  );

  it("keeps that team's rows in the block and leaves the other team's in the lists below", () => {
    const split = splitSidebarBoard({
      board: twoTeams,
      projects: twoTeamProjects,
      workspaceEntriesByKey: twoTeamEntries,
      team: "DSK",
    });

    expect(split.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual([
      "DSK-34 board",
      "DSK-37 collapse",
      "DSK-36 sidebar",
    ]);
    expect(split.projects.map((project) => project.viewKey)).toEqual(["desk", "fluent"]);
    expect([...split.workspaceEntriesByKey.keys()]).toEqual(["srv:scratch", "srv:FLU-1 widget"]);
  });

  it("lists the other team alone under its own view", () => {
    const split = splitSidebarBoard({
      board: twoTeams,
      projects: twoTeamProjects,
      workspaceEntriesByKey: twoTeamEntries,
      team: "FLU",
    });

    expect(split.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual(["FLU-1 widget"]);
    expect(split.boardWorkspaces[0]?.board).toMatchObject({ depth: 0, status: "Todo" });
    expect(split.projects.map((project) => project.viewKey)).toEqual(["desk", "paseo"]);
  });

  it("lists every team with no team, and applies the collapsed set to the team's rows", () => {
    const all = splitSidebarBoard({
      board: twoTeams,
      projects: twoTeamProjects,
      workspaceEntriesByKey: twoTeamEntries,
      team: null,
    });
    const collapsed = splitSidebarBoard({
      board: twoTeams,
      projects: twoTeamProjects,
      workspaceEntriesByKey: twoTeamEntries,
      team: "DSK",
      collapsedIssueIds: new Set(["DSK-34"]),
    });

    expect(all.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual([
      "DSK-34 board",
      "DSK-37 collapse",
      "DSK-36 sidebar",
      "FLU-1 widget",
    ]);
    expect(collapsed.boardWorkspaces.map((entry) => entry.workspaceId)).toEqual(["DSK-34 board"]);
  });

  it("returns the sidebar as it was for a team the file does not carry", () => {
    const split = splitSidebarBoard({
      board: twoTeams,
      projects: twoTeamProjects,
      workspaceEntriesByKey: twoTeamEntries,
      team: "PER",
    });

    expect(split.boardWorkspaces).toEqual([]);
    expect(split.projects).toBe(twoTeamProjects);
    expect(split.workspaceEntriesByKey).toBe(twoTeamEntries);
  });
});
