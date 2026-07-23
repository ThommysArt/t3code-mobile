import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { BlurScreenRoot } from "@/components/chrome";
import { Screen } from "@/components/Screen";
import { usePreferences } from "@/runtime/PreferencesProvider";

import {
  SettingsDivider,
  SettingsRow,
  SettingsScreenHeader,
  SettingsScroll,
  SettingsSection,
  SettingsSwitch,
} from "./SettingsComponents";

const AUTO_SETTLE_MIN_DAYS = 1;
const AUTO_SETTLE_MAX_DAYS = 90;
const AUTO_SETTLE_DEFAULT_DAYS = 3;

export function BetaSettingsScreen() {
  const { preferences, updatePreferences } = usePreferences();
  const [autoSettleDraft, setAutoSettleDraft] = useState(
    String(preferences.autoSettleAfterDays ?? AUTO_SETTLE_DEFAULT_DAYS)
  );

  const autoSettleEnabled = preferences.autoSettleAfterDays !== null;

  return (
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        header={
          <SettingsScreenHeader title="Beta" subtitle="Optional experimental features" />
        }
      >
        <SettingsScroll>
          <SettingsSection title="Beta features">
            <SettingsRow
              title="Thread List v2"
              description="One flat thread list in creation order. Active work renders as cards; settled threads collapse to a slim history tail. Settling requires an up-to-date server — on older servers threads simply stay active."
              layout="stacked"
              control={
                <SettingsSwitch
                  value={preferences.threadListV2Enabled}
                  onValueChange={(checked) =>
                    void updatePreferences({ threadListV2Enabled: checked })
                  }
                />
              }
            />
            {preferences.threadListV2Enabled ? (
              <>
                <SettingsDivider />
                <SettingsRow
                  title="Auto-settle inactive threads"
                  description="Threads with no activity for this long settle automatically. Merged or closed PRs also settle when PR status is available."
                  layout="stacked"
                  control={
                    <SettingsSwitch
                      value={autoSettleEnabled}
                      onValueChange={(checked) => {
                        void updatePreferences({
                          autoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                        });
                        if (checked) setAutoSettleDraft(String(AUTO_SETTLE_DEFAULT_DAYS));
                      }}
                    />
                  }
                />
                {autoSettleEnabled ? (
                  <>
                    <SettingsDivider />
                    <SettingsRow
                      title="Days of inactivity before auto-settle"
                      description="Any real activity un-settles a thread automatically on a supporting server."
                      layout="stacked"
                      control={
                        <View className="w-full gap-3 pt-1">
                          <View className="flex-row items-center gap-2">
                            <TextInput
                              keyboardType="number-pad"
                              value={autoSettleDraft}
                              onChangeText={(value) => {
                                setAutoSettleDraft(value);
                                const parsed = Number(value);
                                if (
                                  Number.isInteger(parsed) &&
                                  parsed >= AUTO_SETTLE_MIN_DAYS &&
                                  parsed <= AUTO_SETTLE_MAX_DAYS
                                ) {
                                  void updatePreferences({ autoSettleAfterDays: parsed });
                                }
                              }}
                              onBlur={() => {
                                setAutoSettleDraft(
                                  String(
                                    preferences.autoSettleAfterDays ?? AUTO_SETTLE_DEFAULT_DAYS
                                  )
                                );
                              }}
                              className="min-w-[72px] rounded-xl border border-border bg-default px-3 py-2 text-center text-sm text-foreground"
                              accessibilityLabel="Days of inactivity before auto-settle"
                            />
                            <Text className="text-sm text-muted">days</Text>
                          </View>
                          <View className="flex-row flex-wrap gap-2">
                            {[1, 3, 7, 14, 30].map((days) => (
                              <Pressable
                                key={days}
                                onPress={() => {
                                  setAutoSettleDraft(String(days));
                                  void updatePreferences({ autoSettleAfterDays: days });
                                }}
                                className={`rounded-full px-3 py-1.5 ${
                                  preferences.autoSettleAfterDays === days
                                    ? "bg-accent"
                                    : "bg-default"
                                }`}
                              >
                                <Text
                                  className={`text-xs font-semibold ${
                                    preferences.autoSettleAfterDays === days
                                      ? "text-accent-foreground"
                                      : "text-foreground"
                                  }`}
                                >
                                  {days}d
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      }
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </SettingsSection>

          <Text className="px-1 text-xs leading-5 text-muted">
            Beta features are opt-in and default off. Turn Thread List v2 off any time to restore
            the classic project-grouped home list.
          </Text>
        </SettingsScroll>
      </BlurScreenRoot>
    </Screen>
  );
}
