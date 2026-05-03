import { test, expect } from "@playwright/test";

test.describe("QuantumFire Core User Flows", () => {
  test("should render the application and display the main simulation elements", async ({
    page,
  }) => {
    // Navigate to the app (assuming Vite dev server runs on 5173 by default)
    await page.goto("http://localhost:5173");

    // Assert the main application title is present
    await expect(
      page.locator("h1").filter({ hasText: "QuantumFire" }),
    ).toBeVisible();

    // Assert the Sidebar (Control Center) is present
    await expect(page.getByText("Control Center")).toBeVisible();

    // Assert the ResultsChart (Projected Net Worth) is present
    await expect(page.getByText("Projected Net Worth")).toBeVisible();

    // Assert the Summary Cards are present
    await expect(page.getByText("Terminal Wealth")).toBeVisible();
    await expect(page.getByText("Success Rate")).toBeVisible();
  });

  test("should update the chart when the Retirement Age slider is interacted with", async ({
    page,
  }) => {
    await page.goto("http://localhost:5173");

    // Initially grab the success rate text
    const initialSuccessRate = await page
      .locator("div")
      .filter({ hasText: /^Success Rate$/ })
      .locator("..")
      .locator("div.text-3xl")
      .innerText();

    // Locate the Retirement Age slider input
    const retirementAgeSlider = page.locator('input[type="range"]').first();

    // Playwright doesn't easily drag sliders, but we can evaluate JS to change the value and trigger React's synthetic events
    await retirementAgeSlider.evaluate((element: HTMLInputElement) => {
      // Force the value to a lower age (e.g., 45) to drastically change the simulation
      element.value = "45";

      // Dispatch events so React picks up the change
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // Wait a brief moment for the simulation to recalculate and React to render
    await page.waitForTimeout(500);

    // Grab the new success rate text
    const newSuccessRate = await page
      .locator("div")
      .filter({ hasText: /^Success Rate$/ })
      .locator("..")
      .locator("div.text-3xl")
      .innerText();

    // The success rate should theoretically change if we drop the retirement age significantly
    // (We aren't asserting *what* it is, just that the store/simulation pipeline successfully reacted)
    expect(initialSuccessRate).not.toEqual(newSuccessRate);
  });
});
