/**
 * The torn stub's path, as one function of time (owner, 2026-10-18: the
 * first cut stalled where the tear handed over to the fall). Each way tears
 * first, then falls carrying on at the tear's own speed and spin, so nothing
 * stops or jumps where the two meet. A pose is the piece's centre offset in
 * points and its angle in degrees (positive turns clockwise, as RN's rotate).
 *
 * - Peel: tears from its left end round a hinge at the top right, then
 *   falls, still turning a little.
 * - Snap: the perforation holds for a moment as the stub is pulled, then it
 *   pops free and drops straight.
 * - Flutter: peels, then falls like paper, swaying and rocking as the air
 *   slows it.
 * - Swing: the left end swings right down on the last hole, then lets go.
 */
export type TearStyle = "peel" | "snap" | "flutter" | "swing";

export const TEAR_STYLES: { value: TearStyle; label: string }[] = [
  { value: "peel", label: "Peel" },
  { value: "snap", label: "Snap" },
  { value: "flutter", label: "Flutter" },
  { value: "swing", label: "Swing" },
];

export interface StubPose {
  x: number;
  y: number;
  angle: number;
  scale: number;
}

interface TearShape {
  /** When the stub comes free, in seconds. */
  release: number;
  /** The tear's angle at release (0 tears level). */
  angle: number;
  /** How far the perforation stretches before it lets go (Snap). */
  stretch: number;
  /** How quickly the spin it tore with dies away, in seconds. */
  spinDecay: number;
  /** Air: the fastest it falls, in points a second (0 is no air). */
  terminal: number;
  /** The sway as it falls: points across, degrees of rock (Flutter). */
  sway: number;
  rock: number;
  /** The rip's ticks, in seconds from the start, and a firmer pop as the
   * last hole gives. */
  ticks: number[];
  pop: boolean;
}

/** Ticks closer and closer together, as a tear speeds up along the holes. */
function speedingUp(count: number, over: number): number[] {
  return Array.from({ length: count }, (_, i) => over * Math.sqrt(i / (count - 1)));
}

export const TEAR_SHAPES: Record<TearStyle, TearShape> = {
  peel: { release: 0.16, angle: -4, stretch: 0, spinDecay: 0.1, terminal: 0, sway: 0, rock: 0, ticks: speedingUp(9, 0.16), pop: false },
  snap: {
    release: 0.11, angle: 0, stretch: 3, spinDecay: 0.1, terminal: 0, sway: 0, rock: 0,
    ticks: [0, 0.02, 0.04, 0.06, 0.08, 0.1], pop: true,
  },
  flutter: { release: 0.16, angle: -4, stretch: 0, spinDecay: 0.1, terminal: 1500, sway: 9, rock: 5, ticks: speedingUp(9, 0.16), pop: false },
  swing: { release: 0.24, angle: -20, stretch: 0, spinDecay: 0.06, terminal: 0, sway: 0, rock: 0, ticks: speedingUp(12, 0.24), pop: true },
};

const RAD = Math.PI / 180;
/** How far it shrinks as it falls away from you, and how soon. */
const SHRINK = 0.04;
const SHRINK_TIME = 0.35;
const SWAY_HZ = 1.5;

/** Where the centre goes when the piece turns round its top-right corner. */
function hinge(angle: number, width: number, height: number) {
  "worklet";
  const dx = -width / 2;
  const dy = height / 2;
  const c = Math.cos(angle * RAD);
  const s = Math.sin(angle * RAD);
  return { x: dx * c - dy * s - dx, y: dx * s + dy * c - dy };
}

/** The pose `time` seconds into the tear, falling under `gravity`. */
export function stubPose(style: TearStyle, time: number, width: number, height: number, gravity: number): StubPose {
  "worklet";
  const shape = TEAR_SHAPES[style];
  const { release } = shape;
  const tearing = Math.min(Math.max(time, 0), release);
  const p = tearing / release;
  // The tear: the hinge gives faster as fewer holes hold (ease-in), or the
  // perforation stretches and holds (ease-out to a stop) before it pops.
  const angle = shape.angle * p * p;
  const stretch = shape.stretch * (1 - (1 - p) * (1 - p));
  const turned = hinge(angle, width, height);
  if (time <= release) return { x: turned.x, y: turned.y + stretch, angle, scale: 1 };

  // Free: it carries on at the speed and spin it tore with.
  const s = time - release;
  const spin = (2 * shape.angle) / release;
  const c = Math.cos(shape.angle * RAD);
  const sn = Math.sin(shape.angle * RAD);
  const dx = -width / 2;
  const dy = height / 2;
  const vx = spin * RAD * (-dx * sn - dy * c);
  const vy = spin * RAD * (dx * c - dy * sn);
  const drift = 0.15;
  let x = turned.x + vx * drift * (1 - Math.exp(-s / drift));
  let y: number;
  if (shape.terminal > 0) {
    // Air: it speeds up towards the fastest paper falls, then holds there.
    const lag = shape.terminal / gravity;
    y = turned.y + stretch + shape.terminal * s + (vy - shape.terminal) * lag * (1 - Math.exp(-s / lag));
  } else {
    y = turned.y + stretch + vy * s + 0.5 * gravity * s * s;
  }
  let a = shape.angle + spin * shape.spinDecay * (1 - Math.exp(-s / shape.spinDecay));
  if (shape.sway > 0) {
    // The sway grows in from nothing, so the fall starts where the tear left it.
    const grow = 1 - Math.exp(-s / 0.06);
    const wave = Math.sin(2 * Math.PI * SWAY_HZ * s) * grow;
    x += shape.sway * wave;
    a += shape.rock * wave;
  }
  return { x, y, angle: a, scale: 1 - SHRINK * Math.min(s / SHRINK_TIME, 1) };
}

/** How high the piece's highest corner is, from where its top sat. */
export function poseTop(pose: StubPose, width: number, height: number): number {
  "worklet";
  const c = Math.abs(Math.cos(pose.angle * RAD));
  const s = Math.abs(Math.sin(pose.angle * RAD));
  return height / 2 + pose.y - pose.scale * (height / 2 * c + width / 2 * s);
}

/** How long until the whole piece is `drop` points down (behind the bar). */
export function fallTime(style: TearStyle, drop: number, width: number, height: number, gravity: number): number {
  for (let time = 0; time < 3; time += 0.004) {
    if (poseTop(stubPose(style, time, width, height, gravity), width, height) >= drop) return time;
  }
  return 3;
}
