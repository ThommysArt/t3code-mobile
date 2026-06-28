import type {
  ProviderOptionSelectionValue,
  SidebarThreadPreviewCount,
  TimestampFormat,
} from "@t3tools/contracts";
import {
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  EnvironmentId,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { BottomSheet } from "heroui-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { usePreferences } from "@/runtime/PreferencesProvider";
import { usePrimaryEnvironment } from "@/runtime/usePrimaryEnvironment";
import { useServerSettings } from "@/runtime/useServerSettings";
import { formatRemoteError } from "@/runtime/statusLog";
import {
  buildModelOptions,
  modelOptionsForConversation,
  normalizeModelSelection,
  setModelSelectionOption,
  thinkingOptionDescriptors,
  type ModelOption,
} from "@/features/thread/modelOptions";
import { ModelSelectorDrawer, ThinkingOptionsDrawer } from "@/features/thread/ComposerSelectors";

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
  if (!props.visible) return null;

  return (
    <BottomSheet
      isOpen={props.visible}
      onOpenChange={(isOpen) => {
        if (!isOpen) props.onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          snapPoints={["40%"]}
          enableDynamicSizing={false}
          backgroundClassName="bg-background"
        >
          <BottomSheet.Title className="px-4 pb-3 pt-1 text-[17px] font-bold text-foreground">
            {props.title}
          </BottomSheet.Title>
          <View className="gap-1 px-3 pb-6">
            {props.options.map((option) => {
              const selected = option.value === props.selected;
              return (
                <Pressable
                  key={String(option.value)}
                  onPress={() => {
                    props.onSelect(option.value);
                    props.onClose();
                  }}
                  className={`rounded-2xl px-4 py-3 ${selected ? "bg-accent-soft" : "bg-default"}`}
                >
                  <Text
                    className={`text-sm ${selected ? "font-semibold text-accent" : "text-foreground"}`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
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
    () =>
      textGenerationSelection
        ? (modelOptions.find(
            (option) =>
              option.selection.instanceId === textGenerationSelection.instanceId &&
              option.selection.model === textGenerationSelection.model
          ) ?? null)
        : null,
    [modelOptions, textGenerationSelection]
  );

  const thinkingDescriptors = thinkingOptionDescriptors(selectedModelOption);
  const thinkingLabel = useMemo(() => {
    if (!textGenerationSelection || thinkingDescriptors.length === 0) return null;
    const descriptor = thinkingDescriptors[0];
    if (!descriptor || descriptor.type !== "select") return null;
    const value = textGenerationSelection.options?.find(
      (option) => option.id === descriptor.id
    )?.value;
    const option = descriptor.options.find((entry) => entry.id === value);
    return option?.label ?? String(value ?? "Default");
  }, [textGenerationSelection, thinkingDescriptors]);

  const defaultThreadSelection = preferences.defaultThreadModelSelection;
  const selectedDefaultModelOption = useMemo(
    () =>
      defaultThreadSelection
        ? (modelOptions.find(
            (option) =>
              option.selection.instanceId === defaultThreadSelection.instanceId &&
              option.selection.model === defaultThreadSelection.model
          ) ?? null)
        : null,
    [defaultThreadSelection, modelOptions]
  );
  const defaultThinkingDescriptors = thinkingOptionDescriptors(selectedDefaultModelOption);
  const defaultThinkingLabel = useMemo(() => {
    if (!defaultThreadSelection || defaultThinkingDescriptors.length === 0) return null;
    const descriptor = defaultThinkingDescriptors[0];
    if (!descriptor || descriptor.type !== "select") return null;
    const value = defaultThreadSelection.options?.find(
      (option) => option.id === descriptor.id
    )?.value;
    const option = descriptor.options.find((entry) => entry.id === value);
    return option?.label ?? String(value ?? "Default");
  }, [defaultThreadSelection, defaultThinkingDescriptors]);

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
      await updateServerSetting({
        textGenerationModelSelection: normalizeModelSelection(option.selection),
      });
    },
    [updateServerSetting]
  );

  const updateThinkingOption = useCallback(
    async (id: string, value: ProviderOptionSelectionValue) => {
      if (!textGenerationSelection) return;
      await updateServerSetting({
        textGenerationModelSelection: normalizeModelSelection(
          setModelSelectionOption(textGenerationSelection, id, value)
        ),
      });
    },
    [textGenerationSelection, updateServerSetting]
  );

  const updateDefaultThreadModel = useCallback(
    async (option: ModelOption) => {
      await updatePreferences({
        defaultThreadModelSelection: normalizeModelSelection(option.selection),
      });
    },
    [updatePreferences]
  );

  const updateDefaultThinkingOption = useCallback(
    async (id: string, value: ProviderOptionSelectionValue) => {
      if (!defaultThreadSelection) return;
      await updatePreferences({
        defaultThreadModelSelection: normalizeModelSelection(
          setModelSelectionOption(defaultThreadSelection, id, value)
        ),
      });
    },
    [defaultThreadSelection, updatePreferences]
  );

  const timestampLabel =
    TIMESTAMP_FORMAT_OPTIONS.find((option) => option.value === preferences.timestampFormat)
      ?.label ?? "System default";
  const serverControlsDisabled = !isLive || !settings || isLoading;

  return (
    <Screen edges={["top", "left", "right"]}>
      <SettingsScreenHeader title="General" subtitle="Mobile and server preferences" />
      <SettingsScroll>
        <EnvironmentPicker
          environments={readyEnvironments.map((environment) => ({
            environmentId: environment.connection.environmentId,
            label: environment.connection.label,
            connectionState: environment.connectionState,
          }))}
          selectedEnvironmentId={environmentId}
          onSelect={(nextEnvironmentId) => selectEnvironment(EnvironmentId.make(nextEnvironmentId))}
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
                  label={
                    selectedDefaultModelOption?.label ??
                    defaultThreadSelection?.model ??
                    "Project default"
                  }
                  onPress={() => setDefaultModelSheetOpen(true)}
                />
                {defaultThinkingLabel ? (
                  <SettingsPickerButton
                    fullWidth
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
                    label={settings?.defaultThreadEnvMode === "worktree" ? "New worktree" : "Local"}
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
                      label={
                        selectedModelOption?.label ?? textGenerationSelection?.model ?? "Choose"
                      }
                      onPress={() => setModelSheetOpen(true)}
                    />
                    {thinkingLabel ? (
                      <SettingsPickerButton
                        fullWidth
                        disabled={serverControlsDisabled}
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

      {timestampSheetOpen ? (
        <OptionSheet
          title="Time format"
          visible={timestampSheetOpen}
          options={TIMESTAMP_FORMAT_OPTIONS}
          selected={preferences.timestampFormat}
          onClose={() => setTimestampSheetOpen(false)}
          onSelect={(value) => void updatePreferences({ timestampFormat: value })}
        />
      ) : null}

      {previewSheetOpen ? (
        <OptionSheet
          title="Visible threads"
          visible={previewSheetOpen}
          options={THREAD_PREVIEW_OPTIONS}
          selected={preferences.sidebarThreadPreviewCount}
          onClose={() => setPreviewSheetOpen(false)}
          onSelect={(value) => void updatePreferences({ sidebarThreadPreviewCount: value })}
        />
      ) : null}

      {threadModeSheetOpen ? (
        <OptionSheet
          title="New threads"
          visible={threadModeSheetOpen}
          options={THREAD_MODE_OPTIONS}
          selected={settings?.defaultThreadEnvMode ?? "local"}
          onClose={() => setThreadModeSheetOpen(false)}
          onSelect={(value) => void updateServerSetting({ defaultThreadEnvMode: value })}
        />
      ) : null}

      {defaultModelSheetOpen ? (
        <ModelSelectorDrawer
          lockedProvider={false}
          options={modelOptionsForConversation(modelOptions, defaultThreadSelection, false)}
          selected={
            defaultThreadSelection ??
            modelOptions[0]?.selection ??
            createModelSelection(ProviderInstanceId.make("codex"), DEFAULT_GIT_TEXT_GENERATION_MODEL)
          }
          visible={defaultModelSheetOpen}
          onClose={() => setDefaultModelSheetOpen(false)}
          onSelect={(option) => {
            void updateDefaultThreadModel(option);
            setDefaultModelSheetOpen(false);
          }}
        />
      ) : null}

      {defaultThinkingSheetOpen && defaultThreadSelection ? (
        <ThinkingOptionsDrawer
          descriptors={defaultThinkingDescriptors}
          selection={defaultThreadSelection}
          visible={defaultThinkingSheetOpen}
          onClose={() => setDefaultThinkingSheetOpen(false)}
          onSelect={(id, value) => {
            void updateDefaultThinkingOption(id, value);
            setDefaultThinkingSheetOpen(false);
          }}
        />
      ) : null}

      {modelSheetOpen ? (
        <ModelSelectorDrawer
          lockedProvider={false}
          options={modelOptionsForConversation(modelOptions, textGenerationSelection, false)}
          selected={
            textGenerationSelection ??
            createModelSelection(ProviderInstanceId.make("codex"), DEFAULT_GIT_TEXT_GENERATION_MODEL)
          }
          visible={modelSheetOpen}
          onClose={() => setModelSheetOpen(false)}
          onSelect={(option) => {
            void updateTextGenerationModel(option);
            setModelSheetOpen(false);
          }}
        />
      ) : null}

      {thinkingSheetOpen ? (
        <ThinkingOptionsDrawer
          descriptors={thinkingDescriptors}
          selection={
            textGenerationSelection ??
            createModelSelection(ProviderInstanceId.make("codex"), DEFAULT_GIT_TEXT_GENERATION_MODEL)
          }
          visible={thinkingSheetOpen}
          onClose={() => setThinkingSheetOpen(false)}
          onSelect={(id, value) => {
            void updateThinkingOption(id, value);
            setThinkingSheetOpen(false);
          }}
        />
      ) : null}
    </Screen>
  );
}
