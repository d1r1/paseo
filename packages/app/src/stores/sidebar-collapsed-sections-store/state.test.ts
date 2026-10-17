import { describe, expect, it } from "vitest";
import {
  ALL_BOARD_VIEW_KEY,
  collapsedBoardIssueIdsForView,
  type CollapsedProjectsState,
  mergePersistedCollapsedProjects,
  serializeCollapsedProjects,
  setProjectCollapsed,
  toggleBoardIssueCollapsed,
  togglePinnedCollapsed,
  toggleProjectCollapsed,
  toggleWorkspaceGroupCollapsed,
} from "@/stores/sidebar-collapsed-sections-store/state";

function emptyState(): CollapsedProjectsState {
  return {
    collapsedProjectKeys: new Set(),
    collapsedWorkspaceGroupKeys: new Set(),
    collapsedBoardIssueIdsByView: new Map(),
    collapsedPinned: false,
  };
}

function boardIssueIds(state: CollapsedProjectsState, viewKey: string): string[] {
  return Array.from(collapsedBoardIssueIdsForView(state, viewKey));
}

describe("sidebar collapsed projects transitions", () => {
  it("tracks collapsed project keys as a Set", () => {
    let state = emptyState();

    state = setProjectCollapsed(state, "project-a", true);
    state = toggleProjectCollapsed(state, "project-b");
    state = toggleProjectCollapsed(state, "project-a");
    state = toggleWorkspaceGroupCollapsed(state, "running");

    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-b"]);
    expect(Array.from(state.collapsedWorkspaceGroupKeys)).toEqual(["running"]);
  });

  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedWorkspaceGroupKeys: new Set(["running"]),
      collapsedBoardIssueIdsByView: new Map([
        [ALL_BOARD_VIEW_KEY, new Set(["DSK-34"])],
        ["DSK", new Set(["DSK-34", "DSK-36"])],
      ]),
      collapsedPinned: true,
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedWorkspaceGroupKeys: ["running"],
      collapsedBoardIssueIdsByView: { all: ["DSK-34"], DSK: ["DSK-34", "DSK-36"] },
      collapsedPinned: true,
    });
  });

  it("toggles and restores the pinned section collapse flag", () => {
    const toggled = togglePinnedCollapsed(emptyState());
    expect(toggled.collapsedPinned).toBe(true);

    const restored = mergePersistedCollapsedProjects({ collapsedPinned: true }, emptyState());
    expect(restored.collapsedPinned).toBe(true);
  });

  it("rejects the complete value when a persisted project key is invalid", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a", "project-b", 42] },
      emptyState(),
    );

    expect(Array.from(restored.collapsedProjectKeys)).toEqual([]);
    expect(Array.from(restored.collapsedWorkspaceGroupKeys)).toEqual([]);
  });

  it("keeps the existing state object when persisted preferences do not change collapsed keys", () => {
    const currentState = emptyState();

    expect(mergePersistedCollapsedProjects(undefined, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({}, currentState)).toBe(currentState);
    expect(mergePersistedCollapsedProjects({ collapsedProjectKeys: [] }, currentState)).toBe(
      currentState,
    );
    expect(mergePersistedCollapsedProjects({ collapsedBoardIssueIds: [] }, currentState)).toBe(
      currentState,
    );
    expect(
      mergePersistedCollapsedProjects({ collapsedBoardIssueIdsByView: {} }, currentState),
    ).toBe(currentState);
    expect(
      mergePersistedCollapsedProjects({ collapsedBoardIssueIdsByView: { DSK: [] } }, currentState),
    ).toBe(currentState);
  });
});

