import { expect, test } from "@playwright/test";

test.describe("cookie consent banner", () => {
  test("shows on first visit, and Reject dismisses it and persists across reload", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: "Cookie notice" });
    await expect(banner).toBeVisible();

    await banner.getByRole("button", { name: "Reject" }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(page.getByRole("dialog", { name: "Cookie notice" })).toBeHidden();
  });

  test("Accept dismisses the banner and persists across reload", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("dialog", { name: "Cookie notice" });
    await banner.getByRole("button", { name: "Accept" }).click();
    await expect(banner).toBeHidden();

    await page.reload();
    await expect(page.getByRole("dialog", { name: "Cookie notice" })).toBeHidden();
  });

  test("Learn more links to the Cookie Policy page, which can flip the choice", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Learn more" }).click();
    await expect(page).toHaveURL(/\/legal\/cookies$/);
    await expect(page.getByRole("heading", { name: "Cookie Policy" })).toBeVisible();

    await expect(page.getByText("Not yet decided")).toBeVisible();
    await page.getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("Currently rejected")).toBeVisible();

    await page.getByRole("button", { name: "Accept" }).click();
    await expect(page.getByText("Currently allowed")).toBeVisible();
  });
});

test.describe("legal pages", () => {
  test("Terms of Use and Privacy Policy are reachable from the footer", async ({ page }) => {
    await page.goto("/");
    const footerLegalNav = page.getByRole("navigation", { name: "Legal" });
    await footerLegalNav.getByRole("link", { name: "Terms of Use" }).click();
    await expect(page).toHaveURL(/\/legal\/terms$/);
    await expect(page.getByRole("heading", { name: "Terms of Use" })).toBeVisible();

    // The Terms body also links to the Privacy Policy inline, so scope to the footer again.
    await page.getByRole("navigation", { name: "Legal" }).getByRole("link", { name: "Privacy Policy" }).click();
    await expect(page).toHaveURL(/\/legal\/privacy$/);
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  });

  test("are also linked from a dedicated Legal group on Settings", async ({ page }) => {
    await page.goto("/settings");
    const legalGroup = page.getByRole("group", { name: "Legal" });
    await expect(legalGroup.getByRole("link", { name: "Terms of Use" })).toBeVisible();
    await expect(legalGroup.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
    await legalGroup.getByRole("link", { name: "Cookie Policy" }).click();
    await expect(page).toHaveURL(/\/legal\/cookies$/);
  });
});
