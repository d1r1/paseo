import { describe, expect, it } from "vitest";
import type { Board, BoardIssue } from "@/desktop/board/board-file";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import {
  formatBoardCaption,
  parseBoardIssueId,
  projectSidebarBoard,
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

function ids(rows: SidebarBoardRow<{ key: string }>[]): string[] {
  return rows.map((row) => row.workspace.key);
}

describe("parseBoardIssueId", () => {
  it.each([
    ["DSK-34 sidebar board", "DSK-34"],
    ["DSK-34", "DSK-34"],
    ["DSK-34\tfork", "DSK-34"],
  ])("reads the leading token of %j", (title, expected) => {
    expect(parseBoardIssueId(title)).toBe(expected);
  });

  it.each([
    ["feat/dsk-34-sidebar"],
    ["notes on DSK-34"],
    ["DSK-345x"],
    ["DSK-34-fork"],
    ["DSK-"],
    ["dsk-34 lowercase"],
    [" DSK-34 leading space"],
    ["FLU-12 other team"],
    [""],
  ])("reads no token from %j", (title) => {
    expect(parseBoardIssueId(title)).toBeNull();
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

  it("does not mutate its inputs", () => {
    const workspaces = [ws("DSK-36 a"), ws("DSK-34 b")];
    const before = JSON.stringify([feature, workspaces]);

    projectSidebarBoard({ board: feature, workspaces });

    expect(JSON.stringify([feature, workspaces])).toBe(before);
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

describe("splitSidebarBoard", () => {
  const desk = [makeEntry("DSK-36 sidebar", "desk"), makeEntry("scratch", "desk")];
  const paseo = [makeEntry("DSK-34 board", "paseo"), makeEntry("DSK-37 collapse", "paseo")];
  const projects = [makeProject("desk", desk), makeProject("paseo", paseo)];
  const entries = new Map([...desk, ...paseo].map((entry) => [entry.workspaceKey, entry]));
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
      { issueId: "DSK-34", depth: 0, status: "In Progress", step: null },
      { issueId: "DSK-37", depth: 1, status: "Backlog", step: null },
      { issueId: "DSK-36", depth: 1, status: "In Progress", step: "implement" },
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

  it.each([
    ["no board", null],
    ["an empty board", board()],
    ["a board that matches no workspace", board(issue("DSK-99"))],
    ["a board with a repeated id", board(issue("DSK-34"), issue("DSK-34"))],
    [
      "a board with a parent cycle",
      board(issue("DSK-34", { parent: "DSK-36" }), issue("DSK-36", { parent: "DSK-34" })),
    ],
  ])("returns the sidebar exactly as it was for %s", (_label, unusable) => {
    const split = splitSidebarBoard({
      board: unusable,
      projects,
      workspaceEntriesByKey: entries,
    });

    expect(split.boardWorkspaces).toEqual([]);
    expect(split.projects).toBe(projects);
    expect(split.workspaceEntriesByKey).toBe(entries);
  });

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
