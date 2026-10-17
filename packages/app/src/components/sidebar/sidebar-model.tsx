import { useTranslation } from "react-i18next";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  useSidebarWorkspacesList,
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
  type SidebarWorkspacesListResult,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarWorkspaceEntries } from "@/hooks/use-sidebar-workspace-entries";
import { usePinnedSidebarKeys, type PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import {
  collapsedBoardIssueIdsForView,
  useSidebarCollapsedSectionsStore,
} from "@/stores/sidebar-collapsed-sections-store";
import {
  hasActiveSidebarLabelFilter,
  useSidebarViewStore,
  type SidebarGroupMode,
} from "@/stores/sidebar-view-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import type { SidebarShortcutModel } from "@/utils/sidebar-shortcuts";
import { buildSidebarProjection } from "./sidebar-projection";
import {
  boardViewTeam,
  resolveBoardView,
  resolveBoardViews,
  splitSidebarBoard,
  type BoardView,
} from "./sidebar-board";
import { useSidebarBoard } from "./use-sidebar-board";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { filterWorkspacesByLabels, type SidebarWorkspaceGroup } from "./sidebar-labels";
import { filterWorkspacesByProjects, resolveActiveProjectFilters } from "./sidebar-project-filter";
import {
  hasAuthoritativeWorkspaceLabelCatalog,
  useWorkspaceLabelProjection,
} from "@/workspace-labels";

interface SidebarModel extends SidebarWorkspacesListResult {
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  /**
   * The workspaces Desk's board file orders, in board order, each with its Issue's status and run
   * step. Empty without a usable board or a match. They are listed here only: `pinnedGroups`,
   * `workspaceGroups` and each project's rows leave them out so every workspace shows once.
   */
  boardWorkspaces: SidebarWorkspaceEntry[];
  /** The views the board filter offers (`resolveBoardViews`); empty without a usable board. */
  boardViews: BoardView[];
  /** The view in effect: the stored one when `boardViews` carries it, else `all`. */
  boardView: string;
  setBoardView: (viewKey: string) => void;
  /**
   * A team view is on: the list shows the board block alone. `pinnedGroups`, `workspaceGroups`
   * and `shortcutModel` are then built over no other workspace, so the shortcut numbers walk
   * the block. `projects` and `workspaceEntriesByKey` still hold every eligible workspace.
   */
  boardOnly: boolean;
  /**
   * Every project the sidebar could show, before any filter narrows it.
   *
   * `projects` is the FILTERED list. A surface that offers a filter picker must read this one, or
   * narrowing the filter deletes the rows that would undo it.
   */
  allProjects: SidebarProjectEntry[];
  /** The project filter as it is actually being applied — see `resolveActiveProjectFilters`. */
  resolvedProjectFilters: readonly string[];
  hasProjectsBeforeFilter: boolean;
  groupMode: SidebarGroupMode;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  collapsedProjectKeys: ReadonlySet<string>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  /**
   * Collapses or expands the sub-issue rows under a board row's Issue in the view in effect; see
   * `splitSidebarBoard`. Each view keeps its own collapsed set.
   */
  toggleBoardIssueCollapsed: (issueId: string) => void;
  shortcutModel: SidebarShortcutModel;
}

const SidebarModelContext = createContext<SidebarModel | null>(null);

const NO_PROJECTS: SidebarProjectEntry[] = [];
const NO_WORKSPACE_ENTRIES: ReadonlyMap<string, SidebarWorkspaceEntry> = new Map();

export function SidebarModelProvider({
  active,
  children,
}: {
  active?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const list = useSidebarWorkspacesList({ enabled: active });
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const projectFilters = useSidebarViewStore((state) => state.projectFilters);
  const storedBoardView = useSidebarViewStore((state) => state.boardView);
  const setBoardView = useSidebarViewStore((state) => state.setBoardView);
  const reconcileLabelFilter = useSidebarViewStore((state) => state.reconcileLabelFilter);
  const { hosts: labelHosts } = useWorkspaceLabelProjection();
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedWorkspaceGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedWorkspaceGroupKeys,
  );
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const pinnedWorkspaceOrder = useSidebarOrderStore((state) => state.pinnedWorkspaceOrder);
  const toggleProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );
  const collapsedBoardIssueIdsByView = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedBoardIssueIdsByView,
  );
  const toggleBoardIssueCollapsedInView = useSidebarCollapsedSectionsStore(
    (state) => state.toggleBoardIssueCollapsed,
  );
  const availableLabelNames = useMemo(
    () => labelHosts.flatMap((host) => host.labels.map((label) => label.name)),
    [labelHosts],
  );
  const hasAuthoritativeLabelCatalog = hasAuthoritativeWorkspaceLabelCatalog(labelHosts);
  useEffect(() => {
    if (!hasAuthoritativeLabelCatalog) return;
    reconcileLabelFilter(availableLabelNames);
  }, [availableLabelNames, hasAuthoritativeLabelCatalog, reconcileLabelFilter]);
  const hasActiveLabelFilter = hasActiveSidebarLabelFilter(labelFilter);
  const resolvedProjectFilters = useMemo(
    () =>
      resolveActiveProjectFilters(
        projectFilters,
        new Set(list.projects.map((project) => project.viewKey)),
      ),
    [projectFilters, list.projects],
  );
  const hasActiveProjectFilter = resolvedProjectFilters.length > 0;
  // The project filter is deliberately absent from this gate. It reads `projectViewKey`, which
  // lives on the project and the placement, so it can narrow the project list without hydrating
  // anything; the label filter reads `labels`, which only exists on an entry. Hydration opens a
  // live session-store subscription over every workspace on every visible host, so widening this
  // for a filter that does not need it costs a retained-but-inactive sidebar real work.
  const needsWorkspaceEntries = groupMode !== "project" || hasActiveLabelFilter;
  const workspaceEntriesByKey = useSidebarWorkspaceEntries(
    list.workspacePlacements,
    active !== false || needsWorkspaceEntries,
  );
  const filteredWorkspaceEntriesByKey = useMemo(() => {
    const byProject = filterWorkspacesByProjects({
      workspaces: [...workspaceEntriesByKey.values()],
      projectFilters: resolvedProjectFilters,
    });
    const filtered = filterWorkspacesByLabels({ workspaces: byProject, ...labelFilter });
    return new Map(filtered.map((workspace) => [workspace.workspaceKey, workspace]));
  }, [labelFilter, resolvedProjectFilters, workspaceEntriesByKey]);
  const visibleWorkspaceKeys = useMemo(
    () => new Set(filteredWorkspaceEntriesByKey.keys()),
    [filteredWorkspaceEntriesByKey],
  );
  // The two filters prune differently on purpose. The project filter is a membership test on the
  // project itself, so a project you filtered TO survives even with no workspaces — it still owns
  // a header row you can create your first workspace under. The label filter can only ask about
  // workspaces, so a project it empties has nothing left to show.
  const filteredProjects = useMemo(() => {
    let projects = list.projects;
    if (hasActiveProjectFilter) {
      const included = new Set(resolvedProjectFilters);
      projects = projects.filter((project) => included.has(project.viewKey));
    }
    if (hasActiveLabelFilter) {
      projects = projects.flatMap((project) => {
        const workspaces = project.workspaces.filter((workspace) =>
          visibleWorkspaceKeys.has(workspace.workspaceKey),
        );
        return workspaces.length > 0 ? [{ ...project, workspaces }] : [];
      });
    }
    return projects;
  }, [
    hasActiveLabelFilter,
    hasActiveProjectFilter,
    resolvedProjectFilters,
    list.projects,
    visibleWorkspaceKeys,
  ]);
  // The board only reorders and annotates: the stored project, workspace and pin orders are read
  // and written as before, and a workspace the board takes is just left out of the lists below it.
  // Collapse is applied here, before the projection, so the keyboard shortcut numbers skip a
  // hidden row as they skip a collapsed project's.
  const board = useSidebarBoard({ enabled: active !== false });
  const boardViews = useMemo(() => resolveBoardViews(board), [board]);
  // The stored view is resolved, never rewritten: a team the file no longer carries falls back to
  // `all` here and applies again when a file carries it, as `resolveActiveProjectFilters` does.
  const boardView = resolveBoardView(boardViews, storedBoardView);
  const boardTeam = boardViewTeam(boardView);
  const boardOnly = boardTeam !== null;
  const collapsedBoardIssueIds = collapsedBoardIssueIdsForView(
    { collapsedBoardIssueIdsByView },
    boardView,
  );
  const toggleBoardIssueCollapsed = useCallback(
    (issueId: string) => toggleBoardIssueCollapsedInView(boardView, issueId),
    [boardView, toggleBoardIssueCollapsedInView],
  );
  const {
    boardWorkspaces,
    projects: unboardedProjects,
    workspaceEntriesByKey: unboardedWorkspaceEntriesByKey,
  } = useMemo(
    () =>
      splitSidebarBoard({
        board,
        projects: filteredProjects,
        workspaceEntriesByKey: filteredWorkspaceEntriesByKey,
        collapsedIssueIds: collapsedBoardIssueIds,
        team: boardTeam,
      }),
    [board, boardTeam, collapsedBoardIssueIds, filteredProjects, filteredWorkspaceEntriesByKey],
  );
  // A team view lists the board block alone: the lists below it are built over nothing, so the
  // Pinned section, the groups and the unmatched workspaces are not shown and not numbered.
  const listedProjects = boardOnly ? NO_PROJECTS : unboardedProjects;
  const listedWorkspaceEntriesByKey = boardOnly
    ? NO_WORKSPACE_ENTRIES
    : unboardedWorkspaceEntriesByKey;
  const pinnedKeys = usePinnedSidebarKeys(listedProjects);
  const projectionInput = useMemo(
    () => ({
      projects: listedProjects,
      pinnedKeys,
      boardWorkspaces,
      iconProjects: filteredProjects,
      pinnedWorkspaceOrder,
      workspaceEntriesByKey: listedWorkspaceEntriesByKey,
      projectNamesByViewKey: list.projectNamesByViewKey,
      groupMode,
      pinnedCollapsed,
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      t,
    }),
    [
      collapsedProjectKeys,
      collapsedWorkspaceGroupKeys,
      groupMode,
      list.projectNamesByViewKey,
      listedProjects,
      filteredProjects,
      boardWorkspaces,
      pinnedCollapsed,
      pinnedKeys,
      pinnedWorkspaceOrder,
      listedWorkspaceEntriesByKey,
      t,
    ],
  );
  const projection = useMemo(() => buildSidebarProjection(projectionInput), [projectionInput]);
  const value = useMemo(
    () => ({
      ...list,
      projects: filteredProjects,
      allProjects: list.projects,
      resolvedProjectFilters,
      hasProjectsBeforeFilter: list.projects.length > 0,
      workspaceEntriesByKey: filteredWorkspaceEntriesByKey,
      boardWorkspaces,
      boardViews,
      boardView,
      setBoardView,
      boardOnly,
      groupMode,
      workspaceGroups: projection.workspaceGroups,
      projectIconTargets: projection.projectIconTargets,
      pinnedGroups: projection.pinnedGroups,
      collapsedProjectKeys,
      toggleProjectCollapsed,
      toggleBoardIssueCollapsed,
      shortcutModel: projection.shortcutModel,
    }),
    [
      resolvedProjectFilters,
      collapsedProjectKeys,
      groupMode,
      list,
      filteredProjects,
      projection,
      toggleProjectCollapsed,
      toggleBoardIssueCollapsed,
      filteredWorkspaceEntriesByKey,
      boardWorkspaces,
      boardViews,
      boardView,
      setBoardView,
      boardOnly,
    ],
  );

  return <SidebarModelContext.Provider value={value}>{children}</SidebarModelContext.Provider>;
}

export function useSidebarModel(): SidebarModel {
  const model = useContext(SidebarModelContext);
  if (!model) throw new Error("SidebarModelProvider is required");
  return model;
}
