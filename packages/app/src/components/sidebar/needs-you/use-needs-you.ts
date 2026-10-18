import type { NeedsYouState } from "./needs-you-rows";

/** Whether this build has the Needs-you section and its view. Only the desktop app does. */
export const NEEDS_YOU_ENABLED = false;

const NOTHING_NEEDS_YOU: NeedsYouState = { rows: [], count: 0, now: 0 };

/**
 * What needs the user, for the Needs-you section and the dock badge. Only the desktop app has the
 * section; its implementation is `use-needs-you.electron.ts`, which Metro picks for the Electron
 * build. Everywhere else nothing needs the user here and the sidebar is as it was.
 */
export function useNeedsYou(): NeedsYouState {
  return NOTHING_NEEDS_YOU;
}
