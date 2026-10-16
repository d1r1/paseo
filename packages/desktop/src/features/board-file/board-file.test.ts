import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createDesktopSettingsStore } from "../../settings/desktop-settings";
import { createBoardFileCommandHandlers } from "./board-file-commands";
import { parseBoardFile, readConfiguredBoardFile } from "./board-file";

const VALID_BOARD = {
  schema: 1,
  generatedAt: "2026-10-16T19:40:02Z",
  futureTopLevelKey: { ignored: true },
  issues: [
    {
      id: "DSK-34",
      title: "Desk's left sidebar is a board",
      team: "DSK",
      status: "In Progress",
      parent: null,
      sortOrder: -80.25,
      run: null,
      futureKey: 1,
    },
    {
      id: "DSK-36",
      title: "The sidebar reads the board file",
      team: "DSK",
      status: "In Progress",
      parent: "DSK-34",
      sortOrder: 412.5,
      run: { state: "waiting", step: "challenge", waitsForUser: true },
    },
    {
      id: "DSK-37",
      title: "Collapse",
      team: "DSK",
      status: "Backlog",
      parent: "DSK-34",
      sortOrder: 3,
      run: { state: "running", step: null, waitsForUser: false },
    },
  ],
};

describe("parseBoardFile", () => {
  it("reads a schema 1 file, keeps null runs and null steps, and ignores unknown keys", () => {
    const board = parseBoardFile(JSON.stringify(VALID_BOARD));

    expect(board).toEqual({
      schema: 1,
      generatedAt: "2026-10-16T19:40:02Z",
      issues: [
        { ...VALID_BOARD.issues[0], futureKey: undefined },
        VALID_BOARD.issues[1],
        VALID_BOARD.issues[2],
      ].map((issue) => JSON.parse(JSON.stringify(issue))),
    });
  });

  it("keeps an explicit null run step", () => {
    const board = parseBoardFile(
      JSON.stringify({
        ...VALID_BOARD,
        issues: [
          {
            ...VALID_BOARD.issues[1],
            run: { state: "running", step: null, waitsForUser: false },
          },
        ],
      }),
    );

    expect(board?.issues[0]?.run).toEqual({ state: "running", step: null, waitsForUser: false });
  });

  it("accepts an empty issue list", () => {
    expect(parseBoardFile(JSON.stringify({ ...VALID_BOARD, issues: [] }))?.issues).toEqual([]);
  });

  it.each([
    ["not JSON", "{"],
    ["a JSON array", "[]"],
    ["null", "null"],
    ["an unsupported schema", JSON.stringify({ ...VALID_BOARD, schema: 2 })],
    ["a missing schema", JSON.stringify({ generatedAt: "x", issues: [] })],
    ["a missing generatedAt", JSON.stringify({ schema: 1, issues: [] })],
    ["issues that are not an array", JSON.stringify({ ...VALID_BOARD, issues: {} })],
    ["an issue that is not an object", JSON.stringify({ ...VALID_BOARD, issues: [1] })],
    [
      "a string sortOrder",
      JSON.stringify({
        ...VALID_BOARD,
        issues: [{ ...VALID_BOARD.issues[0], sortOrder: "1" }],
      }),
    ],
    [
      "a non-finite sortOrder",
      `{"schema":1,"generatedAt":"x","issues":[${JSON.stringify({
        ...VALID_BOARD.issues[0],
        sortOrder: 0,
      }).replace('"sortOrder":0', '"sortOrder":1e999')}]}`,
    ],
    [
      "a numeric parent",
      JSON.stringify({ ...VALID_BOARD, issues: [{ ...VALID_BOARD.issues[0], parent: 34 }] }),
    ],
    [
      "a missing parent",
      JSON.stringify({
        ...VALID_BOARD,
        issues: [{ ...VALID_BOARD.issues[0], parent: undefined }],
      }),
    ],
    [
      "a numeric run step",
      JSON.stringify({
        ...VALID_BOARD,
        issues: [{ ...VALID_BOARD.issues[1], run: { state: "x", step: 3, waitsForUser: false } }],
      }),
    ],
    [
      "a run without step",
      JSON.stringify({
        ...VALID_BOARD,
        issues: [{ ...VALID_BOARD.issues[1], run: { state: "running", waitsForUser: false } }],
      }),
    ],
    [
      "a run without waitsForUser",
      JSON.stringify({
        ...VALID_BOARD,
        issues: [{ ...VALID_BOARD.issues[1], run: { state: "x", step: null } }],
      }),
    ],
    [
      "a run that is not an object",
      JSON.stringify({ ...VALID_BOARD, issues: [{ ...VALID_BOARD.issues[1], run: "x" }] }),
    ],
  ])("returns null for %s", (_label, text) => {
    expect(parseBoardFile(text)).toBeNull();
  });
});

