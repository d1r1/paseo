import type { AgentPermissionAction, AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { Board } from "@/desktop/board/board-file";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";
import { parseBoardIssueId } from "../sidebar-board";

/** The label Desk's Issue managers put on themselves while they wait for the user. */
const WAIT_LABEL_KEY = "wait";
const WAIT_LABEL_USER = "user";

export interface NeedsYouPermission {
  serverId: string;
  agentId: string;
  request: AgentPermissionRequest;
}

export interface NeedsYouAgent {
  serverId: string;
  id: string;
  title: string | null;
  workspaceId: string | null;
  labels: Readonly<Record<string, string>>;
  /** Epoch milliseconds of the daemon's last update of the agent. */
  updatedAt: number;
  archived: boolean;
}

export interface NeedsYouWorkspace {
  serverId: string;
  workspaceId: string;
  name: string;
}

export interface NeedsYouInput {
  permissions: readonly NeedsYouPermission[];
  agents: readonly NeedsYouAgent[];
  /** Every eligible workspace, unfiltered, in the order the first match is taken from. */
  workspaces: readonly NeedsYouWorkspace[];
  board: Board | null;
  /** When the client first saw each row key waiting; see `reconcileFirstSeen`. */
  firstSeen: ReadonlyMap<string, number>;
  now: number;
}

/** The tab a row opens: a workspace, and an agent in it when the row has one. */
export interface NeedsYouTarget {
  serverId: string;
  workspaceId: string;
  agentId: string | null;
}

interface NeedsYouRowBase {
  key: string;
  title: string;
  /** Where the wait is: the agent, the workspace or the run step; null when nothing names it. */
  context: string | null;
  /** Epoch milliseconds the wait is taken to have begun; rows are ordered by it. */
  since: number;
  /** What the row opens; null when no workspace is known (the row is listed and inert). */
  target: NeedsYouTarget | null;
}

export interface NeedsYouPermissionRow extends NeedsYouRowBase {
  kind: "permission";
  serverId: string;
  agentId: string;
  requestId: string;
  request: AgentPermissionRequest;
  /** False for `question` and `plan` requests: they need their form, so the row opens the tab. */
  inline: boolean;
}

export interface NeedsYouLabelRow extends NeedsYouRowBase {
  kind: "label";
}

export interface NeedsYouRunRow extends NeedsYouRowBase {
  kind: "run";
}

export type NeedsYouRow = NeedsYouPermissionRow | NeedsYouLabelRow | NeedsYouRunRow;

export interface NeedsYouResult {
  rows: NeedsYouRow[];
  /** Always `rows.length`: the header shows it and the dock badge is it. */
  count: number;
}

export function permissionRowKey(permission: NeedsYouPermission): string {
  return `permission:${permission.serverId}:${permission.agentId}:${permission.request.id}`;
}

function labelRowKey(agent: NeedsYouAgent): string {
  return `label:${agent.serverId}:${agent.id}`;
}

function runRowKey(issueId: string): string {
  return `run:${issueId}`;
}

function agentIdentity(serverId: string, agentId: string): string {
  return `${serverId}:${agentId}`;
}

function workspaceIdentity(serverId: string, workspaceId: string | null): string | null {
  const normalized = normalizeWorkspaceOpaqueId(workspaceId);
  return normalized === null ? null : `${serverId}:${normalized}`;
}

function waitsForUser(agent: NeedsYouAgent): boolean {
  return agent.labels[WAIT_LABEL_KEY] === WAIT_LABEL_USER;
}

/** Whether the request is answered inline: allow or deny, with no form of its own. */
function isInlineRequest(request: AgentPermissionRequest): boolean {
  return request.kind !== "question" && request.kind !== "plan";
}

/**
 * The actions a permission row offers, as the agent panel's card resolves them: the request's own
 * `actions`, else deny and accept. A request that is not answered inline has none.
 */
export function resolvePermissionActions(
  request: AgentPermissionRequest,
  labels: { accept: string; deny: string },
): AgentPermissionAction[] {
  if (!isInlineRequest(request)) return [];
  if (Array.isArray(request.actions) && request.actions.length > 0) return request.actions;
  return [
    { id: "reject", label: labels.deny, behavior: "deny", variant: "danger", intent: "dismiss" },
    { id: "accept", label: labels.accept, behavior: "allow", variant: "primary" },
  ];
}

function olderOf(first: number | undefined, second: number | undefined, fallback: number): number {
  if (first === undefined && second === undefined) return fallback;
  return Math.min(first ?? Number.POSITIVE_INFINITY, second ?? Number.POSITIVE_INFINITY);
}

/** What the three row builders share: lookups over the agents and the workspaces. */
interface NeedsYouIndex {
  agentsByIdentity: ReadonlyMap<string, NeedsYouAgent>;
  workspaceNameByIdentity: ReadonlyMap<string, string>;
  issueIdByWorkspaceIdentity: ReadonlyMap<string, string>;
  firstWorkspaceByIssueId: ReadonlyMap<string, NeedsYouWorkspace>;
}

function indexInput(input: NeedsYouInput): NeedsYouIndex {
  const agentsByIdentity = new Map<string, NeedsYouAgent>();
  for (const agent of input.agents) {
    agentsByIdentity.set(agentIdentity(agent.serverId, agent.id), agent);
  }
  const workspaceNameByIdentity = new Map<string, string>();
  const issueIdByWorkspaceIdentity = new Map<string, string>();
  const firstWorkspaceByIssueId = new Map<string, NeedsYouWorkspace>();
  for (const workspace of input.workspaces) {
    const identity = workspaceIdentity(workspace.serverId, workspace.workspaceId);
    if (identity === null) continue;
    workspaceNameByIdentity.set(identity, workspace.name);
    const issueId = parseBoardIssueId(workspace.name);
    if (issueId === null) continue;
    issueIdByWorkspaceIdentity.set(identity, issueId);
    if (!firstWorkspaceByIssueId.has(issueId)) firstWorkspaceByIssueId.set(issueId, workspace);
  }
  return {
    agentsByIdentity,
    workspaceNameByIdentity,
    issueIdByWorkspaceIdentity,
    firstWorkspaceByIssueId,
  };
}

function targetOf(
  serverId: string,
  workspaceId: string | null,
  agentId: string | null,
): NeedsYouTarget | null {
  const normalized = normalizeWorkspaceOpaqueId(workspaceId);
  return normalized === null ? null : { serverId, workspaceId: normalized, agentId };
}

function workspaceNameOf(
  index: NeedsYouIndex,
  serverId: string,
  workspaceId: string | null,
): string | null {
  const identity = workspaceIdentity(serverId, workspaceId);
  return identity === null ? null : (index.workspaceNameByIdentity.get(identity) ?? null);
}

function permissionRows(input: NeedsYouInput, index: NeedsYouIndex): NeedsYouPermissionRow[] {
  const rows: NeedsYouPermissionRow[] = [];
  for (const permission of input.permissions) {
    const agent = index.agentsByIdentity.get(
      agentIdentity(permission.serverId, permission.agentId),
    );
    if (agent?.archived) continue;
    const key = permissionRowKey(permission);
    const { request } = permission;
    rows.push({
      kind: "permission",
      key,
      serverId: permission.serverId,
      agentId: permission.agentId,
      requestId: request.id,
      request,
      inline: isInlineRequest(request),
      title: request.title ?? request.name ?? request.kind,
      context:
        agent?.title ?? workspaceNameOf(index, permission.serverId, agent?.workspaceId ?? null),
      since: olderOf(input.firstSeen.get(key), agent?.updatedAt, input.now),
      target: agent ? targetOf(agent.serverId, agent.workspaceId, agent.id) : null,
    });
  }
  return rows;
}

function labelRows(
  input: NeedsYouInput,
  index: NeedsYouIndex,
  agentsWithPermission: ReadonlySet<string>,
): NeedsYouLabelRow[] {
  const rows: NeedsYouLabelRow[] = [];
  for (const agent of input.agents) {
    if (agent.archived || !waitsForUser(agent)) continue;
    if (agentsWithPermission.has(agentIdentity(agent.serverId, agent.id))) continue;
    const key = labelRowKey(agent);
    const workspaceName = workspaceNameOf(index, agent.serverId, agent.workspaceId);
    rows.push({
      kind: "label",
      key,
      title: agent.title ?? workspaceName ?? agent.id,
      context: agent.title === null ? null : workspaceName,
      since: olderOf(input.firstSeen.get(key), agent.updatedAt, input.now),
      target: targetOf(agent.serverId, agent.workspaceId, agent.id),
    });
  }
  return rows;
}

/** The Issues that have a live `wait=user` agent in one of their workspaces. */
function issueIdsWithWaitingAgent(input: NeedsYouInput, index: NeedsYouIndex): Set<string> {
  const issueIds = new Set<string>();
  for (const agent of input.agents) {
    if (agent.archived || !waitsForUser(agent)) continue;
    const identity = workspaceIdentity(agent.serverId, agent.workspaceId);
    const issueId = identity === null ? undefined : index.issueIdByWorkspaceIdentity.get(identity);
    if (issueId !== undefined) issueIds.add(issueId);
  }
  return issueIds;
}

function runRows(
  input: NeedsYouInput,
  index: NeedsYouIndex,
  coveredIssueIds: ReadonlySet<string>,
): NeedsYouRunRow[] {
  const rows: NeedsYouRunRow[] = [];
  const seenIssueIds = new Set<string>();
  for (const issue of input.board?.issues ?? []) {
    if (seenIssueIds.has(issue.id)) continue;
    seenIssueIds.add(issue.id);
    if (!issue.run?.waitsForUser || coveredIssueIds.has(issue.id)) continue;
    const key = runRowKey(issue.id);
    const workspace = index.firstWorkspaceByIssueId.get(issue.id);
    rows.push({
      kind: "run",
      key,
      title: `${issue.id} ${issue.title}`,
      context: issue.run.step,
      since: olderOf(input.firstSeen.get(key), undefined, input.now),
      target: workspace ? targetOf(workspace.serverId, workspace.workspaceId, null) : null,
    });
  }
  return rows;
}

/**
 * Every wait that needs the user, oldest first.
 *
 * Three sources, one row each: a pending permission (always its own row, it carries the answer), an
 * agent labelled `wait=user`, and a board Issue whose run `waitsForUser`. One wait is listed once:
 * a label row yields to a pending permission of the same agent, and a run row yields to a
 * `wait=user` agent in a workspace of that Issue. An archived agent adds no row.
 *
 * No source carries the time its wait began, so the age is the client's. A permission or a label
 * is the older of the time the client first saw it and the agent's `updatedAt`; a run is the time
 * the client first saw the flag. A wait that began before the app started is therefore dated by the
 * agent's last update, or by the app start, and "oldest first" is approximate for those rows.
 */
export function buildNeedsYouRows(input: NeedsYouInput): NeedsYouResult {
  const index = indexInput(input);
  const permissions = permissionRows(input, index);
  const agentsWithPermission = new Set(
    permissions.map((row) => agentIdentity(row.serverId, row.agentId)),
  );
  const rows: NeedsYouRow[] = [
    ...permissions,
    ...labelRows(input, index, agentsWithPermission),
    ...runRows(input, index, issueIdsWithWaitingAgent(input, index)),
  ];
  rows.sort((left, right) => left.since - right.since || compareKeys(left.key, right.key));
  return { rows, count: rows.length };
}

function compareKeys(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** A compact age for a row: `42s`, `5m`, `1h 5m`, `2h`, `1d 2h`, `2d`. Never negative. */
export function formatNeedsYouAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}

/** What `useNeedsYou` gives: the rows, their count, and the `now` their ages are measured at. */
export interface NeedsYouState extends NeedsYouResult {
  now: number;
}
