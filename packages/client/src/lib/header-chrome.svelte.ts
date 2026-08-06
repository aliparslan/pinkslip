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
  search = $state<HeaderSearchRegistration | null>(null);
  rootTitle = $state<RootTitleRegistration | null>(null);

  registerSearch(registration: HeaderSearchRegistration): () => void {
    this.search = registration;
    return () => {
      if (this.search === registration) this.search = null;
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
