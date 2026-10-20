import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/freighter";

const MOCK_WALLET = "GBMOCKWALLETADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

const MOCK_INVOICE = {
  id: "inv-mobile-001",
  issuer: MOCK_WALLET,
  buyer: "GBBUYERADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  face_value: "10000000000",
  asset: "USDC",
  discount_bps: 200,
  funded_amount: "0",
  due_date: 1893456000,
  status: "Listed",
  created_at: 1735603200,
  funded_at: null,
  shipped_at: null,
  issuer_confirmed: false,
  buyer_confirmed: false,
  repaid_at: null,
  listed_at: 1735603200,
  issuer_confirmed_at: null,
  buyer_confirmed_at: null,
  defaulted_at: null,
  transaction_hashes: [],
  tx_hashes: [],
};

async function mockInvoiceApis(page: Page) {
  await page.route("**/invoices**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: [MOCK_INVOICE],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    });
  });
  await page.route("**/events**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });
  await page.route("**/profile**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ address: MOCK_WALLET, verified: true, role: "issuer" }),
    });
  });
  await page.route("**/pool**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ availableLiquidity: "10000000000" }),
    });
  });
  await page.route("**/horizon-testnet.stellar.org/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: MOCK_WALLET,
        account_id: MOCK_WALLET,
        sequence: "123456789",
        subentry_count: 0,
        balances: [],
      }),
    });
  });
}

async function connectWallet(page: Page) {
  const connectButton = page
    .getByRole("navigation")
    .getByRole("button", { name: /Connect Wallet/i });
  if (await connectButton.isVisible()) await connectButton.click();
  await expect(
    page.getByRole("navigation").getByText("GBMOCK...XXXX", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
}

for (const route of ["/dashboard", "/marketplace"]) {
  test(`mobile invoice selection focuses and announces console on ${route}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockInvoiceApis(page);
    await page.goto(route, { waitUntil: "domcontentloaded" });
    if (route === "/dashboard") await connectWallet(page);

    await page
      .locator(".md\\:hidden")
      .getByText("Invoice obligation")
      .click();

    const consoleHeading = page.getByRole("heading", {
      name: route === "/dashboard" ? "Management console" : "Management Center",
    });
    await expect(consoleHeading).toBeFocused();
    await expect(
      page.getByRole("status").filter({
        hasText: "Invoice INV#inv-mobile-001 selected, actions available below",
      }),
    ).toBeAttached();
    const headingBox = await consoleHeading.boundingBox();
    expect(headingBox?.y).toBeGreaterThanOrEqual(0);
    expect(headingBox?.y).toBeLessThan(812);
  });
}

test("reduced motion disables feed transforms and skeleton shimmer", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/events**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 1,
          event_id: "event-1",
          contract_id: "contract-1",
          ledger: 1,
          event_type: "InvoiceCreated",
          ledger_closed_at: Math.floor(Date.now() / 1000),
          data: { invoice_id: "abcdef123456" },
        },
      ]),
    });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const feedEntry = page
    .getByRole("region", { name: "Live Financing Feed" })
    .getByRole("listitem");
  await expect(feedEntry).toBeVisible();
  await expect
    .poll(() => feedEntry.evaluate((element) => getComputedStyle(element).transform))
    .toBe("none");

  await page.route("**/invoices**", async (route) => {
    await page.waitForTimeout(500);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    });
  });
  await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
  const shimmer = page.locator('[class*="shimmer"]').first();
  await expect(shimmer).toBeVisible();
  await expect
    .poll(() => shimmer.evaluate((element) => getComputedStyle(element).animationName))
    .toBe("none");
});