import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { Button, Chip } from "../../components/controls";
import { Txt } from "../../components/primitives";
import { locationChoices, setFilters, useFilters } from "../../lib/filters";

/* Narrow the feed to some places. With none picked, the feed follows the
   places in your search profile. */
export default function LocationSheet() {
  const filters = useFilters();
  const toggle = (id: string) =>
    setFilters({
      locations: filters.locations.includes(id) ? filters.locations.filter((value) => value !== id) : [...filters.locations, id],
    });
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="title" weight="semibold">
          Location
        </Txt>
        <Txt color="ink2">Pick none to follow the places in your search profile.</Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {locationChoices.map((choice) => (
          <Chip
            key={choice.id}
            size="md"
            label={choice.label}
            pressed={filters.locations.includes(choice.id)}
            onPress={() => toggle(choice.id)}
          />
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <Button size="lg" style={{ flex: 1 }} onPress={() => setFilters({ locations: [] })} disabled={!filters.locations.length}>
          Reset
        </Button>
        <Button variant="primary" size="lg" style={{ flex: 1 }} onPress={() => router.back()}>
          Done
        </Button>
      </View>
    </ScrollView>
  );
}
