import type { ExpoConfig } from "expo/config";
import type { WithAndroidWidgetsParams } from "react-native-android-widget";

const packageJson = require("./package.json") as { readonly version: string };

const androidWidgetConfig: WithAndroidWidgetsParams = {
  widgets: [
    {
      name: "LatestThreads",
      label: "Latest threads",
      description: "Unsettled work first, then recent settled threads when under five.",
      minWidth: "250dp",
      minHeight: "180dp",
      targetCellWidth: 4,
      targetCellHeight: 3,
      // Android enforces a 30-minute floor for automatic updates.
      updatePeriodMillis: 30 * 60 * 1000,
      previewImage: "./assets/widget-preview/latest-threads.png",
    },
  ],
};

const config: ExpoConfig = {
  name: "T3 Code Mobile",
  slug: "t3-code-mobile",
  owner: "thommysart24",
  version: packageJson.version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "t3code-mobile",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android", "web"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.t3tools.t3code.mobile",
    icon: "./assets/icon.png",
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
      NSLocalNetworkUsageDescription:
        "Allow T3 Code Mobile to connect to T3 Code servers on your local network or tailnet.",
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.t3tools.t3code.mobile",
    softwareKeyboardLayoutMode: "resize",
    icon: "./assets/icon.png",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon.png",
      backgroundColor: "#09090b",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        // Monochrome status-bar glyph; keep color for the accent tint.
        icon: "./assets/images/icon-192.png",
        color: "#0ea5e9",
        defaultChannel: "agent-events",
      },
    ],
    "expo-sqlite",
    "expo-secure-store",
    [
      "expo-camera",
      {
        cameraPermission:
          "Allow T3 Code Mobile to access your camera so you can scan pairing QR codes.",
        barcodeScannerEnabled: true,
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow T3 Code Mobile to access your photos so you can attach images to prompts.",
      },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 180,
        resizeMode: "contain",
        backgroundColor: "#fafafa",
        dark: {
          image: "./assets/splash-icon.png",
          backgroundColor: "#09090b",
        },
      },
    ],
    "./plugins/withAndroidCleartextTraffic.cjs",
    "./plugins/withAndroidReleaseSigning.cjs",
    ["react-native-android-widget", androidWidgetConfig],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: {
      projectId: "ed858b4b-2bb8-4359-8fba-e4f7a6ada892",
    },
  },
};

export default config;
