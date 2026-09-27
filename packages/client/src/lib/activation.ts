/** Tracks false-to-true activation edges for retained UI trees. */
export class ActivationEdge {
  private observed = false;
  private previous = false;

  becameActive(active: boolean): boolean {
    if (!this.observed) {
      this.observed = true;
      this.previous = active;
      return false;
    }
    const becameActive = active && !this.previous;
    this.previous = active;
    return becameActive;
  }
}
