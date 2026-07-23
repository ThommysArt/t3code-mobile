import type { ModelSelection, ProviderOptionSelectionValue } from "@t3tools/contracts";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  getDescriptorDefaultValue,
  getModelSelectionOption,
  groupModelOptions,
  type ModelOption,
} from "@/features/thread/modelOptions";

function SheetChrome(props: {
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly search?: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder: string;
  };
  readonly footer?: ReactNode;
}) {
  const isDark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const sheetBackground = isDark ? "#141414" : "#ffffff";
  const backdrop = isDark ? "rgba(0,0,0,0.55)" : "rgba(15,23,42,0.35)";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const muted = isDark ? "#a3a3a3" : "#737373";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const inputBackground = isDark ? "#0f0f0f" : "#f4f4f5";

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
            maxHeight: "82%",
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: sheetBackground,
            borderTopWidth: 1,
            borderColor: border,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
          <View className="items-center pb-2 pt-3">
            <View
              style={{
                height: 4,
                width: 40,
                borderRadius: 999,
                backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)",
              }}
            />
          </View>
          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text style={{ color: foreground, fontSize: 17, fontWeight: "700" }}>
              {props.title}
            </Text>
            <Pressable
              accessibilityLabel="Close picker"
              accessibilityRole="button"
              hitSlop={10}
              onPress={props.onClose}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: inputBackground }}
            >
              <AppIcon name="x" size={16} color={muted} />
            </Pressable>
          </View>
          {props.search ? (
            <View className="px-4 pb-3">
              <TextInput
                value={props.search.value}
                onChangeText={props.search.onChange}
                placeholder={props.search.placeholder}
                placeholderTextColor={muted}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                style={{
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: border,
                  backgroundColor: inputBackground,
                  color: foreground,
                  fontSize: 15,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                }}
              />
            </View>
          ) : null}
          <View style={{ flexGrow: 1, flexShrink: 1, minHeight: 180 }}>{props.children}</View>
          {props.footer}
        </View>
      </View>
    </Modal>
  );
}

