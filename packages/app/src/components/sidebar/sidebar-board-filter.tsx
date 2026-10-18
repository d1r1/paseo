import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control";
import { ALL_BOARD_VIEW_KEY, NEEDS_YOU_VIEW_KEY, type BoardView } from "./sidebar-board";
import { useSidebarModel } from "./sidebar-model";

function boardViewLabel(view: BoardView, t: TFunction): string {
  if (view.key === ALL_BOARD_VIEW_KEY) return t("sidebar.board.views.all");
  if (view.key === NEEDS_YOU_VIEW_KEY) return t("sidebar.board.views.needsYou");
  return view.label;
}

/**
 * The board filter: one segment per view the board gives (`dsk`, `flu`, `all`, `needs you`), in the order the
 * `board.view.select` keys count. Sits directly under the nav rows, on their horizontal rail.
 * Renders nothing when the board gives no view, so without a board file the header is as it was.
 */
export function SidebarBoardFilter() {
  const { t } = useTranslation();
  const { boardViews, boardView, setBoardView } = useSidebarModel();
  const options = useMemo(
    (): SegmentedControlOption<string>[] =>
      boardViews.map((view) => ({
        value: view.key,
        label: boardViewLabel(view, t),
        testID: `sidebar-board-filter-${view.key}`,
      })),
    [boardViews, t],
  );
  if (options.length === 0) return null;
  return (
    <View style={styles.row} testID="sidebar-board-filter">
      <SegmentedControl
        size="xs"
        options={options}
        value={boardView}
        onValueChange={setBoardView}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // The same outer inset as a nav row; the `xs` segment's own inset then puts the first label on
  // the rail of the nav row icons.
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
}));
