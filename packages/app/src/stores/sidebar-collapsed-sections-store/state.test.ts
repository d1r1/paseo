import { describe, expect, it } from "vitest";
import {
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
    collapsedBoardIssueIds: new Set(),
    collapsedPinned: false,
  };
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
      collapsedBoardIssueIds: new Set(["DSK-34"]),
      collapsedPinned: true,
    };

    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedWorkspaceGroupKeys: ["running"],
      collapsedBoardIssueIds: ["DSK-34"],
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
  });
});

describe("sidebar collapsed board Issues", () => {
  it("toggles an Issue on and off without touching the other sets", () => {
    let state = setProjectCollapsed(emptyState(), "project-a", true);

    state = toggleBoardIssueCollapsed(state, "DSK-34");
    state = toggleBoardIssueCollapsed(state, "DSK-36");
    expect(Array.from(state.collapsedBoardIssueIds)).toEqual(["DSK-34", "DSK-36"]);

    state = toggleBoardIssueCollapsed(state, "DSK-34");
    expect(Array.from(state.collapsedBoardIssueIds)).toEqual(["DSK-36"]);
    expect(Array.from(state.collapsedProjectKeys)).toEqual(["project-a"]);
  });

  it("returns a new state object with a new set, leaving the old one as it was", () => {
    const before = emptyState();
    const after = toggleBoardIssueCollapsed(before, "DSK-34");

    expect(after).not.toBe(before);
    expect(after.collapsedBoardIssueIds).not.toBe(before.collapsedBoardIssueIds);
    expect(before.collapsedBoardIssueIds.size).toBe(0);
  });

  it("restores collapsed Issues from a persisted value, as after a reload", () => {
    const persisted = serializeCollapsedProjects(
      toggleBoardIssueCollapsed(toggleBoardIssueCollapsed(emptyState(), "DSK-34"), "DSK-36"),
    );

    const restored = mergePersistedCollapsedProjects(persisted, emptyState());

    expect(Array.from(restored.collapsedBoardIssueIds)).toEqual(["DSK-34", "DSK-36"]);
  });

  it("restores nothing collapsed from a persisted value written before the field existed", () => {
    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a"], collapsedPinned: true },
      emptyState(),
    );

    expect(Array.from(restored.collapsedBoardIssueIds)).toEqual([]);
    expect(Array.from(restored.collapsedProjectKeys)).toEqual(["project-a"]);
  });

  it("rejects the complete value when a persisted board Issue id is invalid", () => {
    const current = toggleBoardIssueCollapsed(emptyState(), "DSK-1");

    const restored = mergePersistedCollapsedProjects(
      { collapsedProjectKeys: ["project-a"], collapsedBoardIssueIds: ["DSK-34", 34] },
      current,
    );

    expect(restored).toBe(current);
    expect(Array.from(restored.collapsedProjectKeys)).toEqual([]);
  });

  it("keeps the same state object when the persisted Issues equal the current ones", () => {
    const current = toggleBoardIssueCollapsed(emptyState(), "DSK-34");

    expect(mergePersistedCollapsedProjects({ collapsedBoardIssueIds: ["DSK-34"] }, current)).toBe(
      current,
    );
    expect(
      mergePersistedCollapsedProjects({ collapsedBoardIssueIds: ["DSK-36"] }, current),
    ).not.toBe(current);
  });
});