describe("readConfiguredBoardFile", () => {
  const directories = new Set<string>();

  afterEach(async () => {
    await Promise.all([...directories].map((dir) => rm(dir, { recursive: true, force: true })));
    directories.clear();
  });

  async function setup(): Promise<{
    directory: string;
    boardPath: string;
    store: ReturnType<typeof createDesktopSettingsStore>;
  }> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "paseo-board-file-"));
    directories.add(directory);
    return {
      directory,
      boardPath: path.join(directory, "board.json"),
      store: createDesktopSettingsStore({ userDataPath: path.join(directory, "user-data") }),
    };
  }

  it("is unavailable with no configured path and reads no file", async () => {
    const { store } = await setup();
    let reads = 0;

    const result = await readConfiguredBoardFile({
      settingsStore: store,
      readText: async () => {
        reads += 1;
        return "";
      },
    });

    expect(result).toEqual({ status: "unavailable", path: null });
    expect(reads).toBe(0);
  });

  it("returns the board and the path it was read from", async () => {
    const { store, boardPath } = await setup();
    await writeFile(boardPath, JSON.stringify(VALID_BOARD));
    await store.patch({ boardFilePath: boardPath });

    const result = await readConfiguredBoardFile({ settingsStore: store });

    expect(result.status).toBe("ok");
    expect(result.path).toBe(boardPath);
    if (result.status === "ok") {
      expect(result.board.issues.map((issue) => issue.id)).toEqual(["DSK-34", "DSK-36", "DSK-37"]);
    }
  });

  it("is unavailable for a missing file", async () => {
    const { store, boardPath } = await setup();
    await store.patch({ boardFilePath: boardPath });

    expect(await readConfiguredBoardFile({ settingsStore: store })).toEqual({
      status: "unavailable",
      path: boardPath,
    });
  });

  it("is unavailable when the path is a directory", async () => {
    const { store, directory } = await setup();
    await store.patch({ boardFilePath: directory });

    expect(await readConfiguredBoardFile({ settingsStore: store })).toEqual({
      status: "unavailable",
      path: directory,
    });
  });

  it("is unavailable for malformed JSON and an unsupported schema", async () => {
    const { store, boardPath } = await setup();
    await store.patch({ boardFilePath: boardPath });

    await writeFile(boardPath, "{ not json");
    expect(await readConfiguredBoardFile({ settingsStore: store })).toEqual({
      status: "unavailable",
      path: boardPath,
    });

    await writeFile(boardPath, JSON.stringify({ ...VALID_BOARD, schema: 2 }));
    expect(await readConfiguredBoardFile({ settingsStore: store })).toEqual({
      status: "unavailable",
      path: boardPath,
    });
  });

  it("sees a file that was replaced atomically and a path that was cleared", async () => {
    const { store, boardPath, directory } = await setup();
    await store.patch({ boardFilePath: boardPath });
    await writeFile(boardPath, JSON.stringify({ ...VALID_BOARD, issues: [] }));
    const first = await readConfiguredBoardFile({ settingsStore: store });

    const replacement = path.join(directory, "board.json.tmp");
    await writeFile(replacement, JSON.stringify(VALID_BOARD));
    const { rename } = await import("node:fs/promises");
    await rename(replacement, boardPath);
    const second = await readConfiguredBoardFile({ settingsStore: store });
    await store.patch({ boardFilePath: "" });
    const third = await readConfiguredBoardFile({ settingsStore: store });

    expect(first.status === "ok" && first.board.issues.length).toBe(0);
    expect(second.status === "ok" && second.board.issues.length).toBe(3);
    expect(third).toEqual({ status: "unavailable", path: null });
  });

  it("is exposed as the read_board_file desktop command", async () => {
    const { store, boardPath } = await setup();
    await store.patch({ boardFilePath: boardPath });
    const handlers = createBoardFileCommandHandlers({
      settingsStore: store,
      readText: async () => JSON.stringify(VALID_BOARD),
    });

    const result = await handlers.read_board_file();

    expect(result).toMatchObject({ status: "ok", path: boardPath });
  });
});
