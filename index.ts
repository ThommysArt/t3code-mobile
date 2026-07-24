import "expo-router/entry";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import { widgetTaskHandler } from "./src/features/widget/widgetTaskHandler";

registerWidgetTaskHandler(widgetTaskHandler);
