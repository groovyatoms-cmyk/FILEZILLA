import { expect, test } from "@playwright/test";

test.describe("mobile navigation drawer", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the six-dot menu button opens a drawer with the full nav, which closes on navigation", async ({ page }) => {
    await page.goto("/");

    const menuButton = page.getByRole("button", { name: "Open menu" });
    await expect(menuButton).toBeVisible();

    const drawerNav = page.getByRole("navigation", { name: "Menu" });
    await expect(drawerNav).toBeHidden();

    await menuButton.click();
    await expect(drawerNav).toBeVisible();
    await expect(drawerNav.getByRole("link", { name: "Devices" })).toBeVisible();
    await expect(drawerNav.getByRole("link", { name: "History" })).toBeVisible();
    await expect(drawerNav.getByRole("link", { name: "Settings" })).toBeVisible();

    await drawerNav.getByRole("link", { name: "Devices" }).click();
    await expect(page).toHaveURL(/\/devices$/);
    await expect(drawerNav).toBeHidden();
  });

  test("clicking the backdrop closes the drawer without navigating", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawerNav = page.getByRole("navigation", { name: "Menu" });
    await expect(drawerNav).toBeVisible();

    // Click near the right edge of the viewport, outside the drawer panel itself.
    await page.mouse.click(370, 400);
    await expect(drawerNav).toBeHidden();
    await expect(page).toHaveURL("/");
  });
});
