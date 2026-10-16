import { i18n } from "@/i18n/i18next";
import { describe, expect, it } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import type { Board } from "@/desktop/board/board-file";
import { splitSidebarBoard } from "./sidebar-board";
import { buildSidebarProjection } from "./sidebar-projection";

function makeWorkspace(
  id: string,
  statusBucket: SidebarWorkspaceEntry["statusBucket"] = "done",
  labels: string[] = [],
  projectViewKey = "project",
) {
  const placement: SidebarWorkspacePlacement = {
    workspaceKey: `srv:${id}`,
    serverId: "srv",
    workspaceId: id,
    projectViewKey,
    projectName: "Project",
    projectKind: "git",
    workspaceKind: "worktree",
    name: id,
  };
  const entry: SidebarWorkspaceEntry = {
    ...placement,
    workspaceDirectory: "",
    workspaceDirectoryLabel: "",
    title: null,
    currentBranch: null,
    statusBucket,
    statusEnteredAt: null,
    archivingAt: null,
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    labels,
  };
  return { placement, entry };
}

function makeProject(
  workspaces: SidebarWorkspacePlacement[],
  viewKey = "project",
): SidebarProjectEntry {
  return {
    viewKey,
    projectName: "Project",
    projectKind: "git",
    iconWorkingDir: `/repo/${viewKey}`,
    hosts: [
      {
        serverId: "srv",
        projectId: viewKey,
        iconWorkingDir: `/repo/${viewKey}`,
        worktreeSupport: "supported" as const,
      },
    ],
    workspaces,
  };
}

function projectionInput(options?: {
  groupMode?: "project" | "status";
  pinnedCollapsed?: boolean;
}) {
  const pinned = makeWorkspace("pinned", "running");
  const unpinned = makeWorkspace("unpinned", "needs_input");
  return {
    projects: [makeProject([pinned.placement, unpinned.placement])],
    pinnedKeys: {
      pinnedWorkspaceKeys: [pinned.placement.workspaceKey],
      pinnedAtByKey: { [pinned.placement.workspaceKey]: "2026-07-12T12:00:00.000Z" },
    },
    pinnedWorkspaceOrder: [],
    workspaceEntriesByKey: new Map([
      [pinned.entry.workspaceKey, pinned.entry],
      [unpinned.entry.workspaceKey, unpinned.entry],
    ]),
    projectNamesByViewKey: new Map([["project", "Project"]]),
    groupMode: options?.groupMode ?? ("project" as const),
    pinnedCollapsed: options?.pinnedCollapsed ?? false,
    collapsedProjectKeys: new Set<string>(),
    collapsedWorkspaceGroupKeys: new Set<string>(),
    t: i18n.t,
  };
}

/**
 * Two projects, one workspace each, both labelled — so every grouping mode puts rows from more
 * than one project on screen, and a mode that asked for fewer icons than it renders would show it.
 */
function twoProjectInput(groupMode: "project" | "status") {
  const first = makeWorkspace("first", "running", ["Urgent"], "project");
  const second = makeWorkspace("second", "needs_input", ["Backend"], "other-project");
  return {
    ...projectionInput({ groupMode }),
    projects: [makeProject([first.placement]), makeProject([second.placement], "other-project")],
    pinnedKeys: { pinnedWorkspaceKeys: [], pinnedAtByKey: {} },
    workspaceEntriesByKey: new Map([
      [first.entry.workspaceKey, first.entry],
      [second.entry.workspaceKey, second.entry],
    ]),
    projectNamesByViewKey: new Map([
      ["project", "Project"],
      ["other-project", "Other project"],
    ]),
  };
}

