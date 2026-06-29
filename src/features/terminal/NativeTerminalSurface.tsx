import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type ViewProps,
  useColorScheme,
} from "react-native";

import { resolveNativeTerminalSurfaceView } from "./nativeTerminalModule";
import { TerminalAnsiText } from "./terminalAnsiText";
import {
  buildGhosttyThemeConfig,
  getPierreTerminalTheme,
  type TerminalTheme,
} from "./terminalTheme";

interface TerminalInputEvent {
  readonly data: string;
}

interface TerminalResizeEvent {
  readonly cols: number;
  readonly rows: number;
}

interface TerminalSurfaceProps extends ViewProps {
  readonly terminalKey: string;
  readonly buffer: string;
  readonly fontSize?: number;
  readonly isRunning: boolean;
  readonly keyboardFocusRequest?: number;
  readonly renderInput?: boolean;
  readonly theme?: TerminalTheme;
  readonly onInput: (data: string) => void;
  readonly onResize: (size: { readonly cols: number; readonly rows: number }) => void;
}

function estimateGridSize(input: {
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
}): { readonly cols: number; readonly rows: number } {
  const cellWidth = input.fontSize * 0.62;
  const cellHeight = input.fontSize * 1.35;
  return {
    cols: Math.max(20, Math.min(400, Math.floor(input.width / cellWidth))),
    rows: Math.max(5, Math.min(200, Math.floor(input.height / cellHeight))),
  };
}

const FallbackTerminalSurface = memo(function FallbackTerminalSurface(props: TerminalSurfaceProps) {
  const fontSize = props.fontSize ?? 12;
  const renderInput = props.renderInput ?? true;
  const inputRef = useRef<TextInput>(null);
  const [inputValue, setInputValue] = useState("");
  const appearanceScheme = useColorScheme() === "light" ? "light" : "dark";
  const theme = props.theme ?? getPierreTerminalTheme(appearanceScheme);
  const statusLabel = props.isRunning
    ? "Native terminal unavailable. Using text fallback."
    : "Open terminal to start a shell.";

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    props.onResize(estimateGridSize({ width, height, fontSize }));
  };

  useEffect(() => {
    if ((props.keyboardFocusRequest ?? 0) > 0) {
      inputRef.current?.blur();
      const focusFrame = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(focusFrame);
    }

    return undefined;
  }, [props.keyboardFocusRequest]);

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: theme.background,
          borderRadius: 8,
          overflow: "hidden",
        },
        props.style,
      ]}
      onLayout={handleLayout}
    >
      <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
        <Text
          style={{
            color: theme.mutedForeground,
            fontSize: 11,
            paddingBottom: 8,
          }}
        >
          {statusLabel}
        </Text>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <TerminalAnsiText buffer={props.buffer || "$ "} theme={theme} />
        </ScrollView>
      </View>
      {renderInput ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: 8,
          }}
        >
          <TextInput
            ref={inputRef}
            autoCapitalize="none"
            autoCorrect={false}
            blurOnSubmit={false}
            editable={props.isRunning}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="type and press return"
            placeholderTextColor={theme.mutedForeground}
            returnKeyType="send"
            style={{
              color: theme.foreground,
              flex: 1,
              fontFamily: "Menlo",
              fontSize: 13,
              padding: 0,
            }}
            onSubmitEditing={() => {
              if (inputValue.length > 0) {
                props.onInput(`${inputValue}\n`);
                setInputValue("");
              }
            }}
          />
          <Pressable
            disabled={!props.isRunning}
            style={({ pressed }) => ({
              opacity: !props.isRunning ? 0.35 : pressed ? 0.65 : 1,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: theme.border,
            })}
            onPress={() => props.onInput("\u0003")}
          >
            <Text
              style={{
                color: theme.foreground,
                fontSize: 11,
                fontWeight: "600",
              }}
            >
              Ctrl-C
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

export const TerminalSurface = memo(function TerminalSurface(props: TerminalSurfaceProps) {
  const fontSize = props.fontSize ?? 12;
  const keyboardInputRef = useRef<TextInput>(null);
  const appearanceScheme = useColorScheme() === "light" ? "light" : "dark";
  const theme = props.theme ?? getPierreTerminalTheme(appearanceScheme);
  const { onInput, onResize } = props;
  const NativeTerminalSurfaceView = resolveNativeTerminalSurfaceView();
  const hasNativeSurface = Boolean(NativeTerminalSurfaceView);

  const handleNativeInput = useCallback(
    (event: NativeSyntheticEvent<TerminalInputEvent>) => {
      onInput(event.nativeEvent.data);
    },
    [onInput]
  );
  const handleNativeResize = useCallback(
    (event: NativeSyntheticEvent<TerminalResizeEvent>) => {
      onResize({
        cols: event.nativeEvent.cols,
        rows: event.nativeEvent.rows,
      });
    },
    [onResize]
  );

  useEffect(() => {
    if (!NativeTerminalSurfaceView || (props.keyboardFocusRequest ?? 0) <= 0) {
      return undefined;
    }

    keyboardInputRef.current?.blur();
    const focusFrame = requestAnimationFrame(() => keyboardInputRef.current?.focus());
    return () => cancelAnimationFrame(focusFrame);
  }, [NativeTerminalSurfaceView, props.keyboardFocusRequest]);

  const handleKeyboardInput = useCallback(
    (data: string) => {
      if (data.length > 0) {
        onInput(data);
        keyboardInputRef.current?.clear();
      }
    },
    [onInput]
  );

  if (NativeTerminalSurfaceView) {
    return (
      <View style={props.style}>
        <NativeTerminalSurfaceView
          appearanceScheme={appearanceScheme}
          backgroundColor={theme.background}
          foregroundColor={theme.foreground}
          mutedForegroundColor={theme.mutedForeground}
          terminalKey={props.terminalKey}
          initialBuffer={props.buffer}
          fontSize={fontSize}
          style={{ flex: 1 }}
          themeConfig={buildGhosttyThemeConfig(theme)}
          onInput={handleNativeInput}
          onResize={handleNativeResize}
        />
        <TextInput
          ref={keyboardInputRef}
          autoCapitalize="none"
          autoCorrect={false}
          blurOnSubmit={false}
          caretHidden
          editable={props.isRunning}
          keyboardType="ascii-capable"
          style={{ bottom: 0, height: 1, left: 0, opacity: 0.01, position: "absolute", width: 1 }}
          onChangeText={handleKeyboardInput}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === "Backspace") {
              onInput("\u007f");
            }
          }}
          onSubmitEditing={() => onInput("\n")}
        />
      </View>
    );
  }

  return <FallbackTerminalSurface {...props} fontSize={fontSize} theme={theme} />;
});