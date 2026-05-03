import { test, expect } from "@playwright/test";

test("Monte Carlo simulation updates when retirement age changes", async ({
  page,
}) => {
  // 1. Navigate to the app (the webServer config ensures localhost:4000 is running)
  await page.goto("/");

  // 2. Wait for the initial simulation to render
  const successRateText = page
    .locator('p:has-text("Mortality-Weighted Success")')
    .locator("..")
    .locator("h4");
  await expect(successRateText).toBeVisible({ timeout: 10000 });

  // Capture the initial success rate
  const initialRate = await successRateText.textContent();
  expect(initialRate).toContain("%");

  // 3. Find the 'Retirement Age' slider input
  // Since we use a custom slider, we'll locate the number input directly associated with the label
  const retirementAgeInput = page
    .locator("div.mb-5")
    .filter({ hasText: "Retirement Age" })
    .locator('input[type="number"]');

  // 4. Change the retirement age from default (e.g. 55) to 65
  await retirementAgeInput.fill("65");

  // 5. Blurring/pressing Enter triggers the update
  await retirementAgeInput.press("Enter");

  // 6. Verify the success rate changed (retiring 10 years later should improve or at least change the rate)
  // We use a custom expect loop to wait for the web worker to return the new result
  await expect(async () => {
    const newRate = await successRateText.textContent();
    expect(newRate).not.toEqual(initialRate);
  }).toPass({ timeout: 5000 });
});
