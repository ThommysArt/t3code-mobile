import { useRouter } from "expo-router";
import { Switch } from "heroui-native";
import type { ReactNode, RefObject } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { HeaderBubble, HeaderSpacer } from "@/components/chrome";
import { useBlurScreen } from "@/components/chrome/BlurScreenContext";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { bottomChromePaddingBottom } from "@/utils/bottomChrome";

export const FORM_CONTROL_HEIGHT = 40;
export const FORM_FIELD_LABEL_CLASS =
  "text-[12px] font-bold uppercase tracking-[0.6px] text-muted";

export function SettingsScreenHeader(props: {
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
}) {
  const router = useRouter();
  const theme = useChromeTheme();

  return (
    <>
      <HeaderBubble
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        variant="icon"
      >
        <AppIcon name="back" size={21} color={theme.foreground} />
      </HeaderBubble>
      <HeaderBubble subtitle={props.subtitle} title={props.title} variant="title" />
      {props.action ? (
        <>
          <HeaderSpacer />
          {props.action}
        </>
      ) : null}
    </>
  );
}

export function SettingsScroll(props: {
  readonly children: ReactNode;
  readonly contentContainerStyle?: StyleProp<ViewStyle>;
  readonly keyboardShouldPersistTaps?: "always" | "never" | "handled";
  readonly scrollRef?: RefObject<ScrollView | null>;
}) {
  const insets = useSafeAreaInsets();
  const { headerHeight } = useBlurScreen();
  const isDark = useColorScheme() === "dark";
  const background = isDark ? "#090909" : "#f4f4f5";

  return (
    <ScrollView
      ref={props.scrollRef}
      className="flex-1"
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
      style={{ flex: 1, backgroundColor: background }}
      contentContainerStyle={[
        {
          gap: 16,
          paddingHorizontal: 12,
          paddingBottom: bottomChromePaddingBottom(insets) + 16,
          paddingTop: headerHeight + 4,
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
  return <View className="h-px bg-separator" />;
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

export function SettingsFieldLabel(props: { readonly children: string }) {
  return <Text className={FORM_FIELD_LABEL_CLASS}>{props.children}</Text>;
}

export function SettingsTextInput({ style, ...props }: TextInputProps) {
  const theme = useChromeTheme();

  return (
    <TextInput
      placeholderTextColor={theme.muted}
      className="rounded-2xl border border-border px-3 text-sm text-foreground"
      style={[
        {
          backgroundColor: theme.isDark ? "#101010" : "#f8f8f9",
          borderColor: theme.border,
          color: theme.foreground,
          fontSize: 14,
          height: FORM_CONTROL_HEIGHT,
        },
        style,
      ]}
      {...props}
    />
  );
}

export function SettingsTextArea({ style, ...props }: TextInputProps) {
  const theme = useChromeTheme();

  return (
    <TextInput
      multiline
      placeholderTextColor={theme.muted}
      textAlignVertical="top"
      className="rounded-2xl border border-border px-3 py-2.5 text-sm text-foreground"
      style={[
        {
          backgroundColor: theme.isDark ? "#101010" : "#f8f8f9",
          borderColor: theme.border,
          color: theme.foreground,
          fontSize: 14,
          minHeight: 80,
        },
        style,
      ]}
      {...props}
    />
  );
}

function settingsButtonClassName(
  tone: "primary" | "secondary" | "danger",
  disabled: boolean,
  flex?: boolean
): string {
  const width = flex ? "flex-1" : "";
  if (disabled) return `${width} h-10 items-center justify-center rounded-full bg-default px-4`;
  switch (tone) {
    case "primary":
      return `${width} h-10 items-center justify-center rounded-full bg-accent px-4`;
    case "danger":
      return `${width} h-10 items-center justify-center rounded-full bg-danger-soft px-4`;
    default:
      return `${width} h-10 items-center justify-center rounded-full border border-border bg-default px-4`;
  }
}

function settingsButtonTextClassName(
  tone: "primary" | "secondary" | "danger",
  disabled: boolean
): string {
  if (disabled) return "text-sm font-semibold text-muted";
  switch (tone) {
    case "primary":
      return "text-sm font-semibold text-accent-foreground";
    case "danger":
      return "text-sm font-semibold text-danger";
    default:
      return "text-sm font-semibold text-foreground";
  }
}

export function SettingsPrimaryButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly flex?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      className={settingsButtonClassName("primary", props.disabled === true, props.flex)}
      style={{ opacity: props.disabled ? 0.72 : 1 }}
    >
      <Text className={settingsButtonTextClassName("primary", props.disabled === true)}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function SettingsSecondaryButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly flex?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      className={settingsButtonClassName("secondary", props.disabled === true, props.flex)}
      style={{ opacity: props.disabled ? 0.72 : 1 }}
    >
      <Text className={settingsButtonTextClassName("secondary", props.disabled === true)}>
        {props.label}
      </Text>
    </Pressable>
  );
}

export function SettingsDangerButton(props: {
  readonly label: string;
  readonly disabled?: boolean;
  readonly flex?: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      className={settingsButtonClassName("danger", props.disabled === true, props.flex)}
      style={{ opacity: props.disabled ? 0.72 : 1 }}
    >
      <Text className={settingsButtonTextClassName("danger", props.disabled === true)}>
        {props.label}
      </Text>
    </Pressable>
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
      <ActivityIndicator color="#2563eb" />
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