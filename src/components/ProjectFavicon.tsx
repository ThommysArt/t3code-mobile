import type { EnvironmentId } from "@t3tools/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { useColorScheme, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import {
  isProjectFaviconPreloaded,
  markProjectFaviconLoaded,
  useProjectFaviconUrl,
} from "@/runtime/useProjectFavicon";

export function ProjectFavicon(props: {
  readonly environmentId: EnvironmentId | null | undefined;
  readonly projectTitle: string;
  readonly workspaceRoot?: string | null;
  readonly size?: number;
}) {
  const size = props.size ?? 22;
  const isDark = useColorScheme() === "dark";
  const muted = isDark ? "#858585" : "#737373";
  const { url, headers } = useProjectFaviconUrl(props.environmentId, props.workspaceRoot);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(() =>
    url && isProjectFaviconPreloaded(url) ? "loaded" : "loading"
  );

  // Reset status when the resolved URL changes.
  const [trackedUrl, setTrackedUrl] = useState(url);
  if (url !== trackedUrl) {
    setTrackedUrl(url);
    setStatus(url && isProjectFaviconPreloaded(url) ? "loaded" : "loading");
  }

  const showImage = url !== null && status === "loaded";

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {!showImage ? <AppIcon name="folder" size={size * 0.72} color={muted} /> : null}
      {url ? (
        <Image
          source={{ uri: url, headers }}
          accessibilityLabel={`${props.projectTitle} favicon`}
          contentFit="contain"
          style={{
            width: size,
            height: size,
            borderRadius: size * 0.18,
            ...(showImage ? {} : { position: "absolute" as const, opacity: 0 }),
          }}
          onLoad={() => {
            markProjectFaviconLoaded(url);
            setStatus("loaded");
          }}
          onError={() => setStatus("error")}
        />
      ) : null}
    </View>
  );
}
