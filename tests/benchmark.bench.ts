import { bench, describe } from "vitest";
import { runMonteCarlo } from "../src/engine/monteCarlo";
import { DEFAULT_PARAMS } from "../src/constants";
import { runPath } from "../src/engine/simulation";
import { gaussianRandom } from "../src/engine/math";

describe("Math Engine", () => {
  bench("gaussianRandom (10k draws)", () => {
    for (let i = 0; i < 10000; i++) {
      gaussianRandom(0, 1);
    }
  });
});

describe("Simulation Engine", () => {
  bench("runPath (Deterministic)", () => {
    runPath(DEFAULT_PARAMS, true);
  });

  bench("runPath (Stochastic)", () => {
    runPath(DEFAULT_PARAMS, false);
  });
});

describe("Monte Carlo Pipeline", () => {
  bench("runMonteCarlo (1,000 runs)", () => {
    runMonteCarlo(DEFAULT_PARAMS, 1000);
  });
});
