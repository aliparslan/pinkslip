const openModalRoots = new Set<HTMLElement>();
let backgroundState = new Map<HTMLElement, boolean>();

function restoreBackgroundState() {
  for (const [element, wasInert] of backgroundState) {
    if (!wasInert) element.removeAttribute("inert");
  }
  backgroundState.clear();
}

function syncBackgroundState() {
  restoreBackgroundState();
  if (openModalRoots.size === 0) return;

  const targets = new Set<HTMLElement>();
  for (const modalRoot of openModalRoots) {
    let branch: HTMLElement = modalRoot;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      for (const sibling of parent.children) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
        const containsOpenModal = Array.from(openModalRoots).some((root) => sibling.contains(root));
        if (!containsOpenModal) targets.add(sibling);
      }
      if (parent.id === "app") break;
      branch = parent;
    }
  }

  backgroundState = new Map(Array.from(targets, (element) => [element, element.hasAttribute("inert")]));
  for (const element of targets) element.setAttribute("inert", "");
}

export function registerModalOpen(modalRoot: HTMLElement): () => void {
  openModalRoots.add(modalRoot);
  syncBackgroundState();

  return () => {
    openModalRoots.delete(modalRoot);
    syncBackgroundState();
  };
}
