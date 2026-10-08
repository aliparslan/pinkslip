import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { Chip } from "../../components/controls";
import { Txt } from "../../components/primitives";
import { payChoices, setFilters, useFilters } from "../../lib/filters";

/* A pay floor. Picking one closes the sheet. */
export default function PaySheet() {
  const filters = useFilters();
  const pick = (minPayK: number | null) => {
    setFilters({ minPayK });
    router.back();
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="title" weight="semibold">
          Minimum pay
        </Txt>
        <Txt color="ink2">Jobs that don't list pay are left out while this is set.</Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Chip size="md" label="Any pay" pressed={filters.minPayK === null} onPress={() => pick(null)} />
        {payChoices.map((value) => (
          <Chip key={value} size="md" label={`$${value}K+`} pressed={filters.minPayK === value} onPress={() => pick(value)} />
        ))}
      </View>
    </ScrollView>
  );
}
