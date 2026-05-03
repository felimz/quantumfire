import { test, expect } from "@playwright/test";

test("UI Benchmark for Simulation Runs", async ({ page }) => {
  await page.goto("/");

  const runs = ["5000", "10000", "20000", "40000", "100000"];
  const results: { runs: string; timeMs: number }[] = [];

  for (const count of runs) {
    // Select the option
    await page
      .getByRole("combobox", { name: "Number of Monte Carlo simulations" })
      .selectOption(count);

    // The debounce timer in simulationCoordinator is 500ms
    // Wait for the calculating indicator to appear.
    await expect(page.getByText("● Calculating...")).toBeVisible({
      timeout: 5000,
    });
    const startTime = performance.now();

    // Wait for the indicator to disappear, which means the simulation logic is completely done
    // and the DOM has received the new state
    await expect(page.getByText("● Calculating...")).toBeHidden({
      timeout: 45000,
    });
    const endTime = performance.now();

    const timeMs = endTime - startTime + 500; // adding the theoretical debounce of 500ms since action triggered it 500ms earlier
    results.push({ runs: count, timeMs });
  }

  console.log("\n\n=== UI SIMULATION BENCHMARK PLOT ===");
  console.log("Runs\t\tUI Time (s)\tChart");
  console.log("--------------------------------------------------");
  const maxTime = Math.max(...results.map((r) => r.timeMs));
  const MAX_BAR_WIDTH = 40;

  for (const result of results) {
    const width = Math.round((result.timeMs / maxTime) * MAX_BAR_WIDTH);
    const bar = "█".repeat(width || 1);
    const runStr = Number(result.runs).toLocaleString().padEnd(10, " ");
    const timeStr = (result.timeMs / 1000).toFixed(2).padEnd(10, " ");
    console.log(`${runStr}\t${timeStr}\t| ${bar}`);
  }
  console.log("--------------------------------------------------\n");
});
