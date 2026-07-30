let lastDismissAt = 0;

export function markMenuDismissed() {
  lastDismissAt = Date.now();
}

export function wasMenuJustDismissed(): boolean {
  return Date.now() - lastDismissAt < 300;
}
