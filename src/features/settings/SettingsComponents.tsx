import { useRouter } from "expo-router";
import { Switch } from "heroui-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { bottomChromePaddingBottom } from "@/utils/bottomChrome";

export function SettingsScreenHeader(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
}) {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";

  return (
    <View className="flex-row items-center gap-3 border-b border-separator px-4 pb-2 pt-2">
      <Pressable
        onPress={() => router.back()}
        className="h-10 w-10 items-center justify-center rounded-full bg-default"
      >
        <AppIcon name="back" size={21} color={isDark ? "#f5f5f5" : "#262626"} />
      </Pressable>
      <View className="flex-1">
        <Text className="text-[17px] font-bold text-foreground">{props.title}</Text>
        {props.subtitle ? (
          <Text className="text-[11px] text-muted">{props.subtitle}</Text>
        ) : null}
      </View>
      {props.action}
    </View>
  );
}

export function SettingsScroll(props: {
  readonly children: ReactNode;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const background = isDark ? "#090909" : "#f4f4f5";

  return (
    <ScrollView
      className="flex-1"
      style={{ flex: 1, backgroundColor: background }}
      contentContainerStyle={[
        {
          gap: 16,
          paddingHorizontal: 12,
          paddingBottom: bottomChromePaddingBottom(insets) + 16,
          paddingTop: 8,
        },
        props.contentContainerStyle,
      ]}
      showsVerticalScrollIndicator={false}
    >
      {props.children}
    </ScrollView>
  );
}

export function SettingsSection(props: {
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-[12px] font-bold uppercase tracking-[0.6px] text-muted">
          {props.title}
        </Text>
        {props.action}
      </View>
      <View className="overflow-hidden rounded-[20px] border border-border bg-surface">
        {props.children}
      </View>
    </View>
  );
}

export function SettingsDivider() {
  return <View className="mx-4 h-px bg-separator" />;
}

export function SettingsNavRow(props: {
  readonly label: string;
  readonly value?: string;
  readonly href: string;
}) {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";

  return (
    <Pressable
      onPress={() => router.push(props.href as never)}
      className="flex-row items-center gap-3 px-4 py-3"
      style={{ opacity: 1 }}
    >
      <Text className="flex-1 text-sm text-foreground">{props.label}</Text>
      {props.value ? (
        <Text className="max-w-[120px] text-sm text-muted" numberOfLines={1}>
          {props.value}
        </Text>
      ) : null}
      <AppIcon name="chevron-right" size={16} color={isDark ? "#737373" : "#9a9a9a"} />
    </Pressable>
  );
}

export function SettingsRow(props: {
  readonly title: string;
  readonly description?: string;
  readonly control?: ReactNode;
  readonly disabled?: boolean;
  readonly layout?: "inline" | "stacked";
}) {
  const stacked = props.layout === "stacked";

  return (
    <View
      className="gap-2 px-4 py-3"
      style={{ opacity: props.disabled ? 0.5 : 1 }}
    >
      <View className={stacked ? "flex-col gap-2" : "flex-row items-start gap-3"}>
        <View className="flex-1 gap-1">
          <Text className="text-sm font-semibold text-foreground">{props.title}</Text>
          {props.description ? (
            <Text className="text-xs leading-5 text-muted">{props.description}</Text>
          ) : null}
        </View>
        {props.control}
      </View>
    </View>
  );
}

export function SettingsSwitch(props: {
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <Switch
      isSelected={props.value}
      isDisabled={props.disabled}
      onSelectedChange={props.onValueChange}
    />
  );
}

export function SettingsPickerButton(props: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly fullWidth?: boolean;
}) {
  const isDark = useColorScheme() === "dark";

  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      className={`flex-row items-center justify-between gap-2 rounded-full border border-border bg-default px-3 py-2 ${
        props.fullWidth ? "w-full" : "min-w-[108px]"
      }`}
      style={{ opacity: props.disabled ? 0.5 : 1 }}
    >
      <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
        {props.label}
      </Text>
      <AppIcon name="chevron-down" size={14} color={isDark ? "#a3a3a3" : "#737373"} />
    </Pressable>
  );
}

export function SettingsLoadingRow(props: { readonly label: string }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-4">
      <ActivityIndicator color="#f97316" />
      <Text className="text-sm text-muted">{props.label}</Text>
    </View>
  );
}

export function EnvironmentPicker(props: {
  readonly environments: readonly {
    readonly environmentId: string;
    readonly label: string;
    readonly connectionState: string;
  }[];
  readonly selectedEnvironmentId: string | null;
  readonly onSelect: (environmentId: string) => void;
}) {
  if (props.environments.length <= 1) return null;

  return (
    <View className="gap-2">
      <Text className="px-1 text-[12px] font-bold uppercase tracking-[0.6px] text-muted">Server</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {props.environments.map((environment) => {
          const selected = environment.environmentId === props.selectedEnvironmentId;
          return (
            <Pressable
              key={environment.environmentId}
              onPress={() => props.onSelect(environment.environmentId)}
              className={`rounded-full border px-4 py-2 ${
                selected ? "border-accent bg-accent-soft" : "border-border bg-surface"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  selected ? "text-accent" : "text-foreground"
                }`}
              >
                {environment.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}