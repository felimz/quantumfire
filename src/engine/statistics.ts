/** Select the upper middle value, matching Float64Array.sort()[floor(n / 2)].
 * Mutates the scratch array; callers retain their original samples.
 */
export function selectMedian(values: Float64Array): number {
  const middle = Math.floor(values.length / 2);
  let left = 0;
  let right = values.length - 1;
  let remaining = 2 * Math.ceil(Math.log2(values.length + 1));

  // Three-way partitioning handles the constant/duplicate cash-flow samples
  // without sorting every simulation for every reported year.
  while (left < right && remaining-- > 0) {
    const a = values[left];
    const b = values[(left + right) >>> 1];
    const c = values[right];
    const pivot = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    // Typed-array sorting puts NaN last. Keep that behavior for invalid samples.
    if (Number.isNaN(pivot)) break;
    let lower = left;
    let current = left;
    let upper = right;
    let negativeZeros = 0;
    while (current <= upper) {
      const value = values[current];
      if (Number.isNaN(value)) {
        values.sort();
        return values[middle];
      }
      if (value < pivot) {
        values[current] = values[lower];
        values[lower++] = value;
        current++;
      } else if (value > pivot) {
        values[current] = values[upper];
        values[upper--] = value;
      } else {
        if (Object.is(value, -0)) negativeZeros++;
        current++;
      }
    }
    if (middle < lower) right = lower - 1;
    else if (middle > upper) left = upper + 1;
    else return pivot === 0 ? (middle - lower < negativeZeros ? -0 : 0) : values[middle];
  }
  if (left === right) return values[middle];
  // Bound worst-case partition work for unusual/adversarial distributions.
  values.sort();
  return values[middle];
}
