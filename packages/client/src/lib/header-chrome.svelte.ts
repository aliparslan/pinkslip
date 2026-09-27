export interface HeaderSearchRegistration {
  id: string;
  placeholder: string;
  value: () => string;
  onInput: (value: string) => void;
  onSubmit?: (value: string) => void;
}

export interface RootTitleRegistration {
  id: string;
  value: () => string;
}

class HeaderChromeState {
  searches = $state<HeaderSearchRegistration[]>([]);
  rootTitle = $state<RootTitleRegistration | null>(null);

  searchFor(ownerId: string | undefined): HeaderSearchRegistration | null {
    if (!ownerId) return null;
    return this.searches.find((registration) => registration.id === ownerId) ?? null;
  }

  registerSearch(registration: HeaderSearchRegistration): () => void {
    this.searches = [
      ...this.searches.filter((candidate) => candidate.id !== registration.id),
      registration,
    ];
    return () => {
      if (this.searchFor(registration.id) !== registration) return;
      this.searches = this.searches.filter((candidate) => candidate !== registration);
    };
  }

  registerRootTitle(registration: RootTitleRegistration): () => void {
    this.rootTitle = registration;
    return () => {
      if (this.rootTitle === registration) this.rootTitle = null;
    };
  }
}

export const headerChrome = new HeaderChromeState();
