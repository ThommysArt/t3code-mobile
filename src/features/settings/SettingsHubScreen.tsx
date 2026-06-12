import { Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";

import {
  SettingsDivider,
  SettingsNavRow,
  SettingsScreenHeader,
  SettingsScroll,
  SettingsSection,
} from "./SettingsComponents";

export function SettingsHubScreen() {
  const { environments } = useEnvironments();

  return (
    <Screen>
      <SettingsScreenHeader title="Settings" subtitle="Configure T3 Code Mobile" />
      <SettingsScroll>
        <SettingsSection title="General">
          <SettingsNavRow label="General" href="/settings/general" />
        </SettingsSection>

        <SettingsSection title="Configuration">
          <SettingsNavRow
            label="Server"
            value={`${environments.length}`}
            href="/settings/server"
          />
          <SettingsDivider />
          <SettingsNavRow label="Providers" href="/settings/providers" />
          <SettingsDivider />
          <SettingsNavRow label="Archives" href="/settings/archives" />
        </SettingsSection>

        <View className="px-1">
          <Text className="text-sm leading-5 text-muted">
            Server settings sync with your connected T3 environment. Local preferences stay on this
            device.
          </Text>
        </View>
      </SettingsScroll>
    </Screen>
  );
}