import type { ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";

import { useChromeTheme } from "./useChromeTheme";

export function FloatingScreenHeader(props: {
  readonly children: ReactNode;
  readonly onHeightChange?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = useChromeTheme();

  const handleLayout = (event: LayoutChangeEvent) => {
    const contentHeight = event.nativeEvent.layout.height;
    props.onHeightChange?.(insets.top + contentHeight);
  };

  return (
    <ProgressiveBlurEdge
      backgroundColor={theme.background}
      edge="top"
      fadeHeight={insets.top + 88}
      style={{ paddingTop: insets.top }}
    >
      <View
        pointerEvents="box-none"
        onLayout={handleLayout}
        style={{
          alignItems: "center",
          alignSelf: "flex-start",
          flexDirection: "row",
          gap: 8,
          justifyContent: "flex-start",
          paddingBottom: 4,
          paddingHorizontal: 14,
          paddingTop: 4,
          width: "100%",
        }}
      >
        {props.children}
      </View>
    </ProgressiveBlurEdge>
  );
}