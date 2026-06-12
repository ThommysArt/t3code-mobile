import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ModelSelection, ProviderOptionSelectionValue } from "@t3tools/contracts";
import { BottomSheet, SearchField } from "heroui-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import {
  getDescriptorDefaultValue,
  getModelSelectionOption,
  groupModelOptions,
  type ModelOption,
} from "./modelOptions";

function SelectorSheet({
  children,
  title,
  visible,
  onClose,
}: {
  readonly children: ReactNode;
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  return (
    <BottomSheet
      isOpen={visible}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          index={0}
          snapPoints={["55%", "85%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          contentContainerClassName="h-full"
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          handleIndicatorClassName="bg-border"
          backgroundClassName="bg-background"
        >
          <BottomSheet.Title className="px-5 pb-3 pt-1 text-lg font-bold text-foreground">
            {title}
          </BottomSheet.Title>
          {children}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export function ModelSelectorDrawer({
  lockedProvider,
  options,
  selected,
  visible,
  onClose,
  onSelect,
}: {
  readonly lockedProvider: boolean;
  readonly options: readonly ModelOption[];
  readonly selected: ModelSelection;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (option: ModelOption) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) ||
        option.selection.model.toLowerCase().includes(normalized) ||
        option.providerLabel.toLowerCase().includes(normalized)
    );
  }, [options, query]);
  const groups = groupModelOptions(filteredOptions);

  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  return (
    <SelectorSheet title="Select model" visible={visible} onClose={onClose}>
      <View className="px-4 pb-3">
        <SearchField value={query} onChange={setQuery}>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search models or providers" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        {lockedProvider ? (
          <Text className="mt-2 px-1 text-xs leading-5 text-muted">
            This conversation is locked to its original provider.
          </Text>
        ) : null}
      </View>
      <BottomSheetScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
      >
        {groups.length === 0 ? (
          <Text className="px-2 py-8 text-center text-sm text-muted">No matching models</Text>
        ) : null}
        {groups.map((group) => (
          <View key={group.providerKey} className="mb-4">
            <Text className="px-2 pb-1 text-xs font-bold uppercase tracking-[1px] text-muted">
              {group.providerLabel}
            </Text>
            {group.models.map((option) => {
              const active =
                option.selection.instanceId === selected.instanceId &&
                option.selection.model === selected.model;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(option)}
                  className={`mb-1 flex-row items-center rounded-2xl px-3 py-3 ${
                    active ? "bg-default" : ""
                  }`}
                >
                  <View className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-surface">
                    <Text className="text-xs font-bold text-muted">AI</Text>
                  </View>
                  <Text className="flex-1 text-[15px] font-semibold text-foreground">
                    {option.label}
                  </Text>
                  {active ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </BottomSheetScrollView>
    </SelectorSheet>
  );
}

export function ThinkingOptionsDrawer({
  descriptors,
  selection,
  visible,
  onClose,
  onSelect,
}: {
  readonly descriptors: readonly ModelOption["optionDescriptors"][number][];
  readonly selection: ModelSelection;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (id: string, value: ProviderOptionSelectionValue) => void;
}) {
  return (
    <SelectorSheet title="Thinking options" visible={visible} onClose={onClose}>
      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}
      >
        {descriptors.length === 0 ? (
          <Text className="px-2 py-4 text-sm leading-6 text-muted">
            This model does not advertise configurable thinking options.
          </Text>
        ) : (
          descriptors.map((descriptor) => {
            const currentValue =
              getModelSelectionOption(selection, descriptor.id) ??
              getDescriptorDefaultValue(descriptor);
            return (
              <View key={descriptor.id} className="mb-5">
                <Text className="px-2 text-sm font-bold text-foreground">{descriptor.label}</Text>
                {descriptor.description ? (
                  <Text className="px-2 pb-2 pt-1 text-xs leading-5 text-muted">
                    {descriptor.description}
                  </Text>
                ) : (
                  <View className="h-2" />
                )}
                {descriptor.type === "select"
                  ? descriptor.options.map((choice) => {
                      const active = currentValue === choice.id;
                      return (
                        <Pressable
                          key={choice.id}
                          onPress={() => onSelect(descriptor.id, choice.id)}
                          className={`mb-1 flex-row items-center rounded-2xl px-3 py-3 ${
                            active ? "bg-default" : ""
                          }`}
                        >
                          <View className="flex-1">
                            <Text className="text-sm font-semibold text-foreground">
                              {choice.label}
                            </Text>
                            {choice.description ? (
                              <Text className="mt-0.5 text-xs leading-5 text-muted">
                                {choice.description}
                              </Text>
                            ) : null}
                          </View>
                          {active ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                        </Pressable>
                      );
                    })
                  : [false, true].map((value) => {
                      const active = currentValue === value;
                      return (
                        <Pressable
                          key={String(value)}
                          onPress={() => onSelect(descriptor.id, value)}
                          className={`mb-1 flex-row items-center rounded-2xl px-3 py-3 ${
                            active ? "bg-default" : ""
                          }`}
                        >
                          <Text className="flex-1 text-sm font-semibold text-foreground">
                            {value ? "On" : "Off"}
                          </Text>
                          {active ? <View className="h-2.5 w-2.5 rounded-full bg-accent" /> : null}
                        </Pressable>
                      );
                    })}
              </View>
            );
          })
        )}
      </BottomSheetScrollView>
    </SelectorSheet>
  );
}
