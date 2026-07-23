import type {
  ProviderOptionSelectionValue,
  SidebarThreadPreviewCount,
  TimestampFormat,
} from "@t3tools/contracts";
import { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { BlurScreenRoot } from "@/components/chrome";
import { Screen } from "@/components/Screen";
import { usePreferences } from "@/runtime/PreferencesProvider";
import { usePrimaryEnvironment } from "@/runtime/usePrimaryEnvironment";
import { useServerSettings } from "@/runtime/useServerSettings";
import { formatRemoteError } from "@/runtime/statusLog";
import {
  buildModelOptions,
  normalizeModelSelection,
  setModelSelectionOption,
  thinkingOptionDescriptors,
  type ModelOption,
} from "@/features/thread/modelOptions";

import {
  EnvironmentPicker,
  SettingsDivider,
  SettingsLoadingRow,
  SettingsPickerButton,
  SettingsRow,
  SettingsScreenHeader,
  SettingsScroll,
  SettingsSection,
  SettingsSwitch,
} from "./SettingsComponents";
import { SettingsModelPicker, SettingsThinkingPicker } from "./SettingsModelPicker";

const TIMESTAMP_FORMAT_OPTIONS: readonly {
  readonly value: TimestampFormat;
  readonly label: string;
}[] = [
  { value: "locale", label: "System default" },
  { value: "12-hour", label: "12-hour" },
  { value: "24-hour", label: "24-hour" },
];

const THREAD_PREVIEW_OPTIONS: readonly {
  readonly value: SidebarThreadPreviewCount;
  readonly label: string;
}[] = [
  { value: 3, label: "3" },
  { value: 6, label: "6" },
  { value: 9, label: "9" },
  { value: 12, label: "12" },
  { value: 15, label: "15" },
];

const THREAD_MODE_OPTIONS = [
  { value: "local" as const, label: "Local" },
  { value: "worktree" as const, label: "New worktree" },
];

function OptionSheet<T extends string | number>(props: {
  readonly title: string;
  readonly visible: boolean;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly selected: T;
  readonly onClose: () => void;
  readonly onSelect: (value: T) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const sheetBackground = isDark ? "#141414" : "#ffffff";
  const backdrop = isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const accentSoft = isDark ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.1)";
  const accent = isDark ? "#60a5fa" : "#2563eb";

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: backdrop }}>
        <Pressable
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={props.onClose}
          style={{ flex: 1 }}
        />
        <View
          style={{
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: sheetBackground,
            borderTopWidth: 1,
            borderColor: border,
            paddingBottom: Math.max(insets.bottom, 16),
            paddingHorizontal: 12,
            paddingTop: 12,
          }}
        >
          <Text
            style={{
              color: foreground,
              fontSize: 17,
              fontWeight: "700",
              paddingHorizontal: 8,
              paddingBottom: 12,
            }}
          >
            {props.title}
          </Text>
          <View className="gap-1 pb-2">
            {props.options.map((option) => {
              const selected = option.value === props.selected;
              return (
                <Pressable
                  key={String(option.value)}
                  onPress={() => {
                    props.onSelect(option.value);
                    props.onClose();
                  }}
                  className="rounded-2xl px-4 py-3"
                  style={{ backgroundColor: selected ? accentSoft : isDark ? "#1c1c1c" : "#f4f4f5" }}
                >
                  <Text
                    style={{
                      color: selected ? accent : foreground,
                      fontSize: 14,
                      fontWeight: selected ? "600" : "400",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function findModelOption(
  options: readonly ModelOption[],
  selection: { readonly instanceId: string; readonly model: string } | null | undefined
): ModelOption | null {
  if (!selection) return null;
  return (
    options.find(
      (option) =>
        option.selection.instanceId === selection.instanceId &&
        option.selection.model === selection.model
    ) ?? null
  );
}

function thinkingOptionLabel(
  option: ModelOption | null,
  selection: { readonly options?: readonly { readonly id: string; readonly value: string | boolean }[] } | null
): string | null {
  if (!option || !selection) return null;
  const descriptors = thinkingOptionDescriptors(option);
  const descriptor = descriptors[0];
  if (!descriptor) return null;

  const value =
    selection.options?.find((entry) => entry.id === descriptor.id)?.value ??
    (descriptor.type === "select"
      ? descriptor.options.find((entry) => entry.isDefault)?.id
      : descriptor.currentValue);

  if (descriptor.type === "boolean") {
    if (value === true) return "On";
    if (value === false) return "Off";
    return "Default";
  }

  if (typeof value === "string") {
    return descriptor.options.find((entry) => entry.id === value)?.label ?? value;
  }

  return "Default";
}

export function GeneralSettingsScreen() {
  const { preferences, updatePreferences } = usePreferences();
  const { primaryEnvironment, readyEnvironments, selectEnvironment } = usePrimaryEnvironment();
  const environmentId = primaryEnvironment?.connection.environmentId ?? null;
  const { settings, isLoading, error, isLive, updateSettings } = useServerSettings(environmentId);

  const [timestampSheetOpen, setTimestampSheetOpen] = useState(false);
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  const [threadModeSheetOpen, setThreadModeSheetOpen] = useState(false);
  const [modelSheetOpen, setModelSheetOpen] = useState(false);
  const [thinkingSheetOpen, setThinkingSheetOpen] = useState(false);
  const [defaultModelSheetOpen, setDefaultModelSheetOpen] = useState(false);
  const [defaultThinkingSheetOpen, setDefaultThinkingSheetOpen] = useState(false);
  const [savingModel, setSavingModel] = useState(false);

  const modelOptions = useMemo(
    () =>
      buildModelOptions(
        primaryEnvironment?.serverConfig ?? null,
        settings?.textGenerationModelSelection ?? preferences.defaultThreadModelSelection
      ),
    [
      preferences.defaultThreadModelSelection,
      primaryEnvironment?.serverConfig,
      settings?.textGenerationModelSelection,
    ]
  );

  const textGenerationSelection = settings?.textGenerationModelSelection ?? null;
  const selectedModelOption = useMemo(
    () => findModelOption(modelOptions, textGenerationSelection),
    [modelOptions, textGenerationSelection]
  );
  const thinkingLabel = useMemo(
    () => thinkingOptionLabel(selectedModelOption, textGenerationSelection),
    [selectedModelOption, textGenerationSelection]
  );
  const thinkingDescriptors = useMemo(
    () => thinkingOptionDescriptors(selectedModelOption),
    [selectedModelOption]
  );

  const defaultThreadSelection = preferences.defaultThreadModelSelection;
  const selectedDefaultModelOption = useMemo(
    () => findModelOption(modelOptions, defaultThreadSelection),
    [defaultThreadSelection, modelOptions]
  );
  const defaultThinkingLabel = useMemo(
    () => thinkingOptionLabel(selectedDefaultModelOption, defaultThreadSelection),
    [defaultThreadSelection, selectedDefaultModelOption]
  );
  const defaultThinkingDescriptors = useMemo(
    () => thinkingOptionDescriptors(selectedDefaultModelOption),
    [selectedDefaultModelOption]
  );

  const updateServerSetting = useCallback(
    async (patch: Parameters<typeof updateSettings>[0]) => {
      try {
        await updateSettings(patch);
      } catch (updateError) {
        Alert.alert(
          "Could not save setting",
          formatRemoteError(updateError) || "The server rejected the settings update."
        );
      }
    },
    [updateSettings]
  );

  const updateTextGenerationModel = useCallback(
    async (option: ModelOption) => {
      if (savingModel) return;
      setSavingModel(true);
      try {
        await updateServerSetting({
          textGenerationModelSelection: normalizeModelSelection(option.selection),
        });
      } finally {
        setSavingModel(false);
      }
    },
    [savingModel, updateServerSetting]
  );

  const updateThinkingOption = useCallback(
    async (id: string, value: ProviderOptionSelectionValue) => {
      if (!textGenerationSelection || savingModel) return;
      setSavingModel(true);
      try {
        await updateServerSetting({
          textGenerationModelSelection: normalizeModelSelection(
            setModelSelectionOption(textGenerationSelection, id, value)
          ),
        });
      } finally {
        setSavingModel(false);
      }
    },
    [savingModel, textGenerationSelection, updateServerSetting]
  );

  const updateDefaultThreadModel = useCallback(
    async (option: ModelOption) => {
      try {
        await updatePreferences({
          defaultThreadModelSelection: normalizeModelSelection(option.selection),
        });
      } catch (updateError) {
        Alert.alert(
          "Could not save preference",
          formatRemoteError(updateError) || "Unable to update the default thread model."
        );
      }
    },
    [updatePreferences]
  );

  const updateDefaultThinkingOption = useCallback(
    async (id: string, value: ProviderOptionSelectionValue) => {
      if (!defaultThreadSelection) return;
      try {
        await updatePreferences({
          defaultThreadModelSelection: normalizeModelSelection(
            setModelSelectionOption(defaultThreadSelection, id, value)
          ),
        });
      } catch (updateError) {
        Alert.alert(
          "Could not save preference",
          formatRemoteError(updateError) || "Unable to update thinking options."
        );
      }
    },
    [defaultThreadSelection, updatePreferences]
  );

  const timestampLabel =
    TIMESTAMP_FORMAT_OPTIONS.find((option) => option.value === preferences.timestampFormat)
      ?.label ?? "System default";
  const serverControlsDisabled = !isLive || !settings || isLoading || savingModel;

  const textGenerationLabel =
    selectedModelOption?.label ??
    (textGenerationSelection
      ? `${textGenerationSelection.model}`
      : modelOptions.length === 0
        ? "No models"
        : "Choose");

  const defaultThreadLabel =
    selectedDefaultModelOption?.label ??
    defaultThreadSelection?.model ??
    (modelOptions.length === 0 ? "No models" : "Project default");

  return (
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        header={<SettingsScreenHeader title="General" subtitle="Mobile and server preferences" />}
      >
        <SettingsScroll>
          <EnvironmentPicker
            environments={readyEnvironments.map((environment) => ({
              environmentId: environment.connection.environmentId,
              label: environment.connection.label,
              connectionState: environment.connectionState,
            }))}
            selectedEnvironmentId={environmentId}
            onSelect={(nextEnvironmentId) =>
              selectEnvironment(EnvironmentId.make(nextEnvironmentId))
            }
          />

          {!isLive && readyEnvironments.length > 0 ? (
            <ConnectionBanner
              title="Live connection required"
              detail="Connect to a server over WebSocket to edit assistant output, new thread defaults, and the text generation model."
            />
          ) : null}

          {error ? <ConnectionBanner title="Server settings unavailable" detail={error} /> : null}
          {isLoading && settings ? (
            <ConnectionBanner
              title="Refreshing server settings"
              detail="Showing the last server snapshot until the latest settings load."
            />
          ) : null}

          <SettingsSection title="General">
            <SettingsRow
              title="Time format"
              description="System default follows your device clock preference."
              control={
                <SettingsPickerButton
                  label={timestampLabel}
                  onPress={() => setTimestampSheetOpen(true)}
                />
              }
            />
            <SettingsDivider />
            <SettingsRow
              layout="stacked"
              title="Default thread model"
              description="Model and reasoning level used when this app creates a new thread."
              control={
                <View className="flex-col gap-2">
                  <SettingsPickerButton
                    fullWidth
                    disabled={modelOptions.length === 0}
                    label={defaultThreadLabel}
                    onPress={() => setDefaultModelSheetOpen(true)}
                  />
                  {defaultThinkingLabel ? (
                    <SettingsPickerButton
                      fullWidth
                      disabled={!defaultThreadSelection}
                      label={defaultThinkingLabel}
                      onPress={() => setDefaultThinkingSheetOpen(true)}
                    />
                  ) : null}
                </View>
              }
            />
            <SettingsDivider />
            <SettingsRow
              title="Visible threads"
              description="How many threads to show per project before expanding."
              control={
                <SettingsPickerButton
                  label={String(preferences.sidebarThreadPreviewCount)}
                  onPress={() => setPreviewSheetOpen(true)}
                />
              }
            />
            <SettingsDivider />
            <SettingsRow
              title="Minimal logging"
              description="Only show important status toasts such as errors and connection issues."
              control={
                <SettingsSwitch
                  value={preferences.minimalLogging}
                  onValueChange={(value) => void updatePreferences({ minimalLogging: value })}
                />
              }
            />
            <SettingsDivider />
            <SettingsRow
              title="Archive confirmation"
              description="Require a second tap before archiving a thread."
              control={
                <SettingsSwitch
                  value={preferences.confirmThreadArchive}
                  onValueChange={(value) => void updatePreferences({ confirmThreadArchive: value })}
                />
              }
            />
            <SettingsDivider />
            <SettingsRow
              title="Delete confirmation"
              description="Ask before deleting a thread and its chat history."
              control={
                <SettingsSwitch
                  value={preferences.confirmThreadDelete}
                  onValueChange={(value) => void updatePreferences({ confirmThreadDelete: value })}
                />
              }
            />
          </SettingsSection>

          <SettingsSection title="Server">
            {isLoading && !settings ? (
              <SettingsLoadingRow label="Loading server settings..." />
            ) : (
              <>
                <SettingsRow
                  title="Assistant output"
                  description="Show token-by-token output while a response is in progress."
                  disabled={serverControlsDisabled}
                  control={
                    <SettingsSwitch
                      disabled={serverControlsDisabled}
                      value={settings?.enableAssistantStreaming ?? false}
                      onValueChange={(value) =>
                        void updateServerSetting({ enableAssistantStreaming: value })
                      }
                    />
                  }
                />
                <SettingsDivider />
                <SettingsRow
                  title="New threads"
                  description="Default workspace mode for newly created draft threads."
                  disabled={serverControlsDisabled}
                  control={
                    <SettingsPickerButton
                      disabled={serverControlsDisabled}
                      label={
                        settings?.defaultThreadEnvMode === "worktree" ? "New worktree" : "Local"
                      }
                      onPress={() => setThreadModeSheetOpen(true)}
                    />
                  }
                />
                <SettingsDivider />
                <SettingsRow
                  layout="stacked"
                  title="Text generation model"
                  description="Model used for generated commit messages, PR titles, and similar Git text."
                  disabled={serverControlsDisabled}
                  control={
                    <View className="flex-col gap-2">
                      <SettingsPickerButton
                        fullWidth
                        disabled={serverControlsDisabled || modelOptions.length === 0}
                        label={savingModel ? "Saving…" : textGenerationLabel}
                        onPress={() => setModelSheetOpen(true)}
                      />
                      {thinkingLabel ? (
                        <SettingsPickerButton
                          fullWidth
                          disabled={serverControlsDisabled || !textGenerationSelection}
                          label={thinkingLabel}
                          onPress={() => setThinkingSheetOpen(true)}
                        />
                      ) : null}
                    </View>
                  }
                />
              </>
            )}
          </SettingsSection>
        </SettingsScroll>
      </BlurScreenRoot>

      <OptionSheet
        title="Time format"
        visible={timestampSheetOpen}
        options={TIMESTAMP_FORMAT_OPTIONS}
        selected={preferences.timestampFormat}
        onClose={() => setTimestampSheetOpen(false)}
        onSelect={(value) => void updatePreferences({ timestampFormat: value })}
      />

      <OptionSheet
        title="Visible threads"
        visible={previewSheetOpen}
        options={THREAD_PREVIEW_OPTIONS}
        selected={preferences.sidebarThreadPreviewCount}
        onClose={() => setPreviewSheetOpen(false)}
        onSelect={(value) => void updatePreferences({ sidebarThreadPreviewCount: value })}
      />

      <OptionSheet
        title="New threads"
        visible={threadModeSheetOpen}
        options={THREAD_MODE_OPTIONS}
        selected={settings?.defaultThreadEnvMode ?? "local"}
        onClose={() => setThreadModeSheetOpen(false)}
        onSelect={(value) => void updateServerSetting({ defaultThreadEnvMode: value })}
      />

      <SettingsModelPicker
        visible={defaultModelSheetOpen}
        options={modelOptions}
        selected={defaultThreadSelection}
        onClose={() => setDefaultModelSheetOpen(false)}
        onSelect={(option) => {
          void updateDefaultThreadModel(option);
        }}
      />

      <SettingsThinkingPicker
        visible={defaultThinkingSheetOpen}
        descriptors={defaultThinkingDescriptors}
        selection={defaultThreadSelection}
        onClose={() => setDefaultThinkingSheetOpen(false)}
        onSelect={(id, value) => {
          void updateDefaultThinkingOption(id, value);
        }}
      />

      <SettingsModelPicker
        visible={modelSheetOpen}
        options={modelOptions}
        selected={textGenerationSelection}
        emptyLabel={
          !isLive
            ? "Connect to a server to choose a text generation model."
            : "No models are available from the connected server yet."
        }
        onClose={() => setModelSheetOpen(false)}
        onSelect={(option) => {
          void updateTextGenerationModel(option);
        }}
      />

      <SettingsThinkingPicker
        visible={thinkingSheetOpen}
        descriptors={thinkingDescriptors}
        selection={textGenerationSelection}
        onClose={() => setThinkingSheetOpen(false)}
        onSelect={(id, value) => {
          void updateThinkingOption(id, value);
        }}
      />
    </Screen>
  );
}
