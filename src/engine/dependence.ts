/**
 * Calculates the inverse of the standard normal cumulative distribution function.
 * Uses the Beasley-Springer-Moro approximation.
 */
export const normInv = (p: number): number => {
  const a1 = 2.50662823884;
  const a2 = -18.61500062529;
  const a3 = 41.39119773534;
  const a4 = -25.44106049637;
  const b1 = -8.4735109309;
  const b2 = 23.08336743743;
  const b3 = -21.06224101826;
  const b4 = 3.13082909833;
  const c1 = 0.3374754822726147;
  const c2 = 0.9761690190917186;
  const c3 = 0.1607979714918209;
  const c4 = 0.0276438810333863;
  const c5 = 0.0038405729373609;
  const c6 = 0.0003951896511919;
  const c7 = 0.0000321767881768;
  const c8 = 0.0000002888167364;
  const c9 = 0.00000003960315187;

  let x = 0;
  let r: number;
  const split = 0.42;

  if (p > 0 && p < 1) {
    if (Math.abs(p - 0.5) < split) {
      r = (p - 0.5) * (p - 0.5);
      x =
        ((p - 0.5) * (((a4 * r + a3) * r + a2) * r + a1)) /
        ((((b4 * r + b3) * r + b2) * r + b1) * r + 1);
    } else {
      r = p;
      if (p > 0.5) r = 1 - p;
      r = Math.log(-Math.log(r));
      x =
        c1 +
        r *
          (c2 +
            r *
              (c3 +
                r * (c4 + r * (c5 + r * (c6 + r * (c7 + r * (c8 + r * c9)))))));
      if (p < 0.5) x = -x;
    }
  }

  return x;
};

/**
 * Generates correlated uniform random variables using a Clayton Copula.
 * Clayton copulas exhibit strong lower tail dependence, meaning negative shocks
 * are more likely to occur together (simulating market crashes where correlations spike).
 *
 * @param theta The dependence parameter (theta > 0).
 *              As theta -> 0, variables become independent.
 *              As theta -> infinity, variables perfectly covary conditionally on the lower tail.
 * @param dimensions Number of variables to generate (e.g., 3 for Taxable, Deferred, Roth).
 * @returns An array of correlated uniform variables [0, 1].
 */
export const generateClaytonCopulaUniforms = (
  theta: number,
  dimensions: number,
): number[] => {
  // If theta is very small, assume independence to avoid division by zero
  if (theta < 0.001) {
    return Array.from({ length: dimensions }, () => Math.random());
  }

  // 1. Generate a Gamma-distributed frailty variable V ~ Gamma(1/theta, 1)
  // For shape parameter < 1, we use the Ahrens-Dieter acceptance-rejection method
  const alpha = 1 / theta;
  let v = 0;

  if (alpha < 1) {
    const c = (Math.E + alpha) / Math.E;
    let accepted = false;
    while (!accepted) {
      const u1 = Math.random();
      const u2 = Math.random();
      const w = c * u1;

      if (w <= 1) {
        v = Math.pow(w, 1 / alpha);
        if (u2 <= Math.exp(-v)) {
          accepted = true;
        }
      } else {
        v = -Math.log((c - w) / alpha);
        if (u2 <= Math.pow(v, alpha - 1)) {
          accepted = true;
        }
      }
    }
  } else {
    // For alpha >= 1, we use the Marsaglia-Tsang method
    const d = alpha - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    let accepted = false;
    while (!accepted) {
      // standard normal
      let u: number, x: number;
      do {
        u = Math.random();
      } while (u === 0);
      do {
        x = Math.random();
      } while (x === 0);
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * x);

      if (z > -1 / c) {
        const v_temp = Math.pow(1 + c * z, 3);
        const y = Math.random();
        if (Math.log(y) < 0.5 * z * z + d - d * v_temp + d * Math.log(v_temp)) {
          v = d * v_temp;
          accepted = true;
        }
      }
    }
  }

  // 2. Map standard uniforms through the inverse Laplace transform given V
  const uniforms = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    const e = -Math.log(Math.random()); // Standard exponential
    // Inverse Laplace transform for Clayton: (1 + e / v)^(-1/theta)
    uniforms[i] = Math.pow(1 + e / v, -1 / theta);
  }

  return uniforms;
};

/**
 * Generates correlated standard normal shocks using a Clayton Copula.
 * This combines the uniform copula generation with the inverse normal CDF.
 *
 * @param theta Copula dependence parameter
 * @param dimensions Number of assets
 * @returns Array of standard normal Z-scores with lower tail dependence
 */
export const generateCorrelatedShocks = (
  theta: number,
  dimensions: number,
): number[] => {
  const uniforms = generateClaytonCopulaUniforms(theta, dimensions);
  return uniforms.map((u) => normInv(u));
};
