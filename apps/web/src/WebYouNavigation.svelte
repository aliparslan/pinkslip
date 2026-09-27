<script lang="ts">
  import {
    currentRoute,
    navigateFromAnchor,
    routeDefinition,
    routeHref,
  } from "../../../packages/client/src/router";

  const groups = [
    {
      label: "Search",
      destinations: [
        { id: "you-preferences", label: "Job preferences", path: "/you/preferences" },
        { id: "you-alerts", label: "Job alerts", path: "/you/alerts" },
        { id: "you-companies", label: "Companies", path: "/you/companies" },
      ],
    },
    {
      label: "Materials",
      destinations: [
        { id: "you-resume", label: "Resume", path: "/you/resume" },
        { id: "you-tailoring", label: "Tailoring", path: "/you/tailoring" },
      ],
    },
    {
      label: "Pinkslip",
      destinations: [
        { id: "you-feedback", label: "Help and feedback", path: "/you/feedback" },
        { id: "you-account", label: "Account", path: "/you/account" },
      ],
    },
  ] as const;

  let activeId = $derived(routeDefinition($currentRoute).id);
</script>

<nav class="web-you-navigation" aria-label="You settings">
  <a
    class="web-you-navigation__overview"
    class:active={activeId === "you"}
    href={routeHref("/you")}
    aria-current={activeId === "you" ? "page" : undefined}
    onclick={(event) => navigateFromAnchor(event, "/you")}
  >
    You overview
  </a>
  {#each groups as group}
    <div class="web-you-navigation__group">
      <span class="web-you-navigation__label">{group.label}</span>
      {#each group.destinations as destination}
        <a
          href={routeHref(destination.path)}
          class:active={activeId === destination.id}
          aria-current={activeId === destination.id ? "page" : undefined}
          onclick={(event) => navigateFromAnchor(event, destination.path)}
        >{destination.label}</a>
      {/each}
    </div>
  {/each}
</nav>
