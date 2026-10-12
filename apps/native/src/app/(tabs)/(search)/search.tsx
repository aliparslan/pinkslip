import { Redirect } from "expo-router";
import { useRedesign } from "../../../features/redesign/flag";
import { SearchScreen } from "../../../features/redesign/SearchScreen";

export default function SearchTab() {
  if (!useRedesign()) return <Redirect href="/" />;
  return <SearchScreen />;
}
