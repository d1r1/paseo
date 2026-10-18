import { describe, expect, it } from "vitest";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { Board, BoardIssue } from "@/desktop/board/board-file";
import {
  buildNeedsYouRows,
  formatNeedsYouAge,
  type NeedsYouAgent,
  type NeedsYouInput,
  type NeedsYouPermission,
  type NeedsYouWorkspace,
} from "./needs-you-rows";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const MINUTE = 60_000;

function minutesAgo(minutes: number): number {
  return NOW - minutes * MINUTE;
}

function request(overrides: Partial<AgentPermissionRequest> = {}): AgentPermissionRequest {
  return {
    id: "req-1",
    provider: "claude",
    name: "Bash",
    kind: "tool",
    title: "notary commit",
    ...overrides,
  } as AgentPermissionRequest;
}

function permission(overrides: Partial<NeedsYouPermission> = {}): NeedsYouPermission {
  return { serverId: "s1", agentId: "a1", request: request(), ...overrides };
}

function agent(overrides: Partial<NeedsYouAgent> = {}): NeedsYouAgent {
  return {
    serverId: "s1",
    id: "a1",
    title: "Implementer",
    workspaceId: "w1",
    labels: {},
    updatedAt: minutesAgo(1),
    archived: false,
    ...overrides,
  };
}

function workspace(overrides: Partial<NeedsYouWorkspace> = {}): NeedsYouWorkspace {
  return { serverId: "s1", workspaceId: "w1", name: "DSK-51 needs you", ...overrides };
}

function issue(overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    id: "DSK-51",
    title: "A Needs-you view",
    team: "DSK",
    status: "In Progress",
    parent: null,
    sortOrder: 1,
    run: { state: "waiting", step: "intake", waitsForUser: true },
    ...overrides,
  };
}

function boardOf(...issues: BoardIssue[]): Board {
  return { generatedAt: "2026-10-18T12:00:00Z", issues };
}

function input(overrides: Partial<NeedsYouInput> = {}): NeedsYouInput {
  return {
    permissions: [],
    agents: [],
    workspaces: [],
    board: null,
    firstSeen: new Map(),
    now: NOW,
    ...overrides,
  };
}

