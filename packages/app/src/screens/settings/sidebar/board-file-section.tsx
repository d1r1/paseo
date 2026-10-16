import { useCallback, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { getIsElectron } from "@/constants/platform";
import { isAbsoluteBoardFilePath } from "@/desktop/board/board-file";
import { useDesktopSettings } from "@/desktop/settings/desktop-settings";
import { settingsStyles } from "@/styles/settings";

/** Settings > Sidebar > Board file: the path of Desk's board file. Electron only. */
export function BoardFileSection(): ReactElement | null {
  const { t } = useTranslation();
  const { settings, isLoading, isSaving, updateSettings } = useDesktopSettings();
  const savedPath = settings.boardFilePath;
  const [draft, setDraft] = useState<string | null>(null);
  const currentDraft = (draft ?? savedPath).trim();
  const isInvalid = currentDraft !== "" && !isAbsoluteBoardFilePath(currentDraft);
  const canSave = !isInvalid && currentDraft !== savedPath && !isSaving;

  const save = useCallback(
    (boardFilePath: string) => {
      void updateSettings({ boardFilePath })
        .then(() => setDraft(null))
        .catch(() => {
          // useDesktopSettings owns the user-visible IPC error.
        });
    },
    [updateSettings],
  );
  const handleSave = useCallback(() => save(currentDraft), [currentDraft, save]);
  const handleClear = useCallback(() => save(""), [save]);
  const handleSubmit = useCallback(() => {
    if (canSave) save(currentDraft);
  }, [canSave, currentDraft, save]);

  // The input is uncontrolled; its key is the saved path so a save or a clear re-seeds it.
  const resetKey = useMemo(() => `${isLoading}:${savedPath}`, [isLoading, savedPath]);

  if (!getIsElectron()) {
    return null;
  }

  return (
    <SettingsSection
      title={t("settings.appearance.sidebar.boardFile.title")}
      info={t("settings.appearance.sidebar.boardFile.description")}
      testID="sidebar-board-file-section"
    >
      <View style={[settingsStyles.card, styles.card]}>
        <Field
          label={t("settings.appearance.sidebar.boardFile.label")}
          hint={t("settings.appearance.sidebar.boardFile.hint")}
          error={isInvalid ? t("settings.appearance.sidebar.boardFile.invalid") : null}
          testID="sidebar-board-file-field"
        >
          <FormTextInput
            initialValue={savedPath}
            resetKey={resetKey}
            onChangeText={setDraft}
            onSubmitEditing={handleSubmit}
            placeholder={t("settings.appearance.sidebar.boardFile.placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isLoading}
            accessibilityLabel={t("settings.appearance.sidebar.boardFile.label")}
            testID="sidebar-board-file-input"
          />
        </Field>
        <View style={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            onPress={handleClear}
            disabled={savedPath === "" || isSaving}
            testID="sidebar-board-file-clear"
          >
            {t("settings.appearance.sidebar.boardFile.clear")}
          </Button>
          <Button
            size="sm"
            onPress={handleSave}
            disabled={!canSave}
            testID="sidebar-board-file-save"
          >
            {t("settings.appearance.sidebar.boardFile.save")}
          </Button>
        </View>
      </View>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    gap: theme.spacing[3],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
