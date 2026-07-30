let openCount = $state(0);

export const modalStack = {
  get open() {
    return openCount > 0;
  },
};

export function registerModalOpen(): () => void {
  openCount += 1;
  return () => {
    openCount -= 1;
  };
}
