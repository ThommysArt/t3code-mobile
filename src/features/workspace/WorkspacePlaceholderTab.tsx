import { Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";

export function WorkspacePlaceholderTab(props: {
  readonly icon: AppIconName;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-default">
        <AppIcon name={props.icon} size={28} color="#2563eb" />
      </View>
      <Text className="text-center text-lg font-bold text-foreground">{props.title}</Text>
      <Text className="mt-2 text-center text-sm leading-6 text-muted">{props.detail}</Text>
    </View>
  );
}