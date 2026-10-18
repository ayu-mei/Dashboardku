import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build, preview } from "vite";
import { chromium } from "playwright";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";

const year = new Date().getFullYear();
let sales = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    date: `${year}-01-10`,
    product: "Lensa",
    customer: "Ani",
    quantity: 2,
    price: "500000",
    unit_cost: "300000",
    category: "Optik",
    location: "Bali",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    date: `${year}-02-10`,
    product: "Frame",
    customer: "Budi",
    quantity: 1,
    price: "200000",
    unit_cost: "100000",
    category: "Frame",
    location: "Jakarta",
  },
  ...Array.from({ length: 21 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 3).padStart(12, "0")}`,
    date: `${year}-01-01`,
    product: `Fixture ${i}`,
    customer: "Test",
    quantity: 1,
    price: "0",
    unit_cost: "0",
  })),
];
let expenses = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      date: `${year}-01-12`,
      description: "Sewa",
      amount: "100000",
    },
  ],
  next = 100;
function report(query) {
  const period = (r) =>
    (!query.get("year") || r.date.startsWith(query.get("year"))) &&
    (!query.get("month") ||
      Number(r.date.slice(5, 7)) === Number(query.get("month"))) &&
    (!query.get("start") || r.date >= query.get("start")) &&
    (!query.get("end") || r.date <= query.get("end"));
  const selected = sales
    .filter(
      (r) =>
        period(r) &&
        ["product", "category", "location"].every(
          (key) => !query.get(key) || r[key] === query.get(key),
        ),
    )
    .map((r) => ({
      ...r,
      sales_value: String(r.quantity * r.price),
      total_hpp: String(r.quantity * r.unit_cost),
    }));
  const costs = expenses.filter(period),
    total = selected.reduce((n, r) => n + Number(r.sales_value), 0),
    hpp = selected.reduce((n, r) => n + Number(r.total_hpp), 0),
    operational = costs.reduce((n, r) => n + Number(r.amount), 0);
  return {
    sales: selected,
    expenses: costs,
    metrics: {
      sales: String(total),
      hpp: String(hpp),
      gross: String(total - hpp),
      gross_margin: total ? ((total - hpp) / total) * 100 : null,
      operational: String(operational),
      net: String(total - hpp - operational),
      net_margin: total ? ((total - hpp - operational) / total) * 100 : null,
    },
    timeline: [1, 2].map((month) => ({
      month: `${year}-0${month}`,
      sales: String(
        selected
          .filter((r) => Number(r.date.slice(5, 7)) === month)
          .reduce((n, r) => n + Number(r.sales_value), 0),
      ),
      gross: String(
        selected
          .filter((r) => Number(r.date.slice(5, 7)) === month)
          .reduce((n, r) => n + Number(r.sales_value) - Number(r.total_hpp), 0),
      ),
    })),
    products: [...new Set(selected.map((r) => r.product))]
      .map((product) => {
        const value = selected
          .filter((r) => r.product === product)
          .reduce((n, r) => n + Number(r.sales_value), 0);
        return {
          product,
          sales: String(value),
          contribution: total ? (value / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.sales - a.sales),
    options: Object.fromEntries(
      ["product", "category", "location"].map((key) => [
        key,
        [...new Set(sales.map((r) => r[key]).filter(Boolean))],
      ]),
    ),
    years: [year - 1, year],
    note: "Biaya operasional mengikuti periode; belum dialokasikan per produk.",
  };
}
const directory = await mkdtemp(join(tmpdir(), "refraksi-ui-"));
let server, browser;
try {
  await build({
    root: resolve("frontend"),
    configFile: resolve("frontend/vite.config.js"),
    build: { outDir: resolve(".test-build"), emptyOutDir: true },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://test.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_test_only",
      ),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
        "https://api-test.onrender.com",
      ),
    },
  });
  server = await preview({
    root: resolve("frontend"),
    configFile: false,
    build: { outDir: resolve(".test-build") },
    preview: { host: "127.0.0.1", port: 4175, strictPort: true },
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://test.supabase.co/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 3600,
      }),
    }),
  );
  await page.route("https://api-test.onrender.com/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      };
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    assert.equal(req.headers().authorization, "Bearer test-access");
    let value;
    if (url.pathname === "/api/dashboard") value = report(url.searchParams);
    else if (url.pathname === "/api/export") {
      const data = report(url.searchParams);
      const buffer = await writeXlsxFile([
        {
          sheet: "Summary",
          data: [
            [{ value: "Metric" }, { value: "Value" }],
            ...Object.entries(data.metrics).map(([key, value]) => [
              { value: key },
              { value: value === null ? null : String(value), type: String },
            ]),
          ],
        },
      ]).toBuffer();
      return route.fulfill({
        status: 200,
        headers,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: buffer,
      });
    } else if (url.pathname === "/api/import/inspect")
      value = {
        sheets: ["Transaksi"],
        sheet: "Transaksi",
        columns: [
          "Tanggal Asli",
          "SKU_DESC",
          "QTY_SALES",
          "Harga Aktual",
          "COST",
        ].map((name, index) => ({ name, index })),
        sample: [],
        warning: "Pilih kolom aktual, bukan subtotal.",
      };
    else if (url.pathname === "/api/import/preview")
      value = {
        count: 1,
        sample: [{ product: "Imported" }],
        notice: "Belum disimpan.",
      };
    else if (url.pathname === "/api/import/commit") value = { imported: 1 };
    else {
      const [, , kind, id] = url.pathname.split("/"),
        rows = kind === "sales" ? sales : expenses;
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        const r = {
          ...body,
          id: `20000000-0000-4000-8000-${String(next++).padStart(12, "0")}`,
        };
        rows.push(r);
        value = [r];
      }
      if (req.method() === "PUT") {
        const r = rows.find((row) => row.id === id);
        Object.assign(r, req.postDataJSON());
        value = [r];
      }
      if (req.method() === "DELETE") {
        if (kind === "sales") sales = rows.filter((row) => row.id !== id);
        else expenses = rows.filter((row) => row.id !== id);
        value = { ok: true };
      }
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  });
  await page.goto("http://127.0.0.1:4175");
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page
    .getByRole("heading", { name: "Dashboard Penjualan", exact: true })
    .waitFor();
  const metric = (label) =>
    page
      .locator("article")
      .filter({ has: page.getByText(label, { exact: true }) })
      .locator("strong");
  await page.waitForFunction(() =>
    document.querySelector("article strong")?.textContent.includes("1.200.000"),
  );
  assert.match(await metric("Actual Net Profit").innerText(), /400.000/);
  await page.getByLabel("Bulan", { exact: true }).selectOption("1");
  await page.waitForFunction(() =>
    document.querySelector("article strong")?.textContent.includes("1.000.000"),
  );
  assert.match(await metric("Actual Net Profit").innerText(), /300.000/);
  assert.match(await metric("Actual Net Margin").innerText(), /30%/);
  await page.getByLabel("Cari transaksi", { exact: true }).fill("Lensa");
  assert.equal(
    await page
      .getByRole("region", { name: "Tabel penjualan", exact: true })
      .locator("tbody tr")
      .count(),
    1,
  );
  await page.getByLabel("Cari transaksi", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Halaman berikutnya", exact: true })
    .first()
    .click();
  await page.getByText(/Halaman 2 dari 3/).waitFor();
  await page.getByRole("button", { name: "Penjualan", exact: true }).click();
  await page.getByRole("button", { name: "Penjualan", exact: true }).click();
  await page.getByRole("button", { name: "Edit Lensa", exact: true }).waitFor();
  await page.getByLabel("Produk", { exact: true }).selectOption("Frame");
  await page.waitForFunction(
    () => document.querySelector("article strong")?.textContent === "Rp 0",
  );
  assert.match(await metric("Actual Net Profit").innerText(), /-.*100.000/);
  assert.equal(await metric("Actual Net Margin").innerText(), "-");
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector("article strong")?.textContent.includes("1.200.000"),
  );
  await page.getByLabel("Kategori", { exact: true }).selectOption("Frame");
  await page.waitForFunction(() =>
    document.querySelector("article strong")?.textContent.includes("200.000"),
  );
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await page.getByLabel("Dari tanggal", { exact: true }).fill(`${year}-02-01`);
  await page
    .getByLabel("Sampai tanggal", { exact: true })
    .fill(`${year}-02-28`);
  await page.waitForFunction(() =>
    document.querySelector("article strong")?.textContent.includes("200.000"),
  );
  assert.match(await metric("Actual Net Profit").innerText(), /100.000/);
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await page
    .getByLabel("Tahun", { exact: true })
    .selectOption(String(year - 1));
  await page.waitForFunction(
    () => document.querySelector("article strong")?.textContent === "Rp 0",
  );
  assert.equal(await metric("Gross Margin").innerText(), "-");
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await page
    .getByLabel("Cabang / Lokasi", { exact: true })
    .selectOption("Bali");
  await page.waitForFunction(() =>
    document.querySelector("article strong")?.textContent.includes("1.000.000"),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
  const download = await downloadPromise,
    path = join(directory, download.suggestedFilename());
  await download.saveAs(path);
  const summary = await readXlsxFile(path, { sheet: "Summary" });
  assert.equal(summary.find((row) => row[0] === "net")[1], "300000");
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await page
    .getByRole("button", { name: "Tambah transaksi", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Pelanggan", { exact: true }).fill("Test");
  await dialog.getByLabel("Produk", { exact: true }).fill("Baru");
  await dialog.getByLabel("Jumlah unit", { exact: true }).fill("1");
  await dialog
    .getByLabel("Harga jual aktual per unit (Rp)", { exact: true })
    .fill("100");
  await dialog.getByLabel("HPP per unit (Rp)", { exact: true }).fill("50");
  await dialog
    .getByRole("button", { name: "Simpan data", exact: true })
    .click();
  await page.getByText("Data berhasil disimpan.", { exact: true }).waitFor();
  await page.getByLabel("Cari transaksi", { exact: true }).fill("Baru");
  await page.getByRole("button", { name: "Edit Baru", exact: true }).click();
  await dialog.getByLabel("Jumlah unit", { exact: true }).fill("2");
  await dialog
    .getByRole("button", { name: "Simpan data", exact: true })
    .click();
  await page.getByRole("button", { name: "Hapus Baru", exact: true }).waitFor();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hapus Baru", exact: true }).click();
  await page.getByText("Data berhasil dihapus.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Data Penjualan", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Upload Excel", exact: true })
    .waitFor();
  const file = await writeXlsxFile([
    [
      { value: "Tanggal Asli" },
      { value: "SKU_DESC" },
      { value: "QTY_SALES" },
      { value: "Harga Aktual" },
      { value: "COST" },
    ],
    [
      { value: `${year}-01-10` },
      { value: "Lensa" },
      { value: 2 },
      { value: 500000 },
      { value: 300000 },
    ],
  ]).toBuffer();
  await page.locator("input[type=file]").setInputFiles({
    name: "transaksi.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await page
    .getByRole("button", { name: "Periksa struktur Excel", exact: true })
    .click();
  await page
    .getByText("Pilih kolom aktual, bukan subtotal.", { exact: true })
    .waitFor();
  const upload = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Upload Excel", exact: true }),
  });
  for (const [name, index] of [
    ["Tanggal transaksi", 0],
    ["Produk", 1],
    ["Jumlah unit", 2],
    ["Harga jual aktual per unit", 3],
    ["HPP per unit", 4],
  ])
    await upload
      .locator("label")
      .filter({ hasText: new RegExp("^" + name + "\\s*\\*") })
      .locator("select")
      .selectOption(String(index));
  await page
    .getByRole("button", { name: "Validasi & pratinjau impor", exact: true })
    .click();
  await page.getByText("1 baris transaksi valid", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", {
        name: "Simpan 1 transaksi ke database",
        exact: true,
      })
      .isEnabled(),
    false,
  );
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", {
      name: "Simpan 1 transaksi ke database",
      exact: true,
    })
    .click();
  await page
    .getByText(
      "Impor berhasil. Sesuaikan periode filter jika data belum terlihat.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await mkdir("test-artifacts", { recursive: true });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `Horizontal page overflow at ${width}px`,
    );
    if (width === 390) {
      await page
        .getByRole("button", { name: "Buka menu", exact: true })
        .click();
      await page.getByRole("button", { name: "Analisis", exact: true }).click();
      await page
        .getByRole("heading", { name: "Analisis Penjualan", exact: true })
        .waitFor();
      await page.screenshot({
        path: "test-artifacts/mobile.png",
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Buka menu", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Dashboard", exact: true })
        .click();
    }
    if (width === 1440)
      await page.screenshot({
        path: "test-artifacts/desktop.png",
        fullPage: true,
      });
  }
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Masuk ke dashboard", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, date/month/product/category/location filter UI, KPI refresh, chart, table search/sort/pagination, CRUD, upload confirmation, XLSX download, navigation, logout, responsive 320–1440px. API mocked; live services require configuration.",
  );
} finally {
  await browser?.close();
  await server?.httpServer.close();
  await rm(directory, { recursive: true, force: true });
}
