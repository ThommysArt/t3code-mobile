import type { ReactNode } from "react";
import { useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import {
  BOTTOM_CHROME_HORIZONTAL_PADDING,
  BOTTOM_CHROME_TOP_PADDING,
  bottomChromePaddingBottom,
} from "@/utils/bottomChrome";

export function FloatingBottomChrome(props: {
  readonly children: ReactNode;
  readonly onHeightChange?: (height: number) => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const theme = useChromeTheme();
  const [chromeHeight, setChromeHeight] = useState(0);

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setChromeHeight(height);
    props.onHeightChange?.(height);
  };

  const fadeHeight = Math.max(Math.round(chromeHeight * 1.64), 96);

  return (
    <KeyboardStickyView style={styles.sticky} offset={{ closed: 0, opened: 0 }}>
      <ProgressiveBlurEdge
        backgroundColor={theme.background}
        edge="bottom"
        fadeHeight={fadeHeight}
      >
        <View
          pointerEvents="box-none"
          onLayout={handleLayout}
          style={[
            styles.chrome,
            {
              paddingHorizontal: BOTTOM_CHROME_HORIZONTAL_PADDING,
              paddingTop: BOTTOM_CHROME_TOP_PADDING,
              paddingBottom: bottomChromePaddingBottom(insets),
            },
            props.style,
          ]}
        >
          {props.children}
        </View>
      </ProgressiveBlurEdge>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  sticky: {
    backgroundColor: "transparent",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
  },
  chrome: {
    backgroundColor: "transparent",
  },
});