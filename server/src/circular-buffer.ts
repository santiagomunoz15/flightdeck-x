export class CircularBuffer<T> {
  readonly #items: Array<T | undefined>;
  #start = 0;
  #length = 0;
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new RangeError("capacity must be a positive integer");
    this.#items = new Array<T | undefined>(capacity);
  }
  get length(): number { return this.#length; }
  push(value: T): void {
    const index = (this.#start + this.#length) % this.capacity;
    this.#items[index] = value;
    if (this.#length < this.capacity) this.#length += 1;
    else this.#start = (this.#start + 1) % this.capacity;
  }
  toArray(): T[] {
    return Array.from({ length: this.#length }, (_, index) => this.#items[(this.#start + index) % this.capacity] as T);
  }
}