export function SettingsModelPicker(props: {
  readonly visible: boolean;
  readonly options: readonly ModelOption[];
  readonly selected: ModelSelection | null;
  readonly emptyLabel?: string;
  readonly onClose: () => void;
  readonly onSelect: (option: ModelOption) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const [query, setQuery] = useState("");
  const muted = isDark ? "#a3a3a3" : "#737373";
  const accent = isDark ? "#60a5fa" : "#2563eb";
  const rowActive = isDark ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.1)";

  useEffect(() => {
    if (!props.visible) setQuery("");
  }, [props.visible]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return props.options;
    return props.options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) ||
        option.selection.model.toLowerCase().includes(normalized) ||
        option.providerLabel.toLowerCase().includes(normalized)
    );
  }, [props.options, query]);

  const groups = useMemo(() => groupModelOptions(filtered), [filtered]);
  const rows = useMemo(() => {
    const items: Array<
      | { readonly kind: "header"; readonly key: string; readonly label: string }
      | { readonly kind: "model"; readonly key: string; readonly option: ModelOption }
    > = [];
    for (const group of groups) {
      items.push({
        kind: "header",
        key: `header:${group.providerKey}`,
        label: group.providerLabel,
      });
      for (const option of group.models) {
        items.push({ kind: "model", key: option.key, option });
      }
    }
    return items;
  }, [groups]);

  return (
    <SheetChrome
      title="Select model"
      visible={props.visible}
      onClose={props.onClose}
      search={{
        value: query,
        onChange: setQuery,
        placeholder: "Search models or providers",
      }}
    >
      {rows.length === 0 ? (
        <View className="items-center px-6 py-10">
          <Text style={{ color: muted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
            {props.emptyLabel ??
              (props.options.length === 0
                ? "No models are available from the connected server yet."
                : "No models match your search.")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.key}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item }) => {
            if (item.kind === "header") {
              return (
                <Text
                  style={{
                    color: muted,
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    paddingHorizontal: 10,
                    paddingTop: 10,
                    paddingBottom: 6,
                  }}
                >
                  {item.label}
                </Text>
              );
            }

            const active =
              props.selected != null &&
              item.option.selection.instanceId === props.selected.instanceId &&
              item.option.selection.model === props.selected.model;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  props.onSelect(item.option);
                  props.onClose();
                }}
                className="mb-1 flex-row items-center rounded-2xl px-3 py-3"
                style={{ backgroundColor: active ? rowActive : "transparent" }}
              >
                <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-default">
                  <ProviderIcon
                    driver={item.option.providerDriver}
                    label={item.option.providerLabel}
                    size={21}
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                    {item.option.label}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                    {item.option.selection.model}
                  </Text>
                </View>
                {active ? (
                  <View
                    style={{
                      height: 10,
                      width: 10,
                      borderRadius: 999,
                      backgroundColor: accent,
                    }}
                  />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SheetChrome>
  );
}

export function SettingsThinkingPicker(props: {
  readonly visible: boolean;
  readonly descriptors: readonly ModelOption["optionDescriptors"][number][];
  readonly selection: ModelSelection | null;
  readonly onClose: () => void;
  readonly onSelect: (id: string, value: ProviderOptionSelectionValue) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const muted = isDark ? "#a3a3a3" : "#737373";
  const accent = isDark ? "#60a5fa" : "#2563eb";
  const rowActive = isDark ? "rgba(37,99,235,0.18)" : "rgba(37,99,235,0.1)";

  return (
    <SheetChrome title="Thinking options" visible={props.visible} onClose={props.onClose}>
      {props.descriptors.length === 0 || !props.selection ? (
        <View className="items-center px-6 py-10">
          <Text style={{ color: muted, fontSize: 14, textAlign: "center", lineHeight: 20 }}>
            This model does not advertise configurable thinking options.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[...props.descriptors]}
          keyExtractor={(descriptor) => descriptor.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item: descriptor }) => {
            const currentValue =
              getModelSelectionOption(props.selection!, descriptor.id) ??
              getDescriptorDefaultValue(descriptor);

            const choices =
              descriptor.type === "select"
                ? descriptor.options.map((choice) => ({
                    key: choice.id,
                    label: choice.label,
                    description: choice.description ?? null,
                    value: choice.id as ProviderOptionSelectionValue,
                  }))
                : [
                    {
                      key: "off",
                      label: "Off",
                      description: null,
                      value: false as ProviderOptionSelectionValue,
                    },
                    {
                      key: "on",
                      label: "On",
                      description: null,
                      value: true as ProviderOptionSelectionValue,
                    },
                  ];

            return (
              <View className="mb-4">
                <Text className="px-2 text-sm font-bold text-foreground">{descriptor.label}</Text>
                {descriptor.description ? (
                  <Text className="px-2 pb-2 pt-1 text-xs leading-5 text-muted">
                    {descriptor.description}
                  </Text>
                ) : (
                  <View className="h-2" />
                )}
                {choices.map((choice) => {
                  const active = currentValue === choice.value;
                  return (
                    <Pressable
                      key={choice.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => {
                        props.onSelect(descriptor.id, choice.value);
                        props.onClose();
                      }}
                      className="mb-1 flex-row items-center rounded-2xl px-3 py-3"
                      style={{ backgroundColor: active ? rowActive : "transparent" }}
                    >
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-semibold text-foreground">{choice.label}</Text>
                        {choice.description ? (
                          <Text className="mt-0.5 text-xs leading-5 text-muted">
                            {choice.description}
                          </Text>
                        ) : null}
                      </View>
                      {active ? (
                        <View
                          style={{
                            height: 10,
                            width: 10,
                            borderRadius: 999,
                            backgroundColor: accent,
                          }}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            );
          }}
        />
      )}
    </SheetChrome>
  );
}
