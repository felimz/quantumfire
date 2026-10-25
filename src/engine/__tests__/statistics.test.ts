import { describe, expect, it } from "vitest";
import { selectMedian } from "../statistics";

describe("cash-flow median selection", () => {
  it("matches the existing upper-middle definition for odd/even and duplicate samples", () => {
    const cases = [
      [42], [1, 2], [3, 1, 2], [8, 1, 6, 3],
      [0, 0, 0, 0, 0], [2, 0, 2, 0, 2, 0], [-9, 2, -1, 5],
      [Infinity, 0, -Infinity], [NaN, 1, 4, 2],
      [-0, 0, -0, 0], [0, -0, -0],
    ];
    for (const samples of cases) {
      const expected = new Float64Array(samples).sort()[Math.floor(samples.length / 2)];
      expect(selectMedian(new Float64Array(samples))).toBe(expected);
    }
  });

  it("matches numeric sorting for ordered and seeded financial-scale samples", () => {
    let seed = 81723;
    for (const length of [2, 3, 16, 127, 128, 501, 40000]) {
      const random = Float64Array.from({ length }, () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (seed % 2001) - 1000;
      });
      const sorted = random.slice().sort();
      for (const samples of [random, sorted, sorted.slice().reverse()]) {
        expect(selectMedian(samples.slice())).toBe(sorted[Math.floor(length / 2)]);
      }
    }
  });
});
