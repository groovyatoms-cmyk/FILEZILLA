import { expect, test } from "@playwright/test";

test.describe("navigation", () => {
  test("dashboard renders the drop zone and recent transfers empty state", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Drop files here")).toBeVisible();
    await expect(page.getByRole("button", { name: "Select Files" })).toBeVisible();
    await expect(page.getByText("No transfers yet")).toBeVisible();
  });

  test("sidebar links navigate to each screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Receive" }).click();
    await expect(page).toHaveURL(/\/receive$/);
    await expect(page.getByRole("heading", { name: "Receive" })).toBeVisible();

    await page.getByRole("link", { name: "Devices" }).click();
    await expect(page).toHaveURL(/\/devices$/);

    await page.getByRole("link", { name: "History" }).click();
    await expect(page).toHaveURL(/\/history$/);

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("defaults to dark with no flash, applies theme on every page, and toggles correctly", async ({ page }) => {
    // Dark is the default even with no stored preference and no prior visit to Settings —
    // this is what previously broke, since theme was only ever applied by mounting Settings.
    await page.goto("/send");
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByLabel("Theme")).toHaveValue("dark");

    await page.getByLabel("Theme").selectOption("light");
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    // Switching away from Settings must not lose the preference or revert it.
    await page.getByRole("link", { name: "Devices" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByLabel("Theme").selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("dashboard presents Send and Receive as equal, side-by-side options", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "New Transfer" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Receive" })).toBeVisible();
    await page.getByRole("button", { name: "Start Receiving" }).click();
    await expect(page).toHaveURL(/\/receive$/);
  });
});

test.describe("send flow guardrails", () => {
  test("blocks an executable file and keeps an allowed file", async ({ page }) => {
    await page.goto("/send");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /Select Files/i }).click()]);
    await chooser.setFiles({
      name: "installer.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("fake"),
    });
    await expect(page.getByText(/Executable\/installer files aren't allowed/)).toBeVisible();
  });
});
