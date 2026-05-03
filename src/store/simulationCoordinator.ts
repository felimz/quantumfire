import { useSimulationStore } from "./useSimulationStore";
import SimulationWorker from "../engine/simulation.worker?worker";
import type { WorkerRequest } from "../engine/simulation.worker";
import { runMonteCarlo } from "../engine";

const DEBOUNCE_MS = 250;
let worker: Worker | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Dispatches a simulation run to the Web Worker (or main-thread fallback).
 * Reused by both the initial boot and the subscription handler.
 */
function dispatchSimulation(params: import("../types").SimulationParams, numSimulations: number) {
  if (worker) {
    const request: WorkerRequest = { params, numSimulations };
    worker.postMessage(request);
  } else {
    const newResults = runMonteCarlo(params, numSimulations);
    useSimulationStore.getState().setResults(newResults);
    useSimulationStore.getState().setIsSimulating(false);
  }
}

export const initSimulationCoordinator = () => {
  if (typeof window === "undefined") return;

  // Initialize Web Worker
  try {
    worker = new SimulationWorker();
    worker.onmessage = (e) => {
      useSimulationStore.getState().setResults(e.data);
      useSimulationStore.getState().setIsSimulating(false);
    };
    worker.onerror = (err) => {
      console.error("Simulation worker error:", err);
      useSimulationStore.getState().setIsSimulating(false);
    };
  } catch {
    console.warn("Web Workers not available, using main-thread fallback");
  }

  // Fire the initial simulation immediately (deferred from store creation
  // to avoid blocking the main thread during first paint).
  const { params, numSimulations } = useSimulationStore.getState();
  useSimulationStore.getState().setIsSimulating(true);
  dispatchSimulation(params, numSimulations);

  // Subscribe to Zustand store changes for subsequent runs
  useSimulationStore.subscribe((state, prevState) => {
    // Only trigger if params or numSimulations actually changed
    if (
      state.params !== prevState.params ||
      state.numSimulations !== prevState.numSimulations
    ) {
      useSimulationStore.getState().setIsSimulating(true);

      if (timer) clearTimeout(timer);

      timer = setTimeout(() => {
        const { params, numSimulations } = state;
        dispatchSimulation(params, numSimulations);
      }, DEBOUNCE_MS);
    }
  });
};
