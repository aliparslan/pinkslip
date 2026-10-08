import { View } from "react-native";
import { Button } from "./controls";
import { Txt } from "./primitives";

/** A list with nothing in it: what happened, and the one thing to do. */
export function Empty({ title, body, action, onAction }: { title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 32, paddingVertical: 56 }}>
      <View style={{ gap: 4, alignItems: "center" }}>
        <Txt weight="medium">{title}</Txt>
        <Txt variant="meta" color="ink3" style={{ textAlign: "center" }}>
          {body}
        </Txt>
      </View>
      {action ? (
        <Button size="sm" onPress={onAction}>
          {action}
        </Button>
      ) : null}
    </View>
  );
}
