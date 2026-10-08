import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { Icon, Txt } from "../../../components/primitives";
import { useJob, useYourPlaces } from "../../../lib/data";
import { bandFor, isMine, jobPayBands, placesOf } from "../../../lib/places";
import { usePalette } from "../../../theme";

/* Every place a posting lists, each with its pay when pay depends on place.
   Your cities come first, checked. */
export default function PlacesSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const job = useJob(id).data;
  const yours = useYourPlaces();
  if (!job) return null;
  const places = placesOf(job, yours);
  const bands = jobPayBands(job.salary);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 28, gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Txt variant="title" weight="semibold">
          {places.length} places
        </Txt>
        <Txt color="ink2">{bands.length > 1 ? "Pay depends on where you work. Your cities are first." : "Your cities are first."}</Txt>
      </View>
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.bg, overflow: "hidden" }}>
        {places.map((place, index) => {
          const band = bandFor(place, bands);
          const mine = isMine(place, yours);
          return (
            <View
              key={place}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: index ? 1 : 0,
                borderTopColor: palette.line,
              }}
            >
              <Txt color={mine ? "ink" : "ink2"} numberOfLines={1} style={{ flex: 1 }}>
                {place}
              </Txt>
              {mine ? <Icon name="checkmark" size={13} weight="bold" color={palette.good} fallback="✓" /> : null}
              {bands.length ? (
                <Txt color={band ? "ink" : "ink3"} tabular>
                  {band ? band.amount : "Not listed"}
                </Txt>
              ) : null}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
