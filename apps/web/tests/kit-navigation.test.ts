import { describe, expect, test } from "bun:test";
import { createKitNavigationAdapter } from "../src/lib/kit-navigation";
import type { NavigationChange, NavigationLocation } from "../../../packages/client/src/router";

function harness() {
  let location: NavigationLocation = { route: "/", state: {} };
  const requests: Array<{ route: string; options: unknown }> = [];
  const changes: NavigationChange[] = [];
  const navigation = createKitNavigationAdapter({
    current: () => location,
    async goto(route, options) { requests.push({ route, options }); },
    replaceState(_route, state) { location = { ...location, state }; },
    back() {},
    onError(error) { throw error; },
  });
  navigation.adapter.subscribe((change) => changes.push(change));
  return { navigation, requests, changes, arrive(route: string, type: "push" | "pop" = "push") {
    location = { route, state: location.state };
    navigation.didNavigate(type);
  } };
}

describe("SvelteKit navigation bridge", () => {
  test("waits for Kit to commit a route and retains replacement semantics", () => {
    const { navigation, requests, changes, arrive } = harness();
    navigation.adapter.replace("/profile", { origin: "test" });
    expect(requests).toEqual([{ route: "/you", options: {
      replace: true, reset: false, state: { origin: "test" },
    } }]);
    expect(changes).toHaveLength(0);
    arrive("/you");
    expect(changes[0]?.type).toBe("replace");
  });

  test("does not announce shallow history state updates as route changes", () => {
    const { navigation, changes, arrive } = harness();
    navigation.adapter.updateState({ "pinkslip:navigation": { scrollTop: 180 } });
    arrive("/");
    expect(changes).toHaveLength(0);
    expect(navigation.adapter.current().state).toEqual({ "pinkslip:navigation": { scrollTop: 180 } });
  });

  test("observes Kit link navigation and browser history traversal", () => {
    const { navigation, changes, arrive } = harness();
    arrive("/library/saved");
    navigation.adapter.push("/jobs/one?from=library-saved", {});
    arrive("/jobs/one?from=library-saved");
    arrive("/library/saved", "pop");
    expect(changes.map(({ type }) => type)).toEqual(["push", "push", "pop"]);
  });
});
