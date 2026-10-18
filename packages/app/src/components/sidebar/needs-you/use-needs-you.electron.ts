import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useShallow } from "zustand/shallow";
import { useSidebarBoard } from "@/components/sidebar/use-sidebar-board";
import { getHostRuntimeStore, isHostRuntimeConnected, useHosts } from "@/runtime/host-runtime";
import { useSessionStore, type Agent, type WorkspaceDescriptor } from "@/stores/session-store";
import type { PendingPermission } from "@/types/shared";
import { createFirstSeenStore } from "./needs-you-first-seen";
import {
  buildNeedsYouRows,
  type NeedsYouAgent,
  type NeedsYouPermission,
  type NeedsYouState,
  type NeedsYouWorkspace,
} from "./needs-you-rows";

/** Whether this build has the Needs-you section and its view. Only the desktop app does. */
export const NEEDS_YOU_ENABLED = true;

/** How often the displayed ages move on. The rows themselves update as the session stream does. */
export const NEEDS_YOU_TICK_INTERVAL_MS = 30_000;

// The client's first-seen record outlives any one mounted section or badge, so collapsing the
// sidebar does not restart the ages.
const firstSeenStore = createFirstSeenStore();

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), NEEDS_YOU_TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * What needs the user across every connected host: pending permissions and `wait=user` agents from
 * the live session stream, and runs that wait for the user from Desk's board file. Reads no board
 * when none is configured, and the rest stands without it.
 *
 * This is the Electron build of the hook. Web and native resolve `use-needs-you.ts`, which has no
 * rows.
 */
export function useNeedsYou(): NeedsYouState {
  const hosts = useHosts();
  const runtime = getHostRuntimeStore();
  const serverIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  useEffect(() => {
    const releases = serverIds.map((serverId) => runtime.acquireDirectoryDemand(serverId));
    return () => releases.forEach((release) => release());
  }, [runtime, serverIds]);
  // Re-renders this hook when a host connects or drops, which the session maps do not report.
  useSyncExternalStore(
    (onStoreChange) => runtime.subscribeAll(onStoreChange),
    () => runtime.getVersion(),
    () => runtime.getVersion(),
  );
  const connectedKey = serverIds
    .filter((serverId) => isHostRuntimeConnected(runtime.getSnapshot(serverId)))
    .join("\n");
  const connectedServerIds = useMemo(
    () => (connectedKey === "" ? [] : connectedKey.split("\n")),
    [connectedKey],
  );
  // One shallow-compared record per field, holding the stores' own Maps: an object built per
  // host here would be new on every store change and re-render this hook for all of them.
  const pendingPermissionsByServer = useSessionStore(
    useShallow((state) => {
      const selected: Record<string, Map<string, PendingPermission> | undefined> = {};
      for (const serverId of serverIds)
        selected[serverId] = state.sessions[serverId]?.pendingPermissions;
      return selected;
    }),
  );
  const agentsByServer = useSessionStore(
    useShallow((state) => {
      const selected: Record<string, Map<string, Agent> | undefined> = {};
      for (const serverId of serverIds) selected[serverId] = state.sessions[serverId]?.agents;
      return selected;
    }),
  );
  const workspacesByServer = useSessionStore(
    useShallow((state) => {
      const selected: Record<string, Map<string, WorkspaceDescriptor> | undefined> = {};
      for (const serverId of serverIds) selected[serverId] = state.sessions[serverId]?.workspaces;
      return selected;
    }),
  );
  const board = useSidebarBoard({ enabled: true });
  const seenAt = useSyncExternalStore(
    firstSeenStore.subscribe,
    firstSeenStore.get,
    firstSeenStore.get,
  );
  const now = useNow();

  const inputs = useMemo(() => {
    const permissions: NeedsYouPermission[] = [];
    const agents: NeedsYouAgent[] = [];
    const workspaces: NeedsYouWorkspace[] = [];
    for (const serverId of connectedServerIds) {
      for (const pending of pendingPermissionsByServer[serverId]?.values() ?? []) {
        permissions.push({ serverId, agentId: pending.agentId, request: pending.request });
      }
      for (const agent of agentsByServer[serverId]?.values() ?? []) {
        agents.push({
          serverId,
          id: agent.id,
          title: agent.title,
          workspaceId: agent.workspaceId ?? null,
          labels: agent.labels,
          updatedAt: agent.updatedAt.getTime(),
          archived: Boolean(agent.archivedAt),
        });
      }
      for (const workspace of workspacesByServer[serverId]?.values() ?? []) {
        if (workspace.archivingAt) continue;
        workspaces.push({ serverId, workspaceId: workspace.id, name: workspace.name });
      }
    }
    return { permissions, agents, workspaces };
  }, [agentsByServer, connectedServerIds, pendingPermissionsByServer, workspacesByServer]);

  const result = useMemo(
    () => buildNeedsYouRows({ ...inputs, board, firstSeen: seenAt, now }),
    [inputs, board, seenAt, now],
  );
  const keys = useMemo(() => result.rows.map((row) => row.key), [result.rows]);
  const [owner] = useState(() => Symbol("needs-you"));
  useEffect(() => {
    firstSeenStore.record(owner, keys);
  }, [owner, keys]);
  useEffect(() => () => firstSeenStore.release(owner), [owner]);

  return useMemo(() => ({ ...result, now }), [result, now]);
}
