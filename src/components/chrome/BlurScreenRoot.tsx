import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BlurScreenProvider } from "./BlurScreenContext";
import { FloatingScreenHeader } from "./FloatingScreenHeader";

const DEFAULT_HEADER_CONTENT_HEIGHT = 48;

export function BlurScreenRoot(props: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly header?: ReactNode;
  readonly onHeaderHeightChange?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(
    insets.top + DEFAULT_HEADER_CONTENT_HEIGHT + 4
  );

  const handleHeaderHeightChange = (height: number) => {
    setHeaderHeight(height);
    props.onHeaderHeightChange?.(height);
  };

  return (
    <BlurScreenProvider value={{ headerHeight }}>
      <View style={{ flex: 1 }}>
        {props.children}
        {props.header ? (
          <FloatingScreenHeader onHeightChange={handleHeaderHeightChange}>
            {props.header}
          </FloatingScreenHeader>
        ) : null}
        {props.footer}
      </View>
    </BlurScreenProvider>
  );
}