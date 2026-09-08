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

  test("theme toggle switches to dark mode", async ({ page }) => {
    await page.goto("/settings");
    await page.getByLabel("Theme").selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("send flow guardrails", () => {
  test("blocks an executable file and keeps an allowed file", async ({ page }) => {
    await page.goto("/send");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('input[type="file"]').click()]);
    await chooser.setFiles({
      name: "installer.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("fake"),
    });
    await expect(page.getByText(/Executable\/installer files aren't allowed/)).toBeVisible();
  });
});
