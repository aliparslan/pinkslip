// Unistyles must be configured before any StyleSheet.create runs, so it loads
// ahead of the router entry.
import "./src/theme/unistyles";
import "expo-router/entry";
