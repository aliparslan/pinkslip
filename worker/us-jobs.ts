
const US_STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
  "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york",
  "north carolina", "north dakota", "ohio", "oklahoma", "oregon",
  "pennsylvania", "rhode island", "south carolina", "south dakota",
  "tennessee", "texas", "utah", "vermont", "virginia", "washington",
  "west virginia", "wisconsin", "wyoming", "district of columbia",
];

const US_CITIES = [
  "atlanta", "austin", "bellevue", "boston", "boulder", "brooklyn",
  "cambridge", "chandler", "charlotte", "chicago", "dallas", "denver",
  "detroit", "durham", "houston", "irvine", "los angeles", "los gatos",
  "mclean", "menlo park", "miami", "mountain view", "nashville",
  "new york", "nyc", "oakland", "palo alto", "philadelphia", "phoenix",
  "pittsburgh", "portland", "raleigh", "redmond", "redwood city",
  "salt lake city", "san diego", "san francisco", "san jose",
  "santa clara", "santa monica", "seattle", "sunnyvale", "washington dc",
  "washington, dc", "washington, d.c.",
];

const US_STATE_ABBREVIATION =
  /(?:^|,\s*|\(\s*)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)(?:\b|,|\))/;

function includesPhrase(location: string, phrase: string) {
  return new RegExp(`(?:^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^a-z])`)
    .test(location);
}

export function isUsJobLocation(location: string): boolean {
  const raw = location.trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");
  // An omitted location is unknown, not evidence that the role is foreign.
  // Profile-specific metro/work-mode rules still decide whether it belongs in
  // a particular user's feed.
  if (!normalized || /^(?:unknown|unspecified|not specified|n\/?a)$/.test(normalized)) {
    return true;
  }

  // 1. Strong, unambiguous US signals (country, state abbreviation, state name)
  //    win outright, even alongside another country.
  const hasStrongUsMarker =
    /(?:^|[^a-z])(united states(?: of america)?|u\.s\.a\.?|u\.s\.|usa)(?:$|[^a-z])/i.test(raw)
    || /\bUS\b/.test(raw)
    || US_STATE_ABBREVIATION.test(raw)
    || US_STATE_NAMES.some((state) => includesPhrase(normalized, state));
  if (hasStrongUsMarker) return true;

  // 2. A city is only safe as a complete, unqualified location. Positive
  //    matching avoids maintaining an inevitably incomplete list of every
  //    foreign country, region, and city (and rejects "Vietnam, Remote").
  const hasBareUsCity = US_CITIES.some((city) => {
    const escaped = city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^(?:greater\\s+)?${escaped}(?:\\s+(?:area|metro(?:politan)? area|bay area))?$`)
      .test(normalized);
  });
  if (hasBareUsCity) return true;

  // 3. Keep only genuinely unqualified remote labels. Any region or country
  //    attached to "remote" must supply its own explicit US marker above.
  return /^(?:remote|distributed|work from home)$/.test(normalized);
}
