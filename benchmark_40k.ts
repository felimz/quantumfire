import { runMonteCarlo } from "./src/engine/monteCarlo";
import { DEFAULT_PARAMS } from "./src/constants";

console.log("Starting 40,000 simulations...");
const start = performance.now();

const result = runMonteCarlo(DEFAULT_PARAMS, 40000);

const end = performance.now();
console.log(
  `Finished 40,000 simulations in ${((end - start) / 1000).toFixed(2)} seconds.`,
);
console.log(`Success Rate: ${result.successRate.toFixed(2)}%`);
