import { Redirect, router, Stack } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WhatPinkslipSent } from "../../../../features/redesign/apply-flow/WhileItRuns";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { IconButton, useTabBarSpace } from "../../../../ui";

/** What Pinkslip sent (W3) on a sample. */
export default function SentSampleScreen() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: tabSpace, gap: 8 }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ paddingHorizontal: 16, height: 44, justifyContent: "center" }}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <WhatPinkslipSent company="Stripe" title="Backend Engineer, New Grad" total={12}
      proof={[{ label: "Stripe's email confirmed it", when: "9:58 AM" }, { label: "Thank-you page", when: "9:52 AM" }, { label: "Sent by Pinkslip", when: "Oct 14, 9:52 AM" }]}
      answers={[
        { question: "Why do you want to work at Stripe?", answer: "I've wanted to build payments infrastructure since my first side project took its first dollar." },
        { question: "Are you authorized to work in the US?", answer: "Yes" },
      ]} />
  </ScrollView>;
}
