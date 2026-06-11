import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

export type AppIconName =
  | "arrow-up"
  | "back"
  | "branch"
  | "chevron-down"
  | "compose"
  | "folder"
  | "git"
  | "refresh"
  | "search"
  | "settings"
  | "terminal"
  | "wifi";

export function AppIcon(props: {
  readonly name: AppIconName;
  readonly size?: number;
  readonly color?: string;
  readonly strokeWidth?: number;
}) {
  const size = props.size ?? 20;
  const color = props.color ?? "currentColor";
  const strokeWidth = props.strokeWidth ?? 2;
  const common = {
    fill: "none",
    stroke: color,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {props.name === "settings" ? (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3v-4h.09A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 8.95 4.6 1.7 1.7 0 0 0 9.98 3.1V3h4v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 7l-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.91 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"
            {...common}
          />
        </>
      ) : props.name === "folder" ? (
        <Path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" {...common} />
      ) : props.name === "branch" || props.name === "git" ? (
        <>
          <Circle cx="6" cy="5" r="2" {...common} />
          <Circle cx="18" cy="6" r="2" {...common} />
          <Circle cx="6" cy="19" r="2" {...common} />
          <Path d="M6 7v10M8 7c2.5 0 3 4 6 4h2M18 8v4c0 4-3 7-7 7H8" {...common} />
        </>
      ) : props.name === "search" ? (
        <>
          <Circle cx="10.5" cy="10.5" r="6.5" {...common} />
          <Line x1="15.5" y1="15.5" x2="21" y2="21" {...common} />
        </>
      ) : props.name === "compose" ? (
        <>
          <Rect x="4" y="5" width="14" height="15" rx="3" {...common} />
          <Path d="m13 4 2-2 5 5-2 2-6.5 1.5Z" {...common} />
        </>
      ) : props.name === "back" ? (
        <>
          <Line x1="20" y1="12" x2="5" y2="12" {...common} />
          <Polyline points="11 6 5 12 11 18" {...common} />
        </>
      ) : props.name === "arrow-up" ? (
        <>
          <Line x1="12" y1="19" x2="12" y2="5" {...common} />
          <Polyline points="6 11 12 5 18 11" {...common} />
        </>
      ) : props.name === "refresh" ? (
        <>
          <Path d="M20 7v5h-5" {...common} />
          <Path d="M4 17v-5h5" {...common} />
          <Path d="M6.1 8.5A7 7 0 0 1 18.8 7L20 12M4 12l1.2 5A7 7 0 0 0 18 15.5" {...common} />
        </>
      ) : props.name === "terminal" ? (
        <>
          <Rect x="3" y="4" width="18" height="16" rx="3" {...common} />
          <Polyline points="7 9 10 12 7 15" {...common} />
          <Line x1="13" y1="15" x2="17" y2="15" {...common} />
        </>
      ) : props.name === "wifi" ? (
        <>
          <Path
            d="M4.5 9a11 11 0 0 1 15 0M7.5 12.5a7 7 0 0 1 9 0M10.5 16a2.5 2.5 0 0 1 3 0"
            {...common}
          />
          <Circle cx="12" cy="19" r="1" fill={color} />
        </>
      ) : (
        <Polyline points="6 9 12 15 18 9" {...common} />
      )}
    </Svg>
  );
}
