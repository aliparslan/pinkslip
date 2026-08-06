import type { Component } from "svelte";
import { mount } from "svelte";
import "./app.css";

export async function mountApp(App: Component): Promise<ReturnType<typeof mount>> {
  // The pixel face is tiny and packaged locally on iOS. Waiting for it avoids a
  // WebKit fallback that did not reliably swap after the root title mounted.
  await document.fonts?.load('400 40px "Geist Pixel"', "Jobs pinkslip").catch(() => undefined);
  return mount(App, { target: document.getElementById("app")! });
}
