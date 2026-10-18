/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";

const respondToPermissionAndWait = vi.hoisted(() => vi.fn());
const clientState = vi.hoisted(() => ({ available: true }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => (clientState.available ? { respondToPermissionAndWait } : null),
}));

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { NeedsYouRowItem } from "./needs-you-row";
import type { NeedsYouRow } from "./needs-you-rows";

const NOW = Date.parse("2026-10-18T12:00:00Z");

function permissionRow(
  overrides: Partial<AgentPermissionRequest> = {},
  rowOverrides: Partial<Extract<NeedsYouRow, { kind: "permission" }>> = {},
): NeedsYouRow {
  const request = {
    id: "req-1",
    provider: "claude",
    name: "Bash",
    kind: "tool",
    title: "notary commit",
    ...overrides,
  } as AgentPermissionRequest;
  return {
    kind: "permission",
    key: `permission:s1:a1:${request.id}`,
    serverId: "s1",
    agentId: "a1",
    requestId: request.id,
    request,
    inline: request.kind !== "question" && request.kind !== "plan",
    title: request.title ?? "",
    context: "Implementer",
    since: NOW - 5 * 60_000,
    target: { serverId: "s1", workspaceId: "w1", agentId: "a1" },
    ...rowOverrides,
  };
}

describe("NeedsYouRowItem", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;
  const onOpen = vi.fn();

  function render(row: NeedsYouRow) {
    act(() => {
      root?.render(<NeedsYouRowItem row={row} now={NOW} onOpen={onOpen} />);
    });
  }

  function find(testID: string): HTMLElement | null {
    return container?.querySelector(`[data-testid="${testID}"]`) ?? null;
  }

  async function press(testID: string) {
    const element = find(testID);
    expect(element).not.toBeNull();
    await act(async () => {
      element?.click();
    });
  }

  beforeEach(() => {
    respondToPermissionAndWait.mockReset();
    onOpen.mockReset();
    clientState.available = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
  });

  it("shows the title, the source with its context, and the age", () => {
    render(permissionRow());
    expect(container?.textContent).toContain("notary commit");
    expect(container?.textContent).toContain("sidebar.needsYou.source.permission · Implementer");
    expect(find("needs-you-age-permission:s1:a1:req-1")?.textContent).toBe("5m");
  });

  it("allows once, with the action id and the 15 s wait of the agent panel's card", async () => {
    respondToPermissionAndWait.mockResolvedValue({});
    render(permissionRow());

    await press("needs-you-allow-permission:s1:a1:req-1");

    expect(respondToPermissionAndWait).toHaveBeenCalledTimes(1);
    expect(respondToPermissionAndWait).toHaveBeenCalledWith(
      "a1",
      "req-1",
      { behavior: "allow", selectedActionId: "accept" },
      15000,
    );
  });

  it("denies with the deny action", async () => {
    respondToPermissionAndWait.mockResolvedValue({});
    render(permissionRow());

    await press("needs-you-deny-permission:s1:a1:req-1");

    expect(respondToPermissionAndWait).toHaveBeenCalledTimes(1);
    expect(respondToPermissionAndWait).toHaveBeenCalledWith(
      "a1",
      "req-1",
      { behavior: "deny", selectedActionId: "reject", message: "Denied by user" },
      15000,
    );
  });

  it("offers the request's own actions when it carries them", async () => {
    respondToPermissionAndWait.mockResolvedValue({});
    render(
      permissionRow({
        actions: [
          { id: "always", label: "Always allow", behavior: "allow" },
          { id: "no", label: "No", behavior: "deny" },
        ],
      }),
    );
    expect(container?.textContent).toContain("Always allow");

    await press("needs-you-allow-permission:s1:a1:req-1");

    expect(respondToPermissionAndWait).toHaveBeenCalledWith(
      "a1",
      "req-1",
      { behavior: "allow", selectedActionId: "always" },
      15000,
    );
  });

  it("keeps the row and shows an error when the answer fails", async () => {
    respondToPermissionAndWait.mockRejectedValue(new Error("timeout"));
    render(permissionRow());

    await press("needs-you-allow-permission:s1:a1:req-1");

    expect(find("needs-you-error-permission:s1:a1:req-1")?.textContent).toBe(
      "sidebar.needsYou.answerFailed",
    );
    expect(find("needs-you-row-permission:s1:a1:req-1")).not.toBeNull();
    expect(find("needs-you-allow-permission:s1:a1:req-1")).not.toBeNull();
  });

  it("shows an error and calls nothing when the host has no client", async () => {
    clientState.available = false;
    render(permissionRow());

    await press("needs-you-allow-permission:s1:a1:req-1");

    expect(respondToPermissionAndWait).not.toHaveBeenCalled();
    expect(find("needs-you-error-permission:s1:a1:req-1")).not.toBeNull();
  });

  it("clears the error on the next attempt", async () => {
    respondToPermissionAndWait.mockRejectedValueOnce(new Error("timeout"));
    respondToPermissionAndWait.mockResolvedValueOnce({});
    render(permissionRow());

    await press("needs-you-allow-permission:s1:a1:req-1");
    expect(find("needs-you-error-permission:s1:a1:req-1")).not.toBeNull();
    await press("needs-you-allow-permission:s1:a1:req-1");

    expect(find("needs-you-error-permission:s1:a1:req-1")).toBeNull();
  });

  it("shows a question request as an open-tab row with no allow or deny", async () => {
    render(permissionRow({ id: "q", kind: "question", title: "Which branch?" }));

    expect(find("needs-you-allow-permission:s1:a1:q")).toBeNull();
    expect(find("needs-you-deny-permission:s1:a1:q")).toBeNull();
    await press("needs-you-open-permission:s1:a1:q");

    expect(onOpen).toHaveBeenCalledWith({ serverId: "s1", workspaceId: "w1", agentId: "a1" });
    expect(respondToPermissionAndWait).not.toHaveBeenCalled();
  });

  it("opens the tab of a label row and of a run row", async () => {
    render({
      kind: "label",
      key: "label:s1:a1",
      title: "Implementer",
      context: null,
      since: NOW - 60_000,
      target: { serverId: "s1", workspaceId: "w1", agentId: "a1" },
    });
    await press("needs-you-open-label:s1:a1");
    expect(onOpen).toHaveBeenLastCalledWith({ serverId: "s1", workspaceId: "w1", agentId: "a1" });
    expect(find("needs-you-allow-label:s1:a1")).toBeNull();

    render({
      kind: "run",
      key: "run:DSK-51",
      title: "DSK-51 A Needs-you view",
      context: "intake",
      since: NOW - 60_000,
      target: { serverId: "s1", workspaceId: "w2", agentId: null },
    });
    await press("needs-you-open-run:DSK-51");
    expect(onOpen).toHaveBeenLastCalledWith({ serverId: "s1", workspaceId: "w2", agentId: null });
  });

  it("lists a run with no workspace but cannot open it", async () => {
    render({
      kind: "run",
      key: "run:DSK-51",
      title: "DSK-51 A Needs-you view",
      context: null,
      since: NOW - 60_000,
      target: null,
    });

    expect(container?.textContent).toContain("DSK-51 A Needs-you view");
    await press("needs-you-open-run:DSK-51");
    expect(onOpen).not.toHaveBeenCalled();
  });
});
