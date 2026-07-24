import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { ConnectionStatusTone } from "./connectionStatus";

export function ConnectionStatusIndicator(props: {
  readonly status: ConnectionStatusTone;
  /** Extra muted text after the status label (e.g. thread count). */
  readonly detail?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly compact?: boolean;
}) {
  const { status, detail, style, compact } = props;
  const textClass = compact
    ? "text-[10px] font-semibold text-muted"
    : "text-[11px] font-semibold text-muted";
  const detailClass = compact ? "text-[10px] text-muted" : "text-[11px] text-muted";
  const dotSize = compact ? 6 : 8;

  return (
    <View className="flex-row items-center gap-1.5" style={style}>
      <View
        className="rounded-full"
        style={{
          width: dotSize,
          height: dotSize,
          backgroundColor: status.color,
        }}
      />
      <Text className={textClass}>{status.label}</Text>
      {detail ? <Text className={detailClass}>{detail}</Text> : null}
      {status.isConnecting ? (
        <ActivityIndicator size="small" color={status.color} style={{ transform: [{ scale: 0.7 }] }} />
      ) : null}
    </View>
  );
}
