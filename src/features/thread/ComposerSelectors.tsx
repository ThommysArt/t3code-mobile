import type { ModelSelection, ProviderOptionSelectionValue } from "@t3tools/contracts";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import {
  getDescriptorDefaultValue,
  getModelSelectionOption,
  groupModelOptions,
  type ModelOption,
} from "./modelOptions";

function Drawer({
  children,
  title,
  visible,
  onClose,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="max-h-[76%] rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-3"
          onPress={(event) => event.stopPropagation()}
        >
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
          <Text className="px-2 pb-3 pt-2 text-lg font-bold text-foreground">{title}</Text>
          <ScrollView>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
  const groups = groupModelOptions(options);

  return (
    <Drawer title="Select model" visible={visible} onClose={onClose}>
      {lockedProvider ? (
        <Text className="mb-3 px-2 text-xs leading-5 text-muted">
          This conversation is locked to its original provider.
        </Text>
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
    </Drawer>
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
    <Drawer title="Thinking options" visible={visible} onClose={onClose}>
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
    </Drawer>
  );
}
