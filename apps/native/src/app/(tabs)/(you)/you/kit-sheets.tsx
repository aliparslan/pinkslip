import { Redirect } from "expo-router";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { SheetLab } from "../../../../features/kit/SheetLab";

export default function SheetLabScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <SheetLab />;
}
