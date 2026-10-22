import { describe, expect, it } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { i18n } from "@/i18n/i18next";
import { buildSidebarProjection } from "./sidebar-projection";

type SidebarStateBucket = SidebarWorkspaceEntry["statusBucket"];

interface StateFilterModule {
  SIDEBAR_STATE_FILTER_BUCKETS: readonly SidebarStateBucket[];
  filterWorkspacesByState: (input: {
    workspaces: readonly SidebarWorkspaceEntry[];
    states: readonly SidebarStateBucket[];
  }) => SidebarWorkspaceEntry[];
  applyStateFilter: (input: {
    projects: SidebarProjectEntry[];
    workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
    states: readonly SidebarStateBucket[];
  }) => {
    projects: SidebarProjectEntry[];
    workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  };
}

// The module is loaded at run time so that, before it exists, the tests below fail on their
// assertions instead of on an unresolved import.
const MODULE_PATH = "./sidebar-state-filter";
async function loadModule(): Promise<StateFilterModule> {
  const loaded: unknown = await import(/* @vite-ignore */ MODULE_PATH).catch(() => null);
  const module = (loaded ?? {}) as Partial<StateFilterModule>;
  expect(typeof module.filterWorkspacesByState).toBe("function");
  expect(typeof module.applyStateFilter).toBe("function");
  expect(Array.isArray(module.SIDEBAR_STATE_FILTER_BUCKETS)).toBe(true);
  return module as StateFilterModule;
}

function makeWorkspace(id: string, statusBucket: SidebarStateBucket, projectViewKey: string) {
  const placement: SidebarWorkspacePlacement = {
    workspaceKey: `srv:${id}`,
    serverId: "srv",
    workspaceId: id,
    projectViewKey,
    projectName: projectViewKey,
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
  };
  return { placement, entry };
}

function makeProject(viewKey: string, placements: SidebarWorkspacePlacement[]) {
  const projectEntry: SidebarProjectEntry = {
    viewKey,
    projectName: viewKey,
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
    workspaces: placements,
  };
  return projectEntry;
}

// project-a: needs_input, failed, attention. project-b: running, done, attention.
// project-c: done only, so a filter that spares everything but done leaves it alone.
const FIXTURE = [
  makeWorkspace("a1", "needs_input", "project-a"),
  makeWorkspace("a2", "failed", "project-a"),
  makeWorkspace("a3", "attention", "project-a"),
  makeWorkspace("b1", "running", "project-b"),
  makeWorkspace("b2", "done", "project-b"),
  makeWorkspace("b3", "attention", "project-b"),
  makeWorkspace("c1", "done", "project-c"),
];
const ENTRIES = FIXTURE.map((workspace) => workspace.entry);
const PROJECTS = [
  makeProject(
    "project-a",
    FIXTURE.slice(0, 3).map((workspace) => workspace.placement),
  ),
  makeProject(
    "project-b",
    FIXTURE.slice(3, 6).map((workspace) => workspace.placement),
  ),
  makeProject(
    "project-c",
    FIXTURE.slice(6).map((workspace) => workspace.placement),
  ),
];
const ENTRIES_BY_KEY = new Map(ENTRIES.map((entry) => [entry.workspaceKey, entry]));

function project(
  groupMode: "project" | "status",
  filtered: {
    projects: SidebarProjectEntry[];
    workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  },
) {
  return buildSidebarProjection({
    projects: filtered.projects,
    pinnedKeys: { pinnedWorkspaceKeys: [], pinnedAtByKey: {} },
    pinnedWorkspaceOrder: [],
    workspaceEntriesByKey: filtered.workspaceEntriesByKey,
    projectNamesByViewKey: new Map([
      ["project-a", "project-a"],
      ["project-b", "project-b"],
      ["project-c", "project-c"],
    ]),
    groupMode,
    pinnedCollapsed: false,
    collapsedProjectKeys: new Set<string>(),
    collapsedWorkspaceGroupKeys: new Set<string>(),
    t: i18n.t,
  });
}

function ids(workspaces: readonly { workspaceId: string }[]): string[] {
  return workspaces.map((workspace) => workspace.workspaceId);
}

describe("SIDEBAR_STATE_FILTER_BUCKETS", () => {
  it("offers the five sidebar buckets, most urgent first, as the state page lists them", async () => {
    const { SIDEBAR_STATE_FILTER_BUCKETS } = await loadModule();

    expect(SIDEBAR_STATE_FILTER_BUCKETS).toEqual([
      "needs_input",
      "failed",
      "attention",
      "running",
      "done",
    ]);
  });
});

