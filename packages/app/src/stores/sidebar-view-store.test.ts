import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import {
  createSidebarViewStorage,
  hasActiveSidebarLabelFilter,
  migrateSidebarViewState,
  SIDEBAR_UNLABELLED_LABEL_KEY,
  useSidebarViewStore,
} from "./sidebar-view-store";

interface MemoryStorage extends StateStorage<Promise<void>> {
  reads: string[];
}

function createMemoryStorage(entries: Record<string, string | null>): MemoryStorage {
  const reads: string[] = [];
  return {
    reads,
    getItem: async (name) => {
      reads.push(name);
      return entries[name] ?? null;
    },
    setItem: async (name, value) => {
      entries[name] = value;
    },
    removeItem: async (name) => {
      entries[name] = null;
    },
  };
}

describe("sidebar view store", () => {
  beforeEach(() => {
    useSidebarViewStore.setState({
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("toggles multiple hosts into and out of the filter", () => {
    const store = useSidebarViewStore.getState();
    store.toggleHostFilter("host-a");
    store.toggleHostFilter("host-b");

    expect(useSidebarViewStore.getState().hostFilters).toEqual(["host-a", "host-b"]);

    store.toggleHostFilter("host-a");

    expect(useSidebarViewStore.getState().hostFilters).toEqual(["host-b"]);

    store.clearHostFilters();

    expect(useSidebarViewStore.getState().hostFilters).toEqual([]);
  });

  it("keeps host filters that still point at available hosts", () => {
    const store = useSidebarViewStore.getState();
    store.toggleHostFilter("host-a");
    store.toggleHostFilter("host-b");

    store.reconcileHostFilters(["host-a", "host-b", "host-c"]);

    expect(useSidebarViewStore.getState().hostFilters).toEqual(["host-a", "host-b"]);
  });

  it("drops a host filter after that host is removed", () => {
    const store = useSidebarViewStore.getState();
    store.toggleHostFilter("host-a");
    store.toggleHostFilter("removed-host");

    store.reconcileHostFilters(["host-a"]);

    expect(useSidebarViewStore.getState().hostFilters).toEqual(["host-a"]);
  });

  it("migrates legacy per-host group modes to the new global mode", () => {
    expect(
      migrateSidebarViewState({
        groupModeByServerId: {
          "host-a": "project",
          "host-b": "status",
        },
      }),
    ).toEqual({
      groupMode: "status",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("migrates a pre-v2 single host filter to the multi-host list", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "status",
        hostFilter: "host-a",
      }),
    ).toEqual({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("keeps current persisted sidebar view state during version migration", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "status",
        hostFilters: ["host-a", "host-b"],
      }),
    ).toEqual({
      groupMode: "status",
      hostFilters: ["host-a", "host-b"],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("clears only the label facet", () => {
    useSidebarViewStore.setState({
      groupMode: "status",
      hostFilters: ["host-a"],
      labelFilter: { labels: ["urgent", "blocked"] },
    });

    useSidebarViewStore.getState().clearLabelFilter();

    expect(useSidebarViewStore.getState()).toMatchObject({
      groupMode: "status",
      hostFilters: ["host-a"],
      labelFilter: { labels: [] },
    });
  });

  it("toggles a label on and off under one normalized identity", () => {
    const { toggleLabelFilter } = useSidebarViewStore.getState();
    const labels = () => useSidebarViewStore.getState().labelFilter.labels;

    toggleLabelFilter("Urgent");
    expect(labels()).toEqual(["urgent"]);
    expect(hasActiveSidebarLabelFilter(useSidebarViewStore.getState().labelFilter)).toBe(true);

    toggleLabelFilter(" URGENT ");
    expect(labels()).toEqual([]);
    expect(hasActiveSidebarLabelFilter(useSidebarViewStore.getState().labelFilter)).toBe(false);
  });

  it("filters Unlabelled alongside real labels without colliding with one", () => {
    const { toggleLabelFilter } = useSidebarViewStore.getState();

    toggleLabelFilter(SIDEBAR_UNLABELLED_LABEL_KEY);
    toggleLabelFilter("Urgent");
    expect(useSidebarViewStore.getState().labelFilter).toEqual({
      labels: [SIDEBAR_UNLABELLED_LABEL_KEY, "urgent"],
    });
  });

  it("drops deleted labels from the active filter but retains Unlabelled", () => {
    useSidebarViewStore.setState({
      labelFilter: { labels: [SIDEBAR_UNLABELLED_LABEL_KEY, "urgent", "removed"] },
    });

    useSidebarViewStore.getState().reconcileLabelFilter(["Urgent"]);

    expect(useSidebarViewStore.getState().labelFilter).toEqual({
      labels: [SIDEBAR_UNLABELLED_LABEL_KEY, "urgent"],
    });
  });

  it("re-keys a persisted label filter through the normalized identity, without duplicates", () => {
    expect(
      migrateSidebarViewState({
        labelFilter: { labels: [" Urgent ", "BLOCKED", "urgent"], match: "all" },
      }).labelFilter,
    ).toEqual({ labels: ["urgent", "blocked"] });
  });

  it("toggles multiple projects into and out of the filter", () => {
    const store = useSidebarViewStore.getState();
    store.toggleProjectFilter("project-a");
    store.toggleProjectFilter("project-b");

    expect(useSidebarViewStore.getState().projectFilters).toEqual(["project-a", "project-b"]);

    store.toggleProjectFilter("project-a");

    expect(useSidebarViewStore.getState().projectFilters).toEqual(["project-b"]);

    store.clearProjectFilters();

    expect(useSidebarViewStore.getState().projectFilters).toEqual([]);
  });

  it("keeps the other facets when the project filter is cleared", () => {
    useSidebarViewStore.setState({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: ["project-a"],
      labelFilter: { labels: ["urgent"] },
    });

    useSidebarViewStore.getState().clearProjectFilters();

    expect(useSidebarViewStore.getState()).toMatchObject({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: [],
      labelFilter: { labels: ["urgent"] },
    });
  });

  // The persisted schema is a `z.strictObject` behind `createValidatedPersistStorage`, so a key
  // the schema does not list fails the parse and takes every other sidebar setting down with it.
  it("carries a persisted project filter through the version migration", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "project",
        hostFilters: ["host-a"],
        projectFilters: ["project-a", "project-b"],
      }),
    ).toEqual({
      groupMode: "project",
      hostFilters: ["host-a"],
      projectFilters: ["project-a", "project-b"],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("never keeps project filters from state the schema rejects", () => {
    expect(migrateSidebarViewState({ projectFilters: "project-a" })).toEqual({
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("sets the board view and keeps the other facets", () => {
    useSidebarViewStore.setState({ hostFilters: ["host-a"], projectFilters: ["project-a"] });

    useSidebarViewStore.getState().setBoardView("DSK");

    expect(useSidebarViewStore.getState()).toMatchObject({
      hostFilters: ["host-a"],
      projectFilters: ["project-a"],
      boardView: "DSK",
    });
  });

  it("carries a persisted board view through the version migration", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "project",
        hostFilters: ["host-a"],
        boardView: "FLU",
      }),
    ).toEqual({
      groupMode: "project",
      hostFilters: ["host-a"],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "FLU",
    });
  });

  it("reads all for a persisted value without a board view", () => {
    expect(migrateSidebarViewState({ groupMode: "status" }).boardView).toBe("all");
  });

  it("never keeps a board view from state the schema rejects", () => {
    expect(migrateSidebarViewState({ boardView: 1 }).boardView).toBe("all");
  });

  it("falls back to the legacy storage key when the new key is empty", async () => {
    const storage = createMemoryStorage({
      "sidebar-view": null,
      "sidebar-group-mode": JSON.stringify({
        state: { groupModeByServerId: { "host-a": "status" } },
        version: 0,
      }),
    });

    const value = await createSidebarViewStorage(storage).getItem("sidebar-view");

    expect(value).toBe(
      JSON.stringify({
        state: { groupModeByServerId: { "host-a": "status" } },
        version: 0,
      }),
    );
    expect(storage.reads).toEqual(["sidebar-view", "sidebar-group-mode"]);
  });

  it("uses the new storage key without reading the legacy key when current state exists", async () => {
    const storage = createMemoryStorage({
      "sidebar-view": JSON.stringify({
        state: { groupMode: "project", hostFilters: ["host-a"] },
        version: 2,
      }),
      "sidebar-group-mode": JSON.stringify({
        state: { groupModeByServerId: { "host-b": "status" } },
        version: 0,
      }),
    });

    const value = await createSidebarViewStorage(storage).getItem("sidebar-view");

    expect(value).toBe(
      JSON.stringify({
        state: { groupMode: "project", hostFilters: ["host-a"] },
        version: 2,
      }),
    );
    expect(storage.reads).toEqual(["sidebar-view"]);
  });
});

// The state filter is an allowlist over the five sidebar buckets, stored like `hostFilters`:
// empty means every state, and the filter belongs to the view rather than to a group mode.
describe("sidebar view store state filter", () => {
  beforeEach(() => {
    useSidebarViewStore.setState({
      groupMode: "project",
      hostFilters: [],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: [],
      boardView: "all",
    });
  });

  it("starts empty, which means every state", () => {
    expect(useSidebarViewStore.getInitialState().stateFilter).toEqual([]);
  });

  it("toggles several states into and out of the allowlist and clears it", () => {
    const store = useSidebarViewStore.getState();
    expect(typeof store.toggleStateFilter).toBe("function");
    expect(typeof store.clearStateFilter).toBe("function");

    store.toggleStateFilter("attention");
    store.toggleStateFilter("needs_input");
    expect(useSidebarViewStore.getState().stateFilter).toEqual(["attention", "needs_input"]);

    store.toggleStateFilter("attention");
    expect(useSidebarViewStore.getState().stateFilter).toEqual(["needs_input"]);

    store.clearStateFilter();
    expect(useSidebarViewStore.getState().stateFilter).toEqual([]);
  });

  it("accepts each of the five buckets", () => {
    const store = useSidebarViewStore.getState();
    expect(typeof store.toggleStateFilter).toBe("function");

    for (const bucket of ["needs_input", "failed", "attention", "running", "done"] as const) {
      store.toggleStateFilter(bucket);
    }

    expect(useSidebarViewStore.getState().stateFilter).toEqual([
      "needs_input",
      "failed",
      "attention",
      "running",
      "done",
    ]);
  });

  it("keeps the state filter when the group mode changes, in both directions", () => {
    useSidebarViewStore.setState({ stateFilter: ["running"] });

    useSidebarViewStore.getState().setGroupMode("status");
    expect(useSidebarViewStore.getState().stateFilter).toEqual(["running"]);

    useSidebarViewStore.getState().setGroupMode("project");
    expect(useSidebarViewStore.getState().stateFilter).toEqual(["running"]);
  });

  it("leaves the other facets alone when the state filter is cleared", () => {
    useSidebarViewStore.setState({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: ["project-a"],
      labelFilter: { labels: ["urgent"] },
      stateFilter: ["done"],
    });
    expect(typeof useSidebarViewStore.getState().clearStateFilter).toBe("function");

    useSidebarViewStore.getState().clearStateFilter();

    expect(useSidebarViewStore.getState()).toMatchObject({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: ["project-a"],
      labelFilter: { labels: ["urgent"] },
      stateFilter: [],
    });
  });

  it("keeps the state filter when the label filter is cleared", () => {
    useSidebarViewStore.setState({ labelFilter: { labels: ["urgent"] }, stateFilter: ["done"] });

    useSidebarViewStore.getState().clearLabelFilter();

    expect(useSidebarViewStore.getState().stateFilter).toEqual(["done"]);
  });

  it("persists the state filter, under a bumped store version", () => {
    useSidebarViewStore.setState({ stateFilter: ["failed", "attention"] });
    const options = useSidebarViewStore.persist.getOptions();

    expect(options.version).toBe(7);
    expect(options.partialize?.(useSidebarViewStore.getState())).toMatchObject({
      stateFilter: ["failed", "attention"],
    });
  });

  it("carries a persisted state filter through the version migration", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "status",
        hostFilters: ["host-a"],
        stateFilter: ["needs_input", "attention"],
      }),
    ).toEqual({
      groupMode: "status",
      hostFilters: ["host-a"],
      projectFilters: [],
      labelFilter: { labels: [] },
      stateFilter: ["needs_input", "attention"],
      boardView: "all",
    });
  });

  it("migrates v6 state, which has no state filter, to every state", () => {
    expect(
      migrateSidebarViewState({
        groupMode: "project",
        hostFilters: [],
        projectFilters: ["project-a"],
        labelFilter: { labels: ["urgent"] },
        boardView: "DSK",
      }).stateFilter,
    ).toEqual([]);
  });

  it("defaults the state filter to every state on every migration branch", () => {
    expect(migrateSidebarViewState(undefined).stateFilter).toEqual([]);
    expect(
      migrateSidebarViewState({ groupModeByServerId: { "host-a": "status" } }).stateFilter,
    ).toEqual([]);
  });

  it("never keeps a state the five buckets do not name", () => {
    expect(migrateSidebarViewState({ stateFilter: ["bogus"] }).stateFilter).toEqual([]);
  });
});
