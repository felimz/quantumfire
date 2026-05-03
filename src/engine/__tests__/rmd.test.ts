import { describe, it, expect } from "vitest";
import { getRMDDivisor } from "../rmd";

describe("getRMDDivisor", () => {
  it("should return 0 for ages below RMD start age (75)", () => {
    expect(getRMDDivisor(50)).toBe(0);
    expect(getRMDDivisor(72)).toBe(0);
    expect(getRMDDivisor(74)).toBe(0);
  });

  it("should return correct IRS table values at key ages", () => {
    expect(getRMDDivisor(75)).toBe(24.6);
    expect(getRMDDivisor(80)).toBe(20.2);
    expect(getRMDDivisor(85)).toBe(16.0);
    expect(getRMDDivisor(90)).toBe(12.2);
    expect(getRMDDivisor(100)).toBe(6.4);
  });

  it("should return a floor of 2.0 for ages beyond table", () => {
    expect(getRMDDivisor(116)).toBe(2.0);
    expect(getRMDDivisor(120)).toBe(2.0);
  });

  it("divisors should be monotonically decreasing across the table", () => {
    let prev = Infinity;
    for (let age = 75; age <= 115; age++) {
      const divisor = getRMDDivisor(age);
      expect(divisor).toBeLessThan(prev);
      prev = divisor;
    }
  });
});
