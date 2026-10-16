import { getIsElectron } from "@/constants/platform";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";

// Desk's board file, schema 1 (Desk's docs/triage.md). The Electron main process reads and
// validates the file; this module re-checks what crosses the IPC boundary and drops any answer
// that was read for a path other than the one the sidebar is showing now.
export interface BoardRun {
  state: string;
  step: string | null;
  waitsForUser: boolean;
}

export interface BoardIssue {
  id: string;
  title: string;
  team: string;
  status: string;
  parent: string | null;
  sortOrder: number;
  run: BoardRun | null;
}

export interface Board {
  generatedAt: string;
  issues: readonly BoardIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoardRun(value: unknown): value is BoardRun | null {
  if (value === null) return true;
  return (
    isRecord(value) &&
    typeof value.state === "string" &&
    (value.step === null || typeof value.step === "string") &&
    typeof value.waitsForUser === "boolean"
  );
}

function isBoardIssue(value: unknown): value is BoardIssue {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.team === "string" &&
    typeof value.status === "string" &&
    (value.parent === null || typeof value.parent === "string") &&
    typeof value.sortOrder === "number" &&
    Number.isFinite(value.sortOrder) &&
    isBoardRun(value.run)
  );
}

/** The board a `read_board_file` answer carries for `path`, or null when it carries none. */
export function parseBoardFileAnswer(answer: unknown, path: string): Board | null {
  if (!isRecord(answer) || answer.status !== "ok" || answer.path !== path) return null;
  const board = answer.board;
  if (!isRecord(board) || typeof board.generatedAt !== "string" || !Array.isArray(board.issues)) {
    return null;
  }
  const issues: unknown[] = board.issues;
  if (!issues.every(isBoardIssue)) return null;
  return { generatedAt: board.generatedAt, issues };
}

/** Reads the board file at the configured `path` through the main process. Null: no board. */
export async function loadBoardFile(path: string): Promise<Board | null> {
  if (!getIsElectron() || path === "") return null;
  return parseBoardFileAnswer(await invokeDesktopCommand<unknown>("read_board_file"), path);
}

/**
 * Whether `value` is a path the main process accepts: POSIX absolute, a Windows drive path or a
 * UNC path. The main process stays the judge (it drops anything else); this only lets the
 * settings field say so before saving.
 */
export function isAbsoluteBoardFilePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}