describe("sidebar collapsed board Issues", () => {
  it("toggles an Issue on and off in one view without touching the other views or sets", () => {
    let state = setProjectCollapsed(emptyState(), "project-a", true);
    state = toggleBoardIssueCollapsed(state, "DSK", "DSK-99");

    state = toggleBoardIssueCollapsed(state, ALL_BOARD_VIEW_KEY, "DSK-34");
    state = toggleBoardIssueCollapsed(state, ALL_BOARD_VIEW_KEY, "DSK-36");
    expect(boardIssueIds(state, ALL_BOARD_VIEW_KEY)).toEqual(["DSK-34", "DSK-36"]);
    expect(boardIssueIds(state, "DSK")).toEqual(["DSK-99"]);

    state = toggleBoardIssueCollapsed(state, ALL_BOARD_VIEW_KEY, "DSK-34");
    expect(boardIssueIds(state, ALL_BOARD_VIEW_KEY)).toEqual(["DSK-36"]);
    expect(boardIssueIds(state, "DSK")).toEqual(["DSK-99"]);
    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-a"]);
  });

  it("has nothing collapsed in a view never toggled, and drops a view emptied by a toggle", () => {
    const empty = emptyState();
    expect(collapsedBoardIssueIdsForView(empty, "FLU").size).toBe(0);
    expect(collapsedBoardIssueIdsForView(empty, "FLU")).toBe(
      collapsedBoardIssueIdsForView(empty, ALL_BOARD_VIEW_KEY),
    );

    const toggledTwice = toggleBoardIssueCollapsed(
      toggleBoardIssueCollapsed(empty, "FLU", "FLU-1"),
      "FLU",
      "FLU-1",
    );
    expect(toggledTwice.collapsedBoardIssueIdsByView.size).toBe(0);
    expect(serializeCollapsedProjects(toggledTwice).collapsedBoardIssueIdsByView).toEqual({});
  });

  it("returns a new state object with a new map and set, leaving the old ones as they were", () => {
    const before = toggleBoardIssueCollapsed(emptyState(), "DSK", "DSK-1");
    const after = toggleBoardIssueCollapsed(before, "DSK", "DSK-34");

    expect(after).not.toBe(before);
    expect(after.collapsedBoardIssueIdsByView).not.toBe(before.collapsedBoardIssueIdsByView);
    expect(after.collapsedBoardIssueIdsByView.get("DSK")).not.toBe(
      before.collapsedBoardIssueIdsByView.get("DSK"),
    );
    expect(boardIssueIds(before, "DSK")).toEqual(["DSK-1"]);
    expect(boardIssueIds(after, "DSK")).toEqual(["DSK-1", "DSK-34"]);
  });

  it("restores the collapsed Issues of every view from a persisted value, as after a reload", () => {
    let state = toggleBoardIssueCollapsed(emptyState(), ALL_BOARD_VIEW_KEY, "DSK-34");
    state = toggleBoardIssueCollapsed(state, ALL_BOARD_VIEW_KEY, "DSK-36");
    state = toggleBoardIssueCollapsed(state, "FLU", "FLU-1");
    const persisted = serializeCollapsedProjects(state);

    const restored = mergePersistedCollapsedProjects(persisted, emptyState());

    expect(boardIssueIds(restored, ALL_BOARD_VIEW_KEY)).toEqual(["DSK-34", "DSK-36"]);
    expect(boardIssueIds(restored, "FLU")).toEqual(["FLU-1"]);
    expect(boardIssueIds(restored, "DSK")).toEqual([]);
  });

  it("restores a value written before views existed as the all view's set", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a"], collapsedBoardIssueIds: ["DSK-34", "DSK-36"] },
      emptyState(),
    );

    expect(boardIssueIds(restored, ALL_BOARD_VIEW_KEY)).toEqual(["DSK-34", "DSK-36"]);
    expect(boardIssueIds(restored, "DSK")).toEqual([]);
    expect(Array.from(restored.collapsedProjectKeys)).toEqual(["project-a"]);
  });

  it("reads the per-view record over the old field when a value carries both", () => {
    const restored = mergePersistedCollapsedProjects(
      {
        collapsedBoardIssueIds: ["DSK-34"],
        collapsedBoardIssueIdsByView: { DSK: ["DSK-36"] },
      },
      emptyState(),
    );

    expect(boardIssueIds(restored, ALL_BOARD_VIEW_KEY)).toEqual([]);
    expect(boardIssueIds(restored, "DSK")).toEqual(["DSK-36"]);
  });

  it("restores nothing collapsed from a persisted value written before either field existed", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a"], collapsedPinned: true },
      emptyState(),
    );

    expect(restored.collapsedBoardIssueIdsByView.size).toBe(0);
    expect(Array.from(restored.collapsedProjectKeys)).toEqual(["project-a"]);
  });

  it("rejects the complete value when a persisted board Issue id or view is invalid", () => {
    const current = toggleBoardIssueCollapsed(emptyState(), "DSK", "DSK-1");

    expect(
      mergePersistedCollapsedProjects(
        { collapsedProjectKeys: ["project-a"], collapsedBoardIssueIds: ["DSK-34", 34] },
        current,
      ),
    ).toBe(current);
    expect(
      mergePersistedCollapsedProjects(
        { collapsedProjectKeys: ["project-a"], collapsedBoardIssueIdsByView: { DSK: "DSK-34" } },
        current,
      ),
    ).toBe(current);
    expect(
      mergePersistedCollapsedProjects(
        { collapsedProjectKeys: ["project-a"], collapsedBoardIssueIdsByView: ["DSK-34"] },
        current,
      ),
    ).toBe(current);
    expect(Array.from(current.collapsedProjectKeys)).toEqual([]);
  });

  it("keeps the same state object when the persisted views equal the current ones", () => {
    const current = toggleBoardIssueCollapsed(
      toggleBoardIssueCollapsed(emptyState(), ALL_BOARD_VIEW_KEY, "DSK-34"),
      "FLU",
      "FLU-1",
    );

    expect(
      mergePersistedCollapsedProjects(
        { collapsedBoardIssueIdsByView: { all: ["DSK-34"], FLU: ["FLU-1"] } },
        current,
      ),
    ).toBe(current);
    expect(
      mergePersistedCollapsedProjects(
        { collapsedBoardIssueIdsByView: { all: ["DSK-34"] } },
        current,
      ),
    ).not.toBe(current);
    expect(
      mergePersistedCollapsedProjects(
        { collapsedBoardIssueIdsByView: { all: ["DSK-36"], FLU: ["FLU-1"] } },
        current,
      ),
    ).not.toBe(current);
    expect(
      mergePersistedCollapsedProjects(
        { collapsedBoardIssueIdsByView: { all: ["DSK-34"], FLU: ["FLU-1"], DSK: ["DSK-1"] } },
        current,
      ),
    ).not.toBe(current);
  });
});