describe("buildSidebarProjection", () => {
  // The rule that outlived the bug it was written for: a project icon is fetched per project, so
  // whatever a mode groups by, the rows it produces can only reference projects already covered.
  for (const groupMode of ["project", "status"] as const) {
    it(`covers every row ${groupMode} grouping renders with a project icon target`, () => {
      const projection = buildSidebarProjection(twoProjectInput(groupMode));
      const covered = new Set(projection.projectIconTargets.map((target) => target.projectViewKey));

      // Every leading visual the sidebar can paint from this projection: pinned rows, grouped
      // rows, project headers and the rows under them.
      const renderedProjectViewKeys = new Set<string>();
      for (const entry of projection.pinnedGroups.pinnedChats) {
        renderedProjectViewKeys.add(entry.projectViewKey);
      }
      for (const group of projection.workspaceGroups) {
        for (const entry of group.rows) renderedProjectViewKeys.add(entry.projectViewKey);
      }
      for (const project of projection.pinnedGroups.unpinnedProjects) {
        renderedProjectViewKeys.add(project.viewKey);
        for (const entry of project.workspaces) renderedProjectViewKeys.add(entry.projectViewKey);
      }

      expect([...renderedProjectViewKeys].sort()).toEqual(["other-project", "project"]);
      expect([...renderedProjectViewKeys].filter((viewKey) => !covered.has(viewKey))).toEqual([]);
    });
  }

  it("uses one pin-aware projection for project rows and shortcut order", () => {
    const projection = buildSidebarProjection(projectionInput());

    expect(projection.pinnedGroups.pinnedChats.map((entry) => entry.workspaceId)).toEqual([
      "pinned",
    ]);
    const remainingProject = projection.pinnedGroups.unpinnedProjects[0];
    expect(remainingProject?.workspaces.map((entry) => entry.workspaceId)).toEqual(["unpinned"]);
    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "pinned" },
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });

  it("keeps pinned chats above status groups and removes them from those groups", () => {
    const projection = buildSidebarProjection(projectionInput({ groupMode: "status" }));

    expect(projection.workspaceGroups.map((group) => group.key)).toEqual(["needs_input"]);
    expect(projection.workspaceGroups[0]?.rows.map((entry) => entry.workspaceId)).toEqual([
      "unpinned",
    ]);
    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "pinned" },
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });

  it("does not number pinned chats while the pinned section is collapsed", () => {
    const projection = buildSidebarProjection(
      projectionInput({ groupMode: "status", pinnedCollapsed: true }),
    );

    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });

  it("numbers the board block before everything else for the shortcuts", () => {
    const boardRow = makeWorkspace("board-row", "running");
    const projection = buildSidebarProjection({
      ...projectionInput({ groupMode: "status" }),
      boardWorkspaces: [boardRow.entry],
    });

    expect(projection.shortcutModel.shortcutTargets).toEqual([
      { serverId: "srv", workspaceId: "board-row" },
      { serverId: "srv", workspaceId: "pinned" },
      { serverId: "srv", workspaceId: "unpinned" },
    ]);
  });

  it("numbers the board block even while the pinned section is collapsed", () => {
    const boardRow = makeWorkspace("board-row", "running");
    const projection = buildSidebarProjection({
      ...projectionInput({ pinnedCollapsed: true }),
      boardWorkspaces: [boardRow.entry],
    });

    expect(projection.shortcutModel.shortcutTargets.map((target) => target.workspaceId)).toEqual([
      "board-row",
      "unpinned",
    ]);
  });

  it("is unchanged without a board block", () => {
    const withoutField = buildSidebarProjection(projectionInput());
    const withEmpty = buildSidebarProjection({ ...projectionInput(), boardWorkspaces: [] });

    expect(withEmpty.shortcutModel.shortcutTargets).toEqual(
      withoutField.shortcutModel.shortcutTargets,
    );
  });
});

const TAKING_BOARD: Board = {
  generatedAt: "2026-10-17T09:00:00Z",
  issues: ["DSK-1", "DSK-2"].map((id, sortOrder) => ({
    id,
    title: id,
    team: "DSK",
    status: "Todo",
    parent: null,
    sortOrder,
    run: null,
  })),
};

/** One project the board empties, one it leaves a workspace in. */
function boardedProjection(groupMode: "project" | "status") {
  const emptied = makeWorkspace("DSK-1 emptied", "needs_input", [], "emptied");
  const partlyA = makeWorkspace("DSK-2 partly", "needs_input", [], "partly");
  const partlyB = makeWorkspace("scratch", "running", [], "partly");
  const entries = [emptied.entry, partlyA.entry, partlyB.entry];
  const projects = [
    makeProject([emptied.placement], "emptied"),
    makeProject([partlyA.placement, partlyB.placement], "partly"),
  ];
  const split = splitSidebarBoard({
    board: TAKING_BOARD,
    projects,
    workspaceEntriesByKey: new Map(entries.map((entry) => [entry.workspaceKey, entry])),
  });
  return buildSidebarProjection({
    ...projectionInput({ groupMode }),
    projects: split.projects,
    iconProjects: projects,
    boardWorkspaces: split.boardWorkspaces,
    workspaceEntriesByKey: split.workspaceEntriesByKey,
    pinnedKeys: { pinnedWorkspaceKeys: [], pinnedAtByKey: {} },
  });
}

describe("buildSidebarProjection with the board taking workspaces", () => {
  it("lists no project group for a project the board emptied, and keeps a partly emptied one", () => {
    const { unpinnedProjects } = boardedProjection("project").pinnedGroups;

    expect(unpinnedProjects.map((project) => project.viewKey)).toEqual(["partly"]);
    expect(unpinnedProjects[0]?.workspaces.map((entry) => entry.workspaceId)).toEqual(["scratch"]);
  });

  it("lists no status group the board emptied, and keeps a partly emptied one", () => {
    const { workspaceGroups } = boardedProjection("status");

    expect(workspaceGroups.map((group) => group.key)).toEqual(["running"]);
    expect(workspaceGroups[0]?.rows.map((entry) => entry.workspaceId)).toEqual(["scratch"]);
  });

  for (const groupMode of ["project", "status"] as const) {
    it(`keeps the icon target of every project a board row sits in, ${groupMode} grouping`, () => {
      const { projectIconTargets } = boardedProjection(groupMode);

      expect(projectIconTargets.map((target) => target.projectViewKey)).toEqual([
        "emptied",
        "partly",
      ]);
    });
  }
});
