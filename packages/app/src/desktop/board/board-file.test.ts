import { beforeEach, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ isElectron: true }));
const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/constants/platform", () => ({ getIsElectron: () => platform.isElectron }));
vi.mock("@/desktop/electron/invoke", () => ({ invokeDesktopCommand: invoke }));

import { isAbsoluteBoardFilePath, loadBoardFile, parseBoardFileAnswer } from "./board-file";

const BOARD = {
  generatedAt: "2026-10-16T19:40:02Z",
  issues: [
    {
      id: "DSK-36",
      title: "t",
      team: "DSK",
      status: "In Progress",
      parent: "DSK-34",
      sortOrder: 412.5,
      run: { state: "waiting", step: "challenge", waitsForUser: true },
    },
    {
      id: "DSK-37",
      title: "t",
      team: "DSK",
      status: "Backlog",
      parent: null,
      sortOrder: -1,
      run: null,
    },
  ],
};

describe("parseBoardFileAnswer", () => {
  it("returns the board read for the same path", () => {
    expect(
      parseBoardFileAnswer({ status: "ok", path: "/b.json", board: BOARD }, "/b.json"),
    ).toEqual(BOARD);
  });

  it("drops an answer read for another path", () => {
    expect(
      parseBoardFileAnswer({ status: "ok", path: "/old.json", board: BOARD }, "/new.json"),
    ).toBeNull();
  });

  it.each([
    ["an unavailable answer", { status: "unavailable", path: "/b.json" }],
    ["a missing board", { status: "ok", path: "/b.json" }],
    ["a board without issues", { status: "ok", path: "/b.json", board: { generatedAt: "x" } }],
    ["a string answer", "ok"],
    ["null", null],
    [
      "an issue with a bad field",
      {
        status: "ok",
        path: "/b.json",
        board: { generatedAt: "x", issues: [{ ...BOARD.issues[0], sortOrder: "1" }] },
      },
    ],
    [
      "a run with a numeric step",
      {
        status: "ok",
        path: "/b.json",
        board: {
          generatedAt: "x",
          issues: [{ ...BOARD.issues[0], run: { state: "s", step: 1, waitsForUser: false } }],
        },
      },
    ],
  ])("returns null for %s", (_label, answer) => {
    expect(parseBoardFileAnswer(answer, "/b.json")).toBeNull();
  });
});

describe("loadBoardFile", () => {
  beforeEach(() => {
    platform.isElectron = true;
    invoke.mockReset();
  });

  it("asks the main process and returns the board", async () => {
    invoke.mockResolvedValue({ status: "ok", path: "/b.json", board: BOARD });

    await expect(loadBoardFile("/b.json")).resolves.toEqual(BOARD);
    expect(invoke).toHaveBeenCalledWith("read_board_file");
  });

  it("does not call the main process with no path or outside Electron", async () => {
    await expect(loadBoardFile("")).resolves.toBeNull();
    platform.isElectron = false;
    await expect(loadBoardFile("/b.json")).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("lets an IPC failure reach the caller", async () => {
    invoke.mockRejectedValue(new Error("ipc down"));

    await expect(loadBoardFile("/b.json")).rejects.toThrow("ipc down");
  });
});

describe("isAbsoluteBoardFilePath", () => {
  it.each([
    "/Users/me/board.json",
    "C:\\desk\\board.json",
    "c:/desk/board.json",
    "\\\\host\\share\\board.json",
  ])("accepts %s", (value) => {
    expect(isAbsoluteBoardFilePath(value)).toBe(true);
  });

  it.each(["", "board.json", "issues/board.json", "./board.json", "~/board.json", "C:board.json"])(
    "rejects %j",
    (value) => {
      expect(isAbsoluteBoardFilePath(value)).toBe(false);
    },
  );
});
