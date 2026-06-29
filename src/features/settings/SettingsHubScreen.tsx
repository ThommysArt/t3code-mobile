import { Text, View } from "react-native";

import { BlurScreenRoot } from "@/components/chrome";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { getAppVersionLabel } from "@/utils/appVersion";

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
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot header={<SettingsScreenHeader title="Settings" subtitle="Configure T3 Code Mobile" />}>
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

        <View className="px-1 gap-2">
          <Text className="text-xs leading-5 text-muted">
            Server settings sync with your connected T3 environment. Local preferences stay on this
            device.
          </Text>
          <Text className="text-xs leading-5 text-muted">
            {getAppVersionLabel()} · com.t3tools.t3code.mobile
          </Text>
        </View>
      </SettingsScroll>
      </BlurScreenRoot>
    </Screen>
  );
}