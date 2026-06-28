import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "T3 Code Mobile",
  slug: "t3-code-mobile",
  owner: "thommysart24",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "t3code-mobile",
  userInterfaceStyle: "automatic",
  platforms: ["ios", "android", "web"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.t3tools.t3code.mobile",
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
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#09090b",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
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
