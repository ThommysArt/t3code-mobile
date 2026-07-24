import type { EnvironmentScopedProjectShell } from "@t3tools/client-runtime";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { ProjectFavicon } from "@/components/ProjectFavicon";
import { GEIST_MONO } from "@/theme/fonts";

export function NewThreadProjectPicker(props: {
  readonly visible: boolean;
  readonly projects: readonly EnvironmentScopedProjectShell[];
  readonly environmentLabels: ReadonlyMap<string, string>;
  readonly multiEnvironment: boolean;
  readonly onClose: () => void;
  readonly onSelect: (project: EnvironmentScopedProjectShell) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const muted = isDark ? "#858585" : "#737373";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const surface = isDark ? "#141414" : "#ffffff";
  const border = isDark ? "#2a2a2a" : "#e4e4e7";
  const backdrop = isDark ? "rgba(0,0,0,0.62)" : "rgba(15,15,15,0.35)";
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (props.visible) {
      Keyboard.dismiss();
      setQuery("");
    }
  }, [props.visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...props.projects].sort((left, right) =>
      left.title.localeCompare(right.title)
    );
    if (!q) return sorted;
    return sorted.filter(
      (project) =>
        project.title.toLowerCase().includes(q) ||
        project.workspaceRoot.toLowerCase().includes(q) ||
        (props.environmentLabels.get(project.environmentId)?.toLowerCase().includes(q) ?? false)
    );
  }, [props.environmentLabels, props.projects, query]);

  const sheetMaxHeight = Math.min(windowHeight * 0.78, 640);

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityLabel="Dismiss project picker"
          onPress={props.onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: backdrop }]}
        />
        <View
          style={{
            maxHeight: sheetMaxHeight,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: border,
            backgroundColor: surface,
            paddingBottom: Math.max(insets.bottom, 12),
            overflow: "hidden",
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingTop: 10,
              paddingBottom: 6,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                backgroundColor: isDark ? "#3a3a3a" : "#d4d4d8",
              }}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingBottom: 8,
              gap: 10,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: foreground, fontSize: 17, fontWeight: "700" }}>
                New thread
              </Text>
              <Text style={{ color: muted, fontSize: 12 }}>
                Choose a project to start a coding session.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              onPress={props.onClose}
              hitSlop={10}
              style={({ pressed }) => ({
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isDark ? "#222" : "#f4f4f5",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <AppIcon name="x" size={16} color={muted} />
            </Pressable>
          </View>

          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: border,
              backgroundColor: isDark ? "#101010" : "#f8f8f9",
              paddingHorizontal: 12,
              height: 42,
            }}
          >
            <AppIcon name="search" size={16} color={muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search projects"
              placeholderTextColor={muted}
              autoFocus={false}
              returnKeyType="search"
              style={{ flex: 1, color: foreground, fontSize: 14, paddingVertical: 0 }}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => `${item.environmentId}:${item.id}`}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: sheetMaxHeight - 160 }}
            contentContainerStyle={{
              paddingHorizontal: 10,
              paddingBottom: 8,
              flexGrow: 1,
            }}
            ListEmptyComponent={
              <Text
                style={{
                  color: muted,
                  fontSize: 13,
                  textAlign: "center",
                  paddingVertical: 36,
                  paddingHorizontal: 20,
                }}
              >
                {props.projects.length === 0
                  ? "No projects available on connected environments."
                  : "No projects match that search."}
              </Text>
            }
            renderItem={({ item: project }) => {
              const envLabel = props.environmentLabels.get(project.environmentId);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`New thread in ${project.title}`}
                  onPress={() => props.onSelect(project)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderRadius: 14,
                    paddingHorizontal: 10,
                    paddingVertical: 11,
                    backgroundColor: pressed
                      ? isDark
                        ? "#1c1c1c"
                        : "#f4f4f5"
                      : "transparent",
                  })}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 11,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isDark ? "#1c1c1c" : "#f0f0f1",
                      overflow: "hidden",
                    }}
                  >
                    <ProjectFavicon
                      environmentId={project.environmentId}
                      projectTitle={project.title}
                      workspaceRoot={project.workspaceRoot}
                      size={18}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text
                      style={{ color: foreground, fontSize: 14, fontWeight: "600" }}
                      numberOfLines={1}
                    >
                      {project.title}
                    </Text>
                    <Text
                      style={{
                        color: muted,
                        fontSize: 11,
                        fontFamily: GEIST_MONO,
                      }}
                      numberOfLines={1}
                    >
                      {props.multiEnvironment && envLabel
                        ? `${envLabel} · ${project.workspaceRoot}`
                        : project.workspaceRoot}
                    </Text>
                  </View>
                  <AppIcon name="chevron-right" size={16} color={muted} />
                </Pressable>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}
