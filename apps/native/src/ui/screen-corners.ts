import { Dimensions } from "react-native";

/** The radius of the iPhone screen's own corners, in points, by screen size
 * (portrait width × height). iOS keeps this private, so it's looked up: the
 * values Apple's hardware uses. Sizes shared by models with different corners
 * take the smaller. */
const RADII: Record<string, number> = {
  "375x812": 39, // X, XS, 11 Pro, 12 mini and 13 mini (44)
  "414x896": 39, // XR and 11 (41.5), XS Max and 11 Pro Max
  "390x844": 47.33, // 12, 12 Pro, 13, 13 Pro, 14
  "428x926": 53.33, // 12 Pro Max, 13 Pro Max, 14 Plus
  "393x852": 55, // 14 Pro, 15, 15 Pro, 16
  "430x932": 55, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  "402x874": 62, // 16 Pro, 17, 17 Pro
  "440x956": 62, // 16 Pro Max, 17 Pro Max
  "420x912": 62, // Air
};

/** 0 for square-cornered screens (Home-button iPhones) and sizes we don't know. */
export function screenCornerRadius(): number {
  const { width, height } = Dimensions.get("screen");
  return RADII[`${Math.round(Math.min(width, height))}x${Math.round(Math.max(width, height))}`] ?? 0;
}

/** A radius for something `inset` points in from the screen's corner that
 * runs parallel to it, and never tighter than `least`. */
export function concentricRadius(inset: number, least: number): number {
  return Math.max(least, screenCornerRadius() - inset);
}
