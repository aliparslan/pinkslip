import { ListGroup, ListItem } from "../../ui";
import { MOTION_TRIALS, setMotionTrial, useMotionTrial, type MotionTrial } from "../../ui/motion-trial";

/** Dev-only: each Nov 8 motion fix on or off (docs/motion-fixes-2026-11-08.md). */
export function MotionTrialList() {
  return <ListGroup footer="On is the Nov 8 proposal, off is what the app did before. Kept on this phone. Reduce Motion keeps them still.">
    {MOTION_TRIALS.map((trial) => <TrialRow key={trial.id} {...trial} />)}
  </ListGroup>;
}

function TrialRow({ id, title, today, proposed }: { id: MotionTrial; title: string; today: string; proposed: string }) {
  const on = useMotionTrial(id);
  return <ListItem title={title} detail={on ? proposed : today} accessory="switch" selected={on} onToggle={(next) => setMotionTrial(id, next)} />;
}