describe("buildNeedsYouRows", () => {
  it("is empty with nothing waiting", () => {
    expect(buildNeedsYouRows(input())).toEqual({ rows: [], count: 0 });
  });

  it("lists a pending permission as its own row with an inline answer", () => {
    const { rows } = buildNeedsYouRows(
      input({
        permissions: [permission()],
        agents: [agent()],
        workspaces: [workspace()],
        firstSeen: new Map([["permission:s1:a1:req-1", minutesAgo(5)]]),
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "permission",
      key: "permission:s1:a1:req-1",
      title: "notary commit",
      context: "Implementer",
      since: minutesAgo(5),
      inline: true,
      requestId: "req-1",
      serverId: "s1",
      agentId: "a1",
      target: { serverId: "s1", workspaceId: "w1", agentId: "a1" },
    });
  });

  it("keeps a permission that has no agent in the directory yet", () => {
    const { rows } = buildNeedsYouRows(input({ permissions: [permission()] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "permission", context: null, target: null });
  });

  it("gives question and plan permissions no inline answer", () => {
    const { rows } = buildNeedsYouRows(
      input({
        permissions: [
          permission({ request: request({ id: "q", kind: "question" }) }),
          permission({ request: request({ id: "p", kind: "plan" }) }),
          permission({ request: request({ id: "t", kind: "tool" }) }),
        ],
        firstSeen: new Map([
          ["permission:s1:a1:q", minutesAgo(3)],
          ["permission:s1:a1:p", minutesAgo(2)],
          ["permission:s1:a1:t", minutesAgo(1)],
        ]),
      }),
    );
    expect(rows.map((row) => [row.key, row.kind === "permission" && row.inline])).toEqual([
      ["permission:s1:a1:q", false],
      ["permission:s1:a1:p", false],
      ["permission:s1:a1:t", true],
    ]);
  });

  it("lists an agent labelled wait=user and drops the row when the label clears", () => {
    const waiting = agent({ labels: { wait: "user" } });
    const first = buildNeedsYouRows(input({ agents: [waiting], workspaces: [workspace()] }));
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({
      kind: "label",
      key: "label:s1:a1",
      title: "Implementer",
      target: { serverId: "s1", workspaceId: "w1", agentId: "a1" },
    });

    const cleared = buildNeedsYouRows(
      input({ agents: [{ ...waiting, labels: {} }], workspaces: [workspace()] }),
    );
    expect(cleared.rows).toEqual([]);
  });

  it("ignores other wait values and other label keys", () => {
    const { rows } = buildNeedsYouRows(
      input({
        agents: [
          agent({ id: "a1", labels: { wait: "agent" } }),
          agent({ id: "a2", labels: { role: "user" } }),
        ],
      }),
    );
    expect(rows).toEqual([]);
  });

  it("adds no row for an archived agent, with or without a permission", () => {
    const archived = agent({ labels: { wait: "user" }, archived: true });
    const { rows } = buildNeedsYouRows(
      input({ agents: [archived], permissions: [permission()], workspaces: [workspace()] }),
    );
    expect(rows).toEqual([]);
  });

  it("drops the wait=user row when the same agent has a pending permission", () => {
    const { rows } = buildNeedsYouRows(
      input({
        agents: [agent({ labels: { wait: "user" } })],
        permissions: [permission()],
        workspaces: [workspace()],
      }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["permission"]);
  });

  it("keeps wait=user rows of agents that have no permission", () => {
    const { rows } = buildNeedsYouRows(
      input({
        agents: [
          agent({ id: "a1", labels: { wait: "user" } }),
          agent({ id: "a2", labels: { wait: "user" } }),
        ],
        permissions: [permission({ agentId: "a1" })],
      }),
    );
    expect(rows.map((row) => row.key).sort()).toEqual(["label:s1:a2", "permission:s1:a1:req-1"]);
  });

  it("lists a run that waits for the user and drops it when the flag clears", () => {
    const waiting = buildNeedsYouRows(
      input({ board: boardOf(issue()), workspaces: [workspace()] }),
    );
    expect(waiting.rows).toHaveLength(1);
    expect(waiting.rows[0]).toMatchObject({
      kind: "run",
      key: "run:DSK-51",
      title: "DSK-51 A Needs-you view",
      context: "intake",
      target: { serverId: "s1", workspaceId: "w1", agentId: null },
    });

    const cleared = buildNeedsYouRows(
      input({
        board: boardOf(
          issue({ run: { state: "running", step: "implement", waitsForUser: false } }),
        ),
        workspaces: [workspace()],
      }),
    );
    expect(cleared.rows).toEqual([]);
  });

  it("ignores Issues with no run", () => {
    expect(buildNeedsYouRows(input({ board: boardOf(issue({ run: null })) })).rows).toEqual([]);
  });

  it("lists a run with no matching workspace, and cannot open it", () => {
    const { rows } = buildNeedsYouRows(input({ board: boardOf(issue()) }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "run", target: null });
  });

  it("opens the first workspace whose title starts with the Issue id", () => {
    const { rows } = buildNeedsYouRows(
      input({
        board: boardOf(issue()),
        workspaces: [
          workspace({ workspaceId: "other", name: "DSK-5 something else" }),
          workspace({ workspaceId: "first", name: "DSK-51 first" }),
          workspace({ workspaceId: "second", name: "DSK-51 second" }),
        ],
      }),
    );
    expect(rows[0]).toMatchObject({ target: { workspaceId: "first" } });
  });

  it("drops a run row when an agent in a workspace of that Issue is labelled wait=user", () => {
    const { rows } = buildNeedsYouRows(
      input({
        board: boardOf(issue()),
        workspaces: [workspace()],
        agents: [agent({ labels: { wait: "user" } })],
      }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["label"]);
  });

  it("drops the run row even when the label row yielded to a permission", () => {
    const { rows } = buildNeedsYouRows(
      input({
        board: boardOf(issue()),
        workspaces: [workspace()],
        agents: [agent({ labels: { wait: "user" } })],
        permissions: [permission()],
      }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["permission"]);
  });

  it("keeps a run row when the wait=user agent sits in another Issue's workspace", () => {
    const { rows } = buildNeedsYouRows(
      input({
        board: boardOf(issue()),
        workspaces: [
          workspace({ workspaceId: "w1", name: "DSK-51 here" }),
          workspace({ workspaceId: "w2", name: "DSK-52 there" }),
        ],
        agents: [agent({ workspaceId: "w2", labels: { wait: "user" } })],
      }),
    );
    expect(rows.map((row) => row.kind).sort()).toEqual(["label", "run"]);
  });

  it("keeps a run row when the wait=user agent is archived", () => {
    const { rows } = buildNeedsYouRows(
      input({
        board: boardOf(issue()),
        workspaces: [workspace()],
        agents: [agent({ labels: { wait: "user" }, archived: true })],
      }),
    );
    expect(rows.map((row) => row.kind)).toEqual(["run"]);
  });

  it("ages a permission or a label from the older of first seen and the agent's update", () => {
    const { rows } = buildNeedsYouRows(
      input({
        permissions: [permission({ agentId: "a1" })],
        agents: [
          agent({ id: "a1", updatedAt: minutesAgo(20) }),
          agent({ id: "a2", labels: { wait: "user" }, updatedAt: minutesAgo(2) }),
        ],
        firstSeen: new Map([
          ["permission:s1:a1:req-1", minutesAgo(4)],
          ["label:s1:a2", minutesAgo(9)],
        ]),
      }),
    );
    expect(rows.map((row) => [row.key, row.since])).toEqual([
      ["permission:s1:a1:req-1", minutesAgo(20)],
      ["label:s1:a2", minutesAgo(9)],
    ]);
  });

  it("ages a row never seen before from now", () => {
    const { rows } = buildNeedsYouRows(
      input({ board: boardOf(issue()), permissions: [permission()] }),
    );
    expect(rows.map((row) => row.since)).toEqual([NOW, NOW]);
  });

  it("ages a run from when the client first saw the wait", () => {
    const { rows } = buildNeedsYouRows(
      input({ board: boardOf(issue()), firstSeen: new Map([["run:DSK-51", minutesAgo(12)]]) }),
    );
    expect(rows[0]?.since).toBe(minutesAgo(12));
  });

  it("never lets an agent update from the future age a row below zero", () => {
    const { rows } = buildNeedsYouRows(
      input({
        agents: [agent({ labels: { wait: "user" }, updatedAt: NOW + MINUTE })],
        firstSeen: new Map([["label:s1:a1", minutesAgo(1)]]),
      }),
    );
    expect(rows[0]?.since).toBe(minutesAgo(1));
  });

  it("orders oldest first across the three sources, and the count is the row count", () => {
    const result = buildNeedsYouRows(
      input({
        board: boardOf(issue()),
        workspaces: [workspace({ workspaceId: "w9", name: "DSK-51 run" })],
        permissions: [permission({ agentId: "a1" })],
        agents: [
          agent({ id: "a1", updatedAt: minutesAgo(1) }),
          agent({
            id: "a2",
            workspaceId: "w2",
            labels: { wait: "user" },
            updatedAt: minutesAgo(1),
          }),
        ],
        firstSeen: new Map([
          ["permission:s1:a1:req-1", minutesAgo(5)],
          ["label:s1:a2", minutesAgo(30)],
          ["run:DSK-51", minutesAgo(10)],
        ]),
      }),
    );
    expect(result.rows.map((row) => row.kind)).toEqual(["label", "run", "permission"]);
    expect(result.count).toBe(result.rows.length);
    expect(result.count).toBe(3);
  });

  it("breaks a tie by key so the order does not flicker", () => {
    const first = buildNeedsYouRows(
      input({
        permissions: [
          permission({ request: request({ id: "b" }) }),
          permission({ request: request({ id: "a" }) }),
        ],
      }),
    );
    const second = buildNeedsYouRows(
      input({
        permissions: [
          permission({ request: request({ id: "a" }) }),
          permission({ request: request({ id: "b" }) }),
        ],
      }),
    );
    expect(first.rows.map((row) => row.key)).toEqual(second.rows.map((row) => row.key));
    expect(first.rows.map((row) => row.key)).toEqual(["permission:s1:a1:a", "permission:s1:a1:b"]);
  });

  it("lists a run once when the board repeats an Issue id", () => {
    const { rows } = buildNeedsYouRows(input({ board: boardOf(issue(), issue()) }));
    expect(rows).toHaveLength(1);
  });
});

describe("formatNeedsYouAge", () => {
  it.each([
    [0, "0s"],
    [-5_000, "0s"],
    [42_000, "42s"],
    [5 * MINUTE, "5m"],
    [65 * MINUTE, "1h 5m"],
    [120 * MINUTE, "2h"],
    [26 * 60 * MINUTE, "1d 2h"],
    [48 * 60 * MINUTE, "2d"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(formatNeedsYouAge(ms)).toBe(expected);
  });
});
