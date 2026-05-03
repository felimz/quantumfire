import { describe, it } from "vitest";
import { DEFAULT_PARAMS } from "../../constants";
import { runPath } from "../simulation";

describe("Strict Sequential Waterfall Override", () => {
  it("Drains Taxable sequentially when advanced routing is disabled", () => {
    const result = runPath(
      {
        ...DEFAULT_PARAMS,
        retirementAge: 55,
        taxAwareBracketFill: false,
        proportionalWithdrawals: false, // FORCE OFF
      },
      true,
    );

    for (let i = 0; i < result.path.length; i++) {
      const age = DEFAULT_PARAMS.currentAge + i;
      if (age >= 55 && age <= 65) {
        console.log(
          `Age ${age}: Taxable=${result.taxablePath[i]}, Deferred=${result.deferredPath[i]}`,
        );
      }
    }
  });
});
