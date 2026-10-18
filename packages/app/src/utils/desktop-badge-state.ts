import type { WorkspaceDescriptor } from "@/stores/session-store";

export type DesktopBadgeWorkspaceStatus = WorkspaceDescriptor["status"];

/**
 * The macOS dock badge: the number of rows in the sidebar's Needs-you section, and no badge at
 * zero. The count comes from the same hook as the section's header, so the two always agree.
 */
export function deriveMacDockBadgeCount(needsYouCount: number): number | undefined {
  return needsYouCount > 0 ? needsYouCount : undefined;
}