describe("filterWorkspacesByState", () => {
  it("returns every workspace when no state is selected", async () => {
    const { filterWorkspacesByState } = await loadModule();

    expect(filterWorkspacesByState({ workspaces: ENTRIES, states: [] })).toEqual(ENTRIES);
  });

  it("keeps only workspaces whose bucket is among the selected states", async () => {
    const { filterWorkspacesByState } = await loadModule();

    const kept = filterWorkspacesByState({
      workspaces: ENTRIES,
      states: ["attention", "needs_input"],
    });

    expect(ids(kept)).toEqual(["a1", "a3", "b3"]);
  });

  it("selects each of the five buckets on its own", async () => {
    const { filterWorkspacesByState, SIDEBAR_STATE_FILTER_BUCKETS } = await loadModule();
    const expected: Record<SidebarStateBucket, string[]> = {
      needs_input: ["a1"],
      failed: ["a2"],
      attention: ["a3", "b3"],
      running: ["b1"],
      done: ["b2", "c1"],
    };

    for (const bucket of SIDEBAR_STATE_FILTER_BUCKETS) {
      expect(ids(filterWorkspacesByState({ workspaces: ENTRIES, states: [bucket] }))).toEqual(
        expected[bucket],
      );
    }
  });

  it("returns nothing when no workspace is in a selected state", async () => {
    const { filterWorkspacesByState } = await loadModule();

    expect(
      filterWorkspacesByState({
        workspaces: [makeWorkspace("x", "done", "p").entry],
        states: ["running"],
      }),
    ).toEqual([]);
  });

  it("does not mutate its input", async () => {
    const { filterWorkspacesByState } = await loadModule();
    const workspaces = [...ENTRIES];

    filterWorkspacesByState({ workspaces, states: ["done"] });

    expect(workspaces).toEqual(ENTRIES);
  });
});

describe("applyStateFilter", () => {
  it("leaves the projects and entries as they are when no state is selected", async () => {
    const { applyStateFilter } = await loadModule();

    const result = applyStateFilter({
      projects: PROJECTS,
      workspaceEntriesByKey: ENTRIES_BY_KEY,
      states: [],
    });

    expect(result.projects).toEqual(PROJECTS);
    expect([...result.workspaceEntriesByKey.keys()]).toEqual([...ENTRIES_BY_KEY.keys()]);
  });

  it("keeps in each project only the workspaces in a selected state, and drops emptied projects", async () => {
    const { applyStateFilter } = await loadModule();

    const result = applyStateFilter({
      projects: PROJECTS,
      workspaceEntriesByKey: ENTRIES_BY_KEY,
      states: ["attention", "running"],
    });

    expect(result.projects.map((entry) => [entry.viewKey, ids(entry.workspaces)])).toEqual([
      ["project-a", ["a3"]],
      ["project-b", ["b1", "b3"]],
    ]);
    expect(ids([...result.workspaceEntriesByKey.values()])).toEqual(["a3", "b1", "b3"]);
  });

  it("does not mutate the projects it is given", async () => {
    const { applyStateFilter } = await loadModule();
    const before = PROJECTS.map((entry) => ids(entry.workspaces));

    applyStateFilter({
      projects: PROJECTS,
      workspaceEntriesByKey: ENTRIES_BY_KEY,
      states: ["done"],
    });

    expect(PROJECTS.map((entry) => ids(entry.workspaces))).toEqual(before);
  });

  it("filters the project mode projection down to the selected workspaces under their projects", async () => {
    const { applyStateFilter } = await loadModule();
    const filtered = applyStateFilter({
      projects: PROJECTS,
      workspaceEntriesByKey: ENTRIES_BY_KEY,
      states: ["done", "failed"],
    });

    const projection = project("project", filtered);

    expect(
      projection.pinnedGroups.unpinnedProjects.map((entry) => [
        entry.viewKey,
        ids(entry.workspaces),
      ]),
    ).toEqual([
      ["project-a", ["a2"]],
      ["project-b", ["b2"]],
      ["project-c", ["c1"]],
    ]);
    expect(projection.shortcutModel.shortcutTargets.map((target) => target.workspaceId)).toEqual([
      "a2",
      "b2",
      "c1",
    ]);
  });

  it("filters the status mode projection down to the selected buckets and their workspaces", async () => {
    const { applyStateFilter } = await loadModule();
    const filtered = applyStateFilter({
      projects: PROJECTS,
      workspaceEntriesByKey: ENTRIES_BY_KEY,
      states: ["done", "failed"],
    });

    const projection = project("status", filtered);

    expect(projection.workspaceGroups.map((group) => [group.key, ids(group.rows).sort()])).toEqual([
      ["failed", ["a2"]],
      ["done", ["b2", "c1"]],
    ]);
    expect(
      projection.shortcutModel.shortcutTargets.map((target) => target.workspaceId).sort(),
    ).toEqual(["a2", "b2", "c1"]);
  });

  it("shows every workspace again in both modes once the selection is cleared", async () => {
    const { applyStateFilter } = await loadModule();
    const cleared = applyStateFilter({
      projects: PROJECTS,
      workspaceEntriesByKey: ENTRIES_BY_KEY,
      states: [],
    });

    const projectMode = project("project", cleared);
    const statusMode = project("status", cleared);

    expect(
      projectMode.pinnedGroups.unpinnedProjects.flatMap((entry) => ids(entry.workspaces)).sort(),
    ).toEqual(ids(ENTRIES).sort());
    expect(statusMode.workspaceGroups.flatMap((group) => ids(group.rows)).sort()).toEqual(
      ids(ENTRIES).sort(),
    );
  });
});
