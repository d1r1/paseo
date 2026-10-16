import type { DesktopSettingsStore } from "../../settings/desktop-settings.js";
import type { DesktopCommandHandler } from "../../settings/desktop-settings-commands.js";
import { readConfiguredBoardFile } from "./board-file.js";

export function createBoardFileCommandHandlers({
  settingsStore,
  readText,
}: {
  settingsStore: DesktopSettingsStore;
  readText?: (filePath: string) => Promise<string>;
}): Record<string, DesktopCommandHandler> {
  return {
    read_board_file: () => readConfiguredBoardFile({ settingsStore, readText }),
  };
}
