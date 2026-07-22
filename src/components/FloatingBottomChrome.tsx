import type { ReactNode } from "react";
import { useState } from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import {
  BOTTOM_CHROME_HORIZONTAL_PADDING,
  BOTTOM_CHROME_TOP_PADDING,
  bottomChromePaddingBottom,
} from "@/utils/bottomChrome";

/**
 * Floating bottom chrome that lifts with the keyboard.
 *
 * Uses animated `bottom` instead of `KeyboardStickyView`'s translateY transform.
 * Parent transforms break TextInput caret placement and text selection on Android
 * (and often web), so the input must stay in an untransformed layout tree.
 */
export function FloatingBottomChrome(props: {
  readonly children: ReactNode;
  readonly onHeightChange?: (height: number) => void;
  readonly style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const theme = useChromeTheme();
  const [chromeHeight, setChromeHeight] = useState(0);
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();

  const handleLayout = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    setChromeHeight(height);
    props.onHeightChange?.(height);
  };

  const fadeHeight = Math.max(Math.round(chromeHeight * 1.64), 96);

  // keyboardHeight is 0 when closed and negative when open (same units as translateY).
  const stickyStyle = useAnimatedStyle(() => ({
    bottom: -keyboardHeight.value,
  }));

  return (
    <Reanimated.View pointerEvents="box-none" style={[styles.sticky, stickyStyle]}>
      <ProgressiveBlurEdge
        backgroundColor={theme.background}
        edge="bottom"
        fadeHeight={fadeHeight}
        layout="flow"
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
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  sticky: {
    backgroundColor: "transparent",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  chrome: {
    backgroundColor: "transparent",
  },
});
