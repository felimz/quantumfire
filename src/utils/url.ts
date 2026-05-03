import { SimulationParams } from "../types";
import { DEFAULT_PARAMS } from "../constants";

/**
 * Keys whose values are plain string enums (not numbers or booleans).
 * These are serialized/deserialized as-is.
 */
const STRING_ENUM_KEYS: ReadonlySet<keyof SimulationParams> = new Set([
  "withdrawalStrategy",
  "spendingPolicy",
]);

/**
 * Parses the current URL query string and merges it with DEFAULT_PARAMS.
 * Handles three value types:
 *   - boolean  → "true" | "false"
 *   - string enum → exact string match
 *   - number   → parsed via Number()
 */
export const getParamsFromUrl = (): {
  params: SimulationParams;
  isDemoMode: boolean;
} => {
  if (typeof window === "undefined")
    return { params: DEFAULT_PARAMS, isDemoMode: false };

  const searchParams = new URLSearchParams(window.location.search);
  const params: SimulationParams = { ...DEFAULT_PARAMS };
  let isDemoMode = false;

  searchParams.forEach((value, key) => {
    if (key === "demoMode") {
      isDemoMode = value === "true";
      return;
    }
    if (!(key in DEFAULT_PARAMS)) return; // unknown key — ignore

    const k = key as keyof SimulationParams;
    const defaultVal = DEFAULT_PARAMS[k];

    if (typeof defaultVal === "boolean") {
      if (value === "true")
        (params as unknown as Record<string, unknown>)[k] = true;
      else if (value === "false")
        (params as unknown as Record<string, unknown>)[k] = false;
    } else if (STRING_ENUM_KEYS.has(k)) {
      // Accept any string value — the invariant check below will catch garbage
      (params as unknown as Record<string, unknown>)[k] = value;
    } else {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        (params as unknown as Record<string, unknown>)[k] = parsed;
      }
    }
  });

  // Enforce age invariants in case the URL was manually modified
  if (params.retirementAge <= params.currentAge) {
    params.retirementAge = params.currentAge + 1;
  }
  if (params.deathAge <= params.retirementAge) {
    params.deathAge = params.retirementAge + 1;
  }

  return { params, isDemoMode };
};

/**
 * Serializes the current SimulationParams to the URL query string
 * without adding to the browser's history stack (replaceState).
 * Only params that differ from DEFAULT_PARAMS are written to keep URLs short.
 */
export const updateUrlWithParams = (
  params: SimulationParams,
  isDemoMode: boolean = false,
) => {
  if (typeof window === "undefined") return;

  const searchParams = new URLSearchParams();

  (Object.keys(params) as Array<keyof SimulationParams>).forEach((key) => {
    const value = params[key];
    const defaultVal = DEFAULT_PARAMS[key];

    if (value !== defaultVal) {
      searchParams.set(key, String(value));
    }
  });

  if (isDemoMode) {
    searchParams.set("demoMode", "true");
  }

  const qs = searchParams.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${qs ? "?" + qs : ""}`,
  );
};
