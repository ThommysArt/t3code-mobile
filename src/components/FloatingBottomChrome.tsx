import type { ReactNode } from "react";
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

  const handleLayout = (event: LayoutChangeEvent) => {
    props.onHeightChange?.(event.nativeEvent.layout.height);
  };

  return (
    <KeyboardStickyView style={styles.sticky} offset={{ closed: 0, opened: 0 }}>
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