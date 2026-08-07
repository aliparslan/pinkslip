import type { Component } from "svelte";
import { mount } from "svelte";

export async function mountApp(App: Component): Promise<ReturnType<typeof mount>> {
  return mount(App, { target: document.getElementById("app")! });
}
