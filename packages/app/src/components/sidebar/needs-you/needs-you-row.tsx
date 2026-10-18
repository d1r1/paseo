import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type {
  AgentPermissionAction,
  AgentPermissionResponse,
} from "@getpaseo/protocol/agent-types";
import { Button } from "@/components/ui/button";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import {
  formatNeedsYouAge,
  resolvePermissionActions,
  type NeedsYouPermissionRow,
  type NeedsYouRow,
  type NeedsYouTarget,
} from "./needs-you-rows";

/** How long the daemon gets to confirm an answer; the same wait the agent panel's card gives it. */
export const NEEDS_YOU_ANSWER_TIMEOUT_MS = 15_000;

function responseFor(action: AgentPermissionAction): AgentPermissionResponse {
  if (action.behavior === "allow") {
    return { behavior: "allow", selectedActionId: action.id };
  }
  return { behavior: "deny", selectedActionId: action.id, message: "Denied by user" };
}

export function NeedsYouRowItem({
  row,
  now,
  onOpen,
}: {
  row: NeedsYouRow;
  now: number;
  onOpen: (target: NeedsYouTarget) => void;
}) {
  const { t } = useTranslation();
  const { target } = row;
  const handleOpen = useCallback(() => {
    if (target) onOpen(target);
  }, [onOpen, target]);
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.open,
      hovered && !pressed && styles.openHovered,
      pressed && styles.openPressed,
    ],
    [],
  );
  const source = t(`sidebar.needsYou.source.${row.kind}`);

  return (
    <View style={styles.row} testID={`needs-you-row-${row.key}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${row.title}, ${source}`}
        disabled={target === null}
        onPress={handleOpen}
        style={rowStyle}
        testID={`needs-you-open-${row.key}`}
      >
        <View style={styles.titleLine}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
          <Text style={styles.age} testID={`needs-you-age-${row.key}`}>
            {formatNeedsYouAge(now - row.since)}
          </Text>
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {row.context ? `${source} · ${row.context}` : source}
        </Text>
      </Pressable>
      {row.kind === "permission" && row.inline ? <PermissionAnswer row={row} /> : null}
    </View>
  );
}

function PermissionAnswer({ row }: { row: NeedsYouPermissionRow }) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(row.serverId);
  const [answeringActionId, setAnsweringActionId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const actions = resolvePermissionActions(row.request, {
    accept: t("agentStream.permission.accept"),
    deny: t("agentStream.permission.deny"),
  });
  const { agentId, requestId } = row;
  const answer = useCallback(
    async (action: AgentPermissionAction) => {
      setFailed(false);
      if (!client) {
        setFailed(true);
        return;
      }
      setAnsweringActionId(action.id);
      try {
        await client.respondToPermissionAndWait(
          agentId,
          requestId,
          responseFor(action),
          NEEDS_YOU_ANSWER_TIMEOUT_MS,
        );
      } catch (error) {
        console.error("[NeedsYou] Failed to respond to permission:", error);
        setFailed(true);
      } finally {
        setAnsweringActionId(null);
      }
    },
    [agentId, client, requestId],
  );

  return (
    <View style={styles.answer}>
      <View style={styles.actions}>
        {actions.map((action) => (
          <NeedsYouActionButton
            key={action.id}
            action={action}
            rowKey={row.key}
            busy={answeringActionId !== null}
            loading={answeringActionId === action.id}
            onPress={answer}
          />
        ))}
      </View>
      {failed ? (
        <Text style={styles.error} testID={`needs-you-error-${row.key}`}>
          {t("sidebar.needsYou.answerFailed")}
        </Text>
      ) : null}
    </View>
  );
}

function NeedsYouActionButton({
  action,
  rowKey,
  busy,
  loading,
  onPress,
}: {
  action: AgentPermissionAction;
  rowKey: string;
  busy: boolean;
  loading: boolean;
  onPress: (action: AgentPermissionAction) => void;
}) {
  const handlePress = useCallback(() => onPress(action), [action, onPress]);
  return (
    <Button
      size="xs"
      variant={action.behavior === "allow" ? "secondary" : "outline"}
      disabled={busy}
      loading={loading}
      onPress={handlePress}
      testID={`needs-you-${action.behavior}-${rowKey}`}
    >
      {action.label}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    marginBottom: theme.spacing[0.5],
    borderRadius: theme.borderRadius.lg,
  },
  open: {
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
    gap: theme.spacing[0.5],
    userSelect: "none",
  },
  openHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  openPressed: {
    backgroundColor: theme.colors.surface2,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  age: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  meta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  answer: {
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[1],
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
