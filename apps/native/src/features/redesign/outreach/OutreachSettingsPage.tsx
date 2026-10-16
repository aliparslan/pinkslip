import { useSession } from "@pinkslip/data";
import { Alert } from "react-native";
import { ListGroup, ListItem, Text } from "../../../ui";
import { YouPage } from "../you/Page";
import { setFollowUps, setSignature, useOutreachPrefs } from "./outreach-prefs";

/**
 * Outreach (owner, 2026-10-15, Paper O9): where emails go out from (your
 * mail app until Gmail or Outlook connects) and your signature; then what
 * happens after you send one. Sending them for you is Pro, so it shows
 * "Pro" in place of its radio.
 */
export function OutreachSettingsPage() {
  const name = useSession().data?.me?.user?.name ?? "";
  const prefs = useOutreachPrefs();
  const signature = prefs.signature || name;
  const editSignature = () => Alert.prompt("Signature", "Under every email you write.", (value) => setSignature(value ?? ""), "plain-text", signature);
  return <YouPage title="Outreach">
    <ListGroup surface="fill">
      <ListItem title="Send from" value="Your mail app" />
      <ListItem title="Signature" value={signature || "Add"} accessory="chevron" onPress={editSignature} />
    </ListGroup>
    <ListGroup surface="fill" header="Follow-ups">
      <ListItem title="Remind me" accessory="radio" selected={prefs.followUps === "remind"} onPress={() => setFollowUps("remind")} />
      {/* A Pro-only choice shows "Pro" where its radio would be (owner, 2026-10-15). */}
      <ListItem title="Send them for me" trailing={<Text tone="ink-3">Pro</Text>} />
      <ListItem title="Off" accessory="radio" selected={prefs.followUps === "off"} onPress={() => setFollowUps("off")} />
    </ListGroup>
  </YouPage>;
}
