/**
 * Formats a number as a compact currency string.
 * Examples: 2500000 → "$2.5M", 150000 → "$150k", 500 → "$500"
 */
const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumSignificantDigits: 3,
  minimumSignificantDigits: 3,
});

export const formatCurrency = (value: number): string => {
  if (value === 0) return "$0";
  return formatter.format(value).replace("K", "k");
};
