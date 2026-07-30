let openCount = 0;
let backgroundState = new Map<HTMLElement, boolean>();

export function registerModalOpen(): () => void {
  openCount += 1;
  if (openCount === 1) {
    const targets = document.querySelectorAll<HTMLElement>(
      ".page-content-root > :not(.modal-backdrop), .root-header-layer, .tab-bar"
    );
    backgroundState = new Map(Array.from(targets, (element) => [element, element.hasAttribute("inert")]));
    for (const element of targets) element.setAttribute("inert", "");
  }

  return () => {
    openCount = Math.max(0, openCount - 1);
    if (openCount > 0) return;
    for (const [element, wasInert] of backgroundState) {
      if (!wasInert) element.removeAttribute("inert");
    }
    backgroundState.clear();
  };
}
