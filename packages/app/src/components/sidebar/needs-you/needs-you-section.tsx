import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { NeedsYouRowItem } from "./needs-you-row";
import type { NeedsYouTarget } from "./needs-you-rows";
import { useNeedsYou } from "./use-needs-you";

/**
 * The Needs-you section: every permission and user-owned stop, oldest first. Above the list it
 * shows only while something waits; `alone` is the Needs-you view, which fills the sidebar and says
 * so when nothing waits. The count in the header is the number of rows.
 */
export function NeedsYouSection({ alone }: { alone: boolean }) {
  const { t } = useTranslation();
  const { rows, count, now } = useNeedsYou();
  const handleOpen = useCallback((target: NeedsYouTarget) => {
    navigateToWorkspace({
      serverId: target.serverId,
      workspaceId: target.workspaceId,
      target: target.agentId ? { kind: "agent", agentId: target.agentId } : undefined,
    });
  }, []);
  if (count === 0 && !alone) return null;

  return (
    <View style={alone ? styles.alone : styles.above} testID="sidebar-needs-you-section">
      <View style={styles.header}>
        <Text style={styles.title}>{t("sidebar.needsYou.title")}</Text>
        <Text style={styles.count} testID="sidebar-needs-you-count">
          {count}
        </Text>
      </View>
      {count === 0 ? (
        <Text style={styles.empty} testID="sidebar-needs-you-empty">
          {t("sidebar.needsYou.empty")}
        </Text>
      ) : (
        <ScrollView
          style={alone ? styles.aloneList : styles.aboveList}
          showsVerticalScrollIndicator={false}
          testID="sidebar-needs-you-list"
        >
          {rows.map((row) => (
            <NeedsYouRowItem key={row.key} row={row} now={now} onOpen={handleOpen} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  above: {
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  alone: {
    flex: 1,
    paddingHorizontal: theme.spacing[2],
  },
  // Taller than a couple of rows would be a second sidebar; the list scrolls inside it.
  aboveList: {
    maxHeight: 280,
    flexGrow: 0,
  },
  aloneList: {
    flex: 1,
  },
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    userSelect: "none",
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  empty: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
