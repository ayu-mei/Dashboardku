import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build, preview } from "vite";
import { chromium } from "playwright";

const directory = await mkdtemp(join(tmpdir(), "refraksi-bulk-"));
let server, browser;
const year = new Date().getFullYear();
let sales = Array.from({ length: 12 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  date: `${year}-01-01`,
  product: `Produk ${i + 1}`,
  quantity: 1,
  price: "100",
  unit_cost: "50",
  sales_value: "100",
  total_hpp: "50",
}));
let expenses = [
  {
    id: "00000000-0000-4000-8000-000000000100",
    date: `${year}-01-01`,
    description: "Sewa",
    amount: "10",
  },
];
const writes = [],
  errors = [];
try {
  await build({
    root: resolve("frontend"),
    configFile: resolve("frontend/vite.config.js"),
    build: { outDir: directory, emptyOutDir: true },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://bulk-test.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_test",
      ),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
        "https://bulk-test.onrender.com",
      ),
    },
  });
  server = await preview({
    root: resolve("frontend"),
    configFile: false,
    build: { outDir: directory },
    preview: { host: "127.0.0.1", port: 4189, strictPort: true },
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://bulk-test.supabase.co/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        access_token: "test-token",
        refresh_token: "refresh",
        expires_in: 7200,
        user: { id: "test-user" },
      },
    }),
  );
  await page.route("https://bulk-test.onrender.com/**", async (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("bulk-delete")) {
      const { ids } = route.request().postDataJSON();
      writes.push({ path, ids });
      if (path.includes("/sales/"))
        sales = sales.filter((row) => !ids.includes(row.id));
      else expenses = expenses.filter((row) => !ids.includes(row.id));
      return route.fulfill({
        headers,
        json: { deleted: ids.length, requested: ids.length, complete: true },
      });
    }
    return route.fulfill({
      headers,
      json: {
        sales,
        expenses,
        options: {},
        years: [year],
        note: "Test",
        metrics: {
          sales: "1200",
          hpp: "600",
          gross: "600",
          net: "590",
          operational: "10",
        },
        timeline: [],
        products: [],
      },
    });
  });
  await page.goto("http://127.0.0.1:4189");
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page
    .getByRole("button", { name: "Data Penjualan", exact: true })
    .click();
  const salesPanel = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Transaksi penjualan",
        exact: true,
      }),
    });
  const expensePanel = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Biaya operasional",
        exact: true,
      }),
    });
  await salesPanel.getByText("12 baris · Halaman 1 dari 2").waitFor();
  await salesPanel
    .getByRole("checkbox", { name: "Pilih Produk 1 ", exact: false })
    .first()
    .check();
  assert.equal(
    await salesPanel
      .getByRole("checkbox", { name: "Pilih semua hasil filter", exact: true })
      .evaluate((el) => el.indeterminate),
    true,
  );
  await salesPanel
    .getByRole("button", { name: "Pilih semua hasil filter", exact: true })
    .click();
  await salesPanel.getByRole("button", { name: "Halaman berikutnya" }).click();
  assert.equal(
    await salesPanel.getByRole("checkbox", { checked: true }).count(),
    3,
  );
  assert.equal(
    await expensePanel.getByRole("checkbox", { checked: true }).count(),
    0,
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await salesPanel
    .getByRole("button", { name: "Hapus terpilih (12)", exact: true })
    .click();
  assert.equal(writes.length, 0);
  await page
    .getByRole("searchbox", { name: "Cari transaksi" })
    .fill("Produk 12");
  await salesPanel
    .getByRole("button", { name: "Hapus terpilih (0)", exact: true })
    .waitFor();
  await salesPanel
    .getByRole("button", { name: "Pilih semua hasil filter", exact: true })
    .click();
  page.once("dialog", (dialog) => {
    assert.match(dialog.message(), /Hapus 1 transaksi/);
    return dialog.accept();
  });
  await salesPanel
    .getByRole("button", { name: "Hapus terpilih (1)", exact: true })
    .click();
  await page
    .getByText("1 transaksi penjualan berhasil dihapus.", { exact: true })
    .waitFor();
  assert.deepEqual(writes[0].ids, ["00000000-0000-4000-8000-000000000012"]);
  await page.getByRole("searchbox", { name: "Cari transaksi" }).fill("");
  await salesPanel.getByText("11 baris · Halaman 1 dari 2").waitFor();
  await salesPanel
    .getByRole("button", { name: "Pilih semua hasil filter", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await salesPanel
    .getByRole("button", { name: "Hapus terpilih (11)", exact: true })
    .click();
  await page
    .getByText("11 transaksi penjualan berhasil dihapus.", { exact: true })
    .waitFor();
  assert.equal(sales.length, 0);
  assert.equal(expenses.length, 1);
  await expensePanel
    .getByRole("button", { name: "Pilih semua hasil filter", exact: true })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await expensePanel
    .getByRole("button", { name: "Hapus terpilih (1)", exact: true })
    .click();
  await page
    .getByText("1 catatan biaya operasional berhasil dihapus.", { exact: true })
    .waitFor();
  assert.equal(expenses.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: individual selection, mixed checkbox, all pages, cancellation, search scope, selection reset, delete all sales, separate expenses, no JS errors. Mock data only.",
  );
} finally {
  await browser?.close();
  await server?.httpServer.close();
  await rm(directory, { recursive: true, force: true });
}
