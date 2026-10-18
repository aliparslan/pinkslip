import { describe, expect, test } from "bun:test";
import { fallTime, poseTop, stubPose, TEAR_SHAPES, TEAR_STYLES } from "../apps/native/src/ui/stub-motion";

const WIDTH = 358;
const HEIGHT = 42;
const GRAVITY = 5200;
const styles = TEAR_STYLES.map((style) => style.value);

describe("the torn stub's path", () => {
  test("starts exactly where the stub sat", () => {
    for (const style of styles) {
      const pose = stubPose(style, 0, WIDTH, HEIGHT, GRAVITY);
      expect(pose.x).toBeCloseTo(0, 6);
      expect(pose.y).toBeCloseTo(0, 6);
      expect(pose.angle).toBeCloseTo(0, 6);
      expect(pose.scale).toBe(1);
    }
  });

  test("doesn't jump or stall where the tear hands over to the fall", () => {
    const step = 0.001;
    for (const style of styles) {
      const at = TEAR_SHAPES[style].release;
      const before = stubPose(style, at - step, WIDTH, HEIGHT, GRAVITY);
      const atRelease = stubPose(style, at, WIDTH, HEIGHT, GRAVITY);
      const after = stubPose(style, at + step, WIDTH, HEIGHT, GRAVITY);
      // Position: a millisecond either side moves less than half a point.
      expect(Math.abs(after.y - atRelease.y)).toBeLessThan(0.5);
      expect(Math.abs(after.angle - atRelease.angle)).toBeLessThan(0.5);
      // Speed: the fall starts at the tear's own speed (within 5%, or a
      // point a second when it's at rest).
      const speedIn = (atRelease.y - before.y) / step;
      const speedOut = (after.y - atRelease.y) / step;
      expect(Math.abs(speedOut - speedIn)).toBeLessThan(Math.max(Math.abs(speedIn) * 0.05, 1) + GRAVITY * step);
      const spinIn = (atRelease.angle - before.angle) / step;
      const spinOut = (after.angle - atRelease.angle) / step;
      expect(Math.abs(spinOut - spinIn)).toBeLessThan(Math.max(Math.abs(spinIn) * 0.05, 1));
    }
  });

  test("falls until the whole piece is behind the bar, further taking longer", () => {
    for (const style of styles) {
      const short = fallTime(style, 200, WIDTH, HEIGHT, GRAVITY);
      const long = fallTime(style, 500, WIDTH, HEIGHT, GRAVITY);
      expect(long).toBeGreaterThan(short);
      expect(long).toBeLessThan(1.2);
      const end = stubPose(style, long, WIDTH, HEIGHT, GRAVITY);
      expect(poseTop(end, WIDTH, HEIGHT)).toBeGreaterThanOrEqual(500);
    }
  });

  test("rips with ticks that only fall within the tear", () => {
    for (const style of styles) {
      const { ticks, release } = TEAR_SHAPES[style];
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)!).toBeLessThanOrEqual(release + 1e-9);
      expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
    }
  });
});
