import { describe, it, expect } from "vitest";
import { formatCurrency } from "../format";

describe("formatCurrency", () => {
  it("should format millions with M suffix and 3 sig figs", () => {
    expect(formatCurrency(2500000)).toBe("$2.50M");
    expect(formatCurrency(1000000)).toBe("$1.00M");
    expect(formatCurrency(10500000)).toBe("$10.5M");
  });

  it("should format thousands with k suffix and 3 sig figs", () => {
    expect(formatCurrency(150000)).toBe("$150k");
    expect(formatCurrency(1000)).toBe("$1.00k");
    expect(formatCurrency(999999)).toBe("$1.00M");
  });

  it("should format small values as plain dollars", () => {
    expect(formatCurrency(500)).toBe("$500");
    expect(formatCurrency(0)).toBe("$0");
    expect(formatCurrency(999)).toBe("$999");
  });
});
