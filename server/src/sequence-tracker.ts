export class SequenceTracker {
  #latest: number | undefined;
  lost = 0;
  reordered = 0;
  observe(sequence: number): void {
    if (this.#latest === undefined) { this.#latest = sequence; return; }
    const delta = (sequence - this.#latest) >>> 0;
    if (delta > 1 && delta < 0x80000000) this.lost += delta - 1;
    if (delta === 0 || delta >= 0x80000000) this.reordered += 1;
    if (delta > 0 && delta < 0x80000000) this.#latest = sequence;
  }
}
