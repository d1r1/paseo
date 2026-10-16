import { readFile } from "node:fs/promises";

import type { DesktopSettingsStore } from "../../settings/desktop-settings.js";

// Desk's board file, schema 1 (Desk's docs/triage.md). Only the keys the sidebar uses are
// listed; a key this reader does not know is ignored so a later schema can add one.
export interface BoardFileRun {
  state: string;
  step: string | null;
  waitsForUser: boolean;
}

export interface BoardFileIssue {
  id: string;
  title: string;
  team: string;
  status: string;
  parent: string | null;
  sortOrder: number;
  run: BoardFileRun | null;
}

export interface BoardFile {
  schema: 1;
  generatedAt: string;
  issues: BoardFileIssue[];
}

/**
 * `path` is the path the read was made for, so a renderer that has since moved to another path can
 * tell the answer is obsolete and drop it.
 */
export type BoardFileReadResult =
  | { status: "ok"; path: string; board: BoardFile }
  | { status: "unavailable"; path: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRun(value: unknown): BoardFileRun | null | undefined {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.state !== "string" ||
    typeof value.waitsForUser !== "boolean"
  ) {
    return undefined;
  }
  if (value.step !== null && typeof value.step !== "string") {
    return undefined;
  }
  return { state: value.state, step: value.step, waitsForUser: value.waitsForUser };
}

function parseIssue(value: unknown): BoardFileIssue | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, title, team, status, parent, sortOrder } = value;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof team !== "string" ||
    typeof status !== "string" ||
    (parent !== null && typeof parent !== "string") ||
    typeof sortOrder !== "number" ||
    !Number.isFinite(sortOrder)
  ) {
    return null;
  }
  const run = parseRun(value.run);
  if (run === undefined) {
    return null;
  }
  return { id, title, team, status, parent, sortOrder, run };
}

/** Returns null for anything that is not a complete schema 1 file. */
export function parseBoardFile(text: string): BoardFile | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.schema !== 1 || typeof value.generatedAt !== "string") {
    return null;
  }
  if (!Array.isArray(value.issues)) {
    return null;
  }
  const issues: BoardFileIssue[] = [];
  for (const entry of value.issues) {
    const issue = parseIssue(entry);
    if (!issue) {
      return null;
    }
    issues.push(issue);
  }
  return { schema: 1, generatedAt: value.generatedAt, issues };
}

export async function readConfiguredBoardFile({
  settingsStore,
  readText = (filePath) => readFile(filePath, "utf8"),
}: {
  settingsStore: DesktopSettingsStore;
  readText?: (filePath: string) => Promise<string>;
}): Promise<BoardFileReadResult> {
  let boardFilePath: string;
  try {
    boardFilePath = (await settingsStore.get()).boardFilePath;
  } catch {
    return { status: "unavailable", path: null };
  }
  if (boardFilePath === "") {
    return { status: "unavailable", path: null };
  }
  try {
    const board = parseBoardFile(await readText(boardFilePath));
    return board
      ? { status: "ok", path: boardFilePath, board }
      : { status: "unavailable", path: boardFilePath };
  } catch {
    return { status: "unavailable", path: boardFilePath };
  }
}
