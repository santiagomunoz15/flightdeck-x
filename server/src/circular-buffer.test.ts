import { describe, expect, it } from "vitest";
import { CircularBuffer } from "./circular-buffer.js";

describe("CircularBuffer", () => {
  it("retains only the newest values in insertion order", () => {
    const buffer = new CircularBuffer<number>(3);
    for (const value of [1, 2, 3, 4, 5]) buffer.push(value);
    expect(buffer.length).toBe(3);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it("rejects invalid capacities", () => {
    expect(() => new CircularBuffer(0)).toThrow(RangeError);
  });
});
