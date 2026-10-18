import { ui } from "@pinkslip/tokens/native";

/**
 * The torn stub's path, as one function of time (tokens `motion.stub`;
 * owner, 2026-10-18: Peel, picked from four ways on the phone). It tears
 * from its left end round a hinge at its top right, the hinge giving faster
 * as fewer holes hold, then falls carrying on at the speed and spin it tore
 * with, so nothing stops or jumps where the two meet. A pose is the piece's
 * centre offset in points and its angle in degrees (positive turns
 * clockwise, as RN's rotate).
 */
export interface StubPose {
  x: number;
  y: number;
  angle: number;
  scale: number;
}

const { tear, fall, rip } = ui.motion.stub;
/** When the stub comes free, in seconds. */
const RELEASE = tear.duration / 1000;
const SPIN_DECAY = fall.spinDecay / 1000;
const DRIFT = fall.drift / 1000;
const SHRINK_TIME = fall.shrinkTime / 1000;
const RAD = Math.PI / 180;

/** The rip's taps, in seconds from the start: closer and closer together,
 * as a tear speeds up along the holes. */
export const RIP_TICKS = Array.from({ length: rip.ticks }, (_, i) => RELEASE * Math.sqrt(i / (rip.ticks - 1)));

/** Where the centre goes when the piece turns round its top-right corner. */
function hinge(angle: number, width: number, height: number) {
  "worklet";
  const dx = -width / 2;
  const dy = height / 2;
  const c = Math.cos(angle * RAD);
  const s = Math.sin(angle * RAD);
  return { x: dx * c - dy * s - dx, y: dx * s + dy * c - dy };
}

/** The pose `time` seconds into the tear. */
export function stubPose(time: number, width: number, height: number): StubPose {
  "worklet";
  const p = Math.min(Math.max(time, 0), RELEASE) / RELEASE;
  // Ease-in: the hinge gives faster as fewer holes hold.
  const angle = tear.angle * p * p;
  const turned = hinge(angle, width, height);
  if (time <= RELEASE) return { x: turned.x, y: turned.y, angle, scale: 1 };

  // Free: it carries on at the speed and spin it tore with.
  const s = time - RELEASE;
  const spin = (2 * tear.angle) / RELEASE;
  const c = Math.cos(tear.angle * RAD);
  const sn = Math.sin(tear.angle * RAD);
  const dx = -width / 2;
  const dy = height / 2;
  const vx = spin * RAD * (-dx * sn - dy * c);
  const vy = spin * RAD * (dx * c - dy * sn);
  return {
    x: turned.x + vx * DRIFT * (1 - Math.exp(-s / DRIFT)),
    y: turned.y + vy * s + 0.5 * fall.gravity * s * s,
    angle: tear.angle + spin * SPIN_DECAY * (1 - Math.exp(-s / SPIN_DECAY)),
    scale: 1 - fall.shrink * Math.min(s / SHRINK_TIME, 1),
  };
}

/** How far down the piece's highest corner is, from where its top sat. */
export function poseTop(pose: StubPose, width: number, height: number): number {
  "worklet";
  const c = Math.abs(Math.cos(pose.angle * RAD));
  const s = Math.abs(Math.sin(pose.angle * RAD));
  return height / 2 + pose.y - pose.scale * (height / 2 * c + width / 2 * s);
}

/** How long until the whole piece is `drop` points down (behind the bar), in seconds. */
export function fallTime(drop: number, width: number, height: number): number {
  for (let time = 0; time < 3; time += 0.004) {
    if (poseTop(stubPose(time, width, height), width, height) >= drop) return time;
  }
  return 3;
}
