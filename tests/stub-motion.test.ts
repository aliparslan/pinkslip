import { describe, expect, test } from "bun:test";
import { ui } from "../packages/tokens/src/native";
import { fallTime, poseTop, RIP_TICKS, stubPose } from "../apps/native/src/ui/stub-motion";

const WIDTH = 358;
const HEIGHT = 42;
const RELEASE = ui.motion.stub.tear.duration / 1000;
const GRAVITY = ui.motion.stub.fall.gravity;

describe("the torn stub's path", () => {
  test("starts exactly where the stub sat", () => {
    const pose = stubPose(0, WIDTH, HEIGHT);
    expect(pose.x).toBeCloseTo(0, 6);
    expect(pose.y).toBeCloseTo(0, 6);
    expect(pose.angle).toBeCloseTo(0, 6);
    expect(pose.scale).toBe(1);
  });

  test("tears from its left end: the hinge on the right stays put", () => {
    const pose = stubPose(RELEASE, WIDTH, HEIGHT);
    // The top-right corner, turned round itself, doesn't move.
    const corner = { x: WIDTH / 2, y: -HEIGHT / 2 };
    const a = (pose.angle * Math.PI) / 180;
    const x = pose.x + corner.x * Math.cos(a) - corner.y * Math.sin(a);
    const y = pose.y + corner.x * Math.sin(a) + corner.y * Math.cos(a);
    expect(x).toBeCloseTo(corner.x, 6);
    expect(y).toBeCloseTo(corner.y, 6);
    expect(pose.angle).toBeCloseTo(ui.motion.stub.tear.angle, 6);
  });

  test("doesn't jump or stall where the tear hands over to the fall", () => {
    const step = 0.001;
    const before = stubPose(RELEASE - step, WIDTH, HEIGHT);
    const atRelease = stubPose(RELEASE, WIDTH, HEIGHT);
    const after = stubPose(RELEASE + step, WIDTH, HEIGHT);
    expect(Math.abs(after.y - atRelease.y)).toBeLessThan(0.5);
    expect(Math.abs(after.angle - atRelease.angle)).toBeLessThan(0.5);
    // The fall starts at the tear's own speed and spin (within 5%).
    const speedIn = (atRelease.y - before.y) / step;
    const speedOut = (after.y - atRelease.y) / step;
    expect(Math.abs(speedOut - speedIn)).toBeLessThan(Math.abs(speedIn) * 0.05 + GRAVITY * step);
    const spinIn = (atRelease.angle - before.angle) / step;
    const spinOut = (after.angle - atRelease.angle) / step;
    expect(Math.abs(spinOut - spinIn)).toBeLessThan(Math.abs(spinIn) * 0.05);
  });

  test("falls until the whole piece is behind the bar, further taking longer", () => {
    const short = fallTime(200, WIDTH, HEIGHT);
    const long = fallTime(500, WIDTH, HEIGHT);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeLessThan(0.8);
    expect(poseTop(stubPose(long, WIDTH, HEIGHT), WIDTH, HEIGHT)).toBeGreaterThanOrEqual(500);
  });

  test("rips with taps that close up along the tear and stop when it's free", () => {
    expect(RIP_TICKS).toHaveLength(ui.motion.stub.rip.ticks);
    expect(RIP_TICKS[0]).toBe(0);
    expect(RIP_TICKS.at(-1)!).toBeCloseTo(RELEASE, 9);
    const gaps = RIP_TICKS.slice(1).map((at, i) => at - RIP_TICKS[i]!);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeLessThan(gaps[i - 1]!);
  });
});
