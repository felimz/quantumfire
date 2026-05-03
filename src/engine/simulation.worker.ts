/**
 * Web Worker for Monte Carlo simulation.
 *
 * Handles two request types:
 * 1. "simulate" — Standard Monte Carlo run (params + numSimulations)
 * 2. "heatmap"  — 2D sensitivity matrix (WR × Bond Allocation), each cell is a mini Monte Carlo
 */

import { SimulationParams } from "../types";
import { runMonteCarlo } from "../engine";

export interface SimulateRequest {
  type: "simulate";
  params: SimulationParams;
  numSimulations: number;
}

export interface HeatmapRequest {
  type: "heatmap";
  params: SimulationParams;
  withdrawalRates: number[];
  bondAllocations: number[];
  numSimulations: number;
}

export interface HeatmapCell {
  x: number; // Bond Allocation
  y: number; // Withdrawal Rate
  value: number; // Success rate
}

export interface HeatmapResult {
  type: "heatmap";
  data: HeatmapCell[];
}

// Legacy support: plain WorkerRequest (no type field) is treated as "simulate"
export interface WorkerRequest {
  params: SimulationParams;
  numSimulations: number;
}

self.onmessage = (e: MessageEvent<SimulateRequest | HeatmapRequest | WorkerRequest>) => {
  const msg = e.data;

  // Detect request type (legacy requests have no "type" field)
  const requestType = "type" in msg ? msg.type : "simulate";

  if (requestType === "heatmap") {
    const req = msg as HeatmapRequest;
    const results: HeatmapCell[] = [];

    for (const wr of req.withdrawalRates) {
      for (const bnd of req.bondAllocations) {
        const testParams: SimulationParams = {
          ...req.params,
          initialWithdrawalRate: wr,
          bondAllocation: bnd,
          glidepathEnabled: false, // Isolate statically applied bond allocation
        };

        const simRes = runMonteCarlo(testParams, req.numSimulations);
        results.push({ x: bnd, y: wr, value: simRes.successRate });
      }
    }

    const response: HeatmapResult = { type: "heatmap", data: results };
    self.postMessage(response);
  } else {
    // Standard simulation
    const req = msg as WorkerRequest;
    const result = runMonteCarlo(req.params, req.numSimulations);
    self.postMessage(result);
  }
};
