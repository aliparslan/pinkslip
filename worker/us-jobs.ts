
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

const NON_US_MARKERS = [
  "alberta", "amsterdam", "apac", "asia", "australia", "bengaluru",
  "berlin", "brazil", "british columbia", "canada", "china", "dublin",
  "emea", "england", "europe", "france", "germany", "india", "ireland",
  "israel", "italy", "japan", "latam", "latin america", "london",
  "melbourne", "mexico", "montreal", "netherlands", "new zealand",
  "ontario", "paris", "poland", "portugal", "quebec", "singapore",
  "spain", "sweden", "switzerland", "sydney", "taiwan", "tokyo",
  "toronto", "united kingdom", "vancouver",
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
  if (!normalized) return false;

  // 1. Strong, unambiguous US signals (country, state abbreviation, state name)
  //    win outright, even alongside another country.
  const hasStrongUsMarker =
    /(?:^|[^a-z])(united states(?: of america)?|u\.s\.a\.?|u\.s\.|usa)(?:$|[^a-z])/i.test(raw)
    || /\bUS\b/.test(raw)
    || US_STATE_ABBREVIATION.test(raw)
    || US_STATE_NAMES.some((state) => includesPhrase(normalized, state));
  if (hasStrongUsMarker) return true;

  // 2. Explicit non-US markers reject BEFORE weaker city matching, so e.g.
  //    "Cambridge, United Kingdom" or "London, Ontario" aren't misread as US
  //    just because they contain a name that's also a US city.
  const explicitlyNonUs = NON_US_MARKERS.some((marker) =>
    includesPhrase(normalized, marker)
  );
  if (explicitlyNonUs) return false;

  // 3. A bare US city name (no country qualifier) is a weaker but accepted signal.
  if (US_CITIES.some((city) => includesPhrase(normalized, city))) return true;

  // 4. Unqualified remote roles are eligible; unknown onsite locations are rejected.
  return /\b(remote|distributed|work from home)\b/.test(normalized);
}
