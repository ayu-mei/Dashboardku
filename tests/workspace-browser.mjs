import assert from "node:assert/strict";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { build, preview } from "vite";
import { chromium } from "playwright";
import writeXlsxFile from "write-excel-file/node";
import readXlsxFile from "read-excel-file/node";

const base = "http://127.0.0.1:4186",
  frontend = "http://127.0.0.1:4176";
let apiProcess, server, browser;
const apiLogs = [],
  errors = [],
  failedRequests = [];
let expectedBadFile = false;
const year = new Date().getFullYear();
const state = async () => (await fetch(base + "/test/state")).json();
try {
  apiProcess = spawn(
    [
      resolve(
        process.platform === "win32"
          ? ".venv/Scripts/python.exe"
          : ".venv/bin/python",
      ),
      resolve(
        process.platform === "win32"
          ? "backend/.venv/Scripts/python.exe"
          : "backend/.venv/bin/python",
      ),
    ].find(existsSync) || (process.platform === "win32" ? "python" : "python3"),
    [
      "-m",
      "uvicorn",
      "fixture_api:app",
      "--app-dir",
      "tests",
      "--host",
      "127.0.0.1",
      "--port",
      "4186",
    ],
    {
      cwd: resolve("backend"),
      env: { ...process.env, ALLOWED_ORIGINS: frontend },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  apiProcess.on("error", (error) => apiLogs.push(error.message));
  apiProcess.stdout.on("data", (data) => apiLogs.push(String(data)));
  apiProcess.stderr.on("data", (data) => apiLogs.push(String(data)));
  let healthy = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (apiProcess.exitCode !== null) throw Error(apiLogs.join(""));
    try {
      healthy = (await fetch(base + "/health")).ok;
    } catch {}
    if (healthy) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(healthy, apiLogs.join(""));
  assert.equal((await fetch(base + "/api/dashboard")).status, 401);
  assert.equal((await fetch(base + "/api/analysis")).status, 401);
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
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(base),
    },
  });
  server = await preview({
    root: resolve("frontend"),
    configFile: false,
    build: { outDir: resolve(".test-build") },
    preview: { host: "127.0.0.1", port: 4176, strictPort: true },
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    )
      errors.push(message.text());
  });
  page.on("response", (response) => {
    if (
      response.url().startsWith(base + "/api/") &&
      response.status() >= 400 &&
      !(expectedBadFile && response.url().endsWith("/api/import/inspect"))
    )
      failedRequests.push(response.url() + ": " + response.status());
  });
  page.on("requestfailed", (r) => {
    if (r.failure()?.errorText !== "net::ERR_ABORTED")
      failedRequests.push(r.url() + ": " + r.failure()?.errorText);
  });
  await page.route("https://test.supabase.co/**", (route) =>
    route.fulfill({
      json: {
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 3600,
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto(frontend);
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page
    .getByRole("heading", { name: "Belum ada data penjualan", exact: true })
    .waitFor();
  assert.deepEqual(
    await page.getByRole("navigation").getByRole("button").allTextContents(),
    ["Dashboard", "Data Penjualan", "Analisis"],
  );
  for (const name of ["Import Excel", "Tambah transaksi", "Unduh Excel"])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      0,
    );
  await page.getByRole("button", { name: "Analisis", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Belum ada data untuk dianalisis",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("button", { name: "Kelola Data Penjualan", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Data Penjualan", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('[aria-current="page"]').innerText(),
    "Data Penjualan",
  );
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  let modal = page.getByRole("dialog", { name: "Import Excel" });
  await modal
    .getByText("Pilih file .xlsx dari folder perangkat Anda. Maksimal 50 MB.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await modal.getByText(/Baris header|Header Row|Baris Judul Kolom/).count(),
    0,
  );
  // The focusable native input must open the chooser via keyboard and pointer,
  // without delegating to a synthetic click on a separate hidden element.
  const picker = modal.getByLabel("Pilih File Excel", { exact: true });
  await picker.focus();
  const keyboardEvent = page.waitForEvent("filechooser");
  await picker.press("Space");
  const keyboardChooser = await keyboardEvent;
  await keyboardChooser.setFiles([]);
  assert.equal((await state()).writes, 0);
  assert.ok(await modal.isVisible());
  assert.ok(
    await picker.evaluate((input) => {
      const box = input.getBoundingClientRect();
      return (
        document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        ) === input
      );
    }),
    "The visible picker area must target the native file input directly",
  );
  const chooserPromise = page.waitForEvent("filechooser");
  await picker.click();
  const chooser = await chooserPromise;
  const cell = (value) => ({ value });
  const headers = [
    "DATE",
    "SKU_DESC",
    "QTY_SALES",
    "UNIT PRICE",
    "UNIT COST",
    "STORE_NAME",
  ].map(cell);
  const rows = [
    [cell("Laporan PT Contoh")],
    [cell("Periode tahun " + year)],
    [],
    headers,
    [`${year}-01-10`, "Lensa", 2, 500000, 300000, "Bali"].map(cell),
    [`${year}-02-10`, "Frame", 1, 200000, 100000, "Jakarta"].map(cell),
    [`${year - 1}-01-10`, "Lensa", 1, 500000, 300000, "Bali"].map(cell),
  ];
  const buffer = await writeXlsxFile([
    { sheet: "Ringkasan", data: [[cell("Laporan saja")]] },
    {
      sheet: "PAYDAY_",
      data: [
        ["SKU_DESC", "REGION", "Sum of QTY_SALES"].map(cell),
        ["PAKET PAYDAY", "Makassar", 8].map(cell),
        ["PAKET PAYDAY", "Bali", 41].map(cell),
        ["Grand Total", null, 49].map(cell),
      ],
    },
    { sheet: "Detail Sales", data: rows },
    {
      sheet: "Kolom berbeda",
      data: [
        [
          "Waktu pembelian",
          "SKU_DESC",
          "QTY_SALES",
          "UNIT PRICE",
          "UNIT COST",
          "STORE_NAME",
        ].map(cell),
        ...rows.slice(4),
      ],
    },
    { sheet: "Kosong", data: [] },
  ]).toBuffer();
  await chooser.setFiles({
    name: "multi-sheet.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("Ringkasan");
  await modal.getByText(/Struktur data belum dapat dikenali/).waitFor();
  await modal.getByLabel("Pilih Sheet", { exact: true }).selectOption("Kosong");
  await modal.getByText(/Struktur data belum dapat dikenali/).waitFor();
  assert.equal((await state()).writes, 0);
  // Reading a pivot table must not be presented as a transaction-ready import.
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("PAYDAY_");
  await modal
    .getByText("Sheet berhasil dibaca, tetapi kolom transaksi belum lengkap", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(await modal.locator("[role=status] li").allTextContents(), [
    "Tanggal transaksi",
    "Harga jual aktual per unit",
    "HPP per unit",
  ]);
  assert.equal(
    await modal.getByText("✓ Struktur Data Dikenali", { exact: true }).count(),
    0,
  );
  assert.equal(
    await modal.getByLabel("Tanggal transaksi *", { exact: true }).count(),
    0,
  );
  assert.equal(
    await modal.getByRole("button", { name: /^Konfirmasi Import/ }).count(),
    0,
  );
  await modal
    .getByRole("button", { name: "Lihat isi sheet", exact: true })
    .click();
  await modal
    .getByRole("heading", { name: "Preview data Excel", exact: true })
    .waitFor();
  assert.equal(await modal.locator("tbody tr").count(), 3);
  assert.equal(await modal.locator("details").getAttribute("open"), null);
  await modal
    .getByRole("button", { name: "Sesuaikan kolom", exact: true })
    .click();
  assert.equal(
    await modal.getByLabel("Jumlah unit *", { exact: true }).inputValue(),
    "2",
  );
  assert.equal(
    await modal
      .getByRole("button", { name: "Periksa Data Transaksi", exact: true })
      .isEnabled(),
    false,
  );
  await mkdir("test-artifacts", { recursive: true });
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await modal.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `Incomplete import overflow ${width}`,
    );
    if (width === 390 || width === 1440) {
      await modal.evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.screenshot({
        path: `test-artifacts/import-incomplete-${width}.png`,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal
    .getByRole("button", { name: "Pilih sheet lain", exact: true })
    .click();
  assert.equal(
    await modal
      .getByLabel("Pilih Sheet", { exact: true })
      .evaluate((el) => document.activeElement === el),
    true,
  );
  assert.equal((await state()).writes, 0);
  // A real required column with an unfamiliar name can still be matched manually.
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("Kolom berbeda");
  await modal
    .getByText("Sheet berhasil dibaca, tetapi kolom transaksi belum lengkap", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(await modal.locator("[role=status] li").allTextContents(), [
    "Tanggal transaksi",
  ]);
  await modal
    .getByRole("button", { name: "Sesuaikan kolom", exact: true })
    .click();
  const dateMapping = modal.getByLabel("Tanggal transaksi *", { exact: true });
  const categoryMapping = modal.getByLabel("Kategori", { exact: true });
  const priceMapping = modal.getByLabel("Harga jual aktual per unit *", {
    exact: true,
  });
  const costMapping = modal.getByLabel("HPP per unit *", { exact: true });
  // Programmatic selection can bypass a native disabled option; the React
  // handler must reject the duplicate as well and retain the valid mapping.
  await costMapping.selectOption("3");
  assert.equal(await costMapping.inputValue(), "4");
  assert.equal(
    await costMapping.locator('option[value="3"]').getAttribute("disabled"),
    "",
  );
  assert.ok(
    (await costMapping.locator('option[value="3"]').textContent()).includes(
      "sudah dipakai untuk Harga jual aktual per unit",
    ),
  );
  assert.equal(
    await priceMapping.locator('option[value="3"]').getAttribute("disabled"),
    null,
  );
  assert.equal(
    await categoryMapping.locator('option[value="1"]').getAttribute("disabled"),
    "",
  );
  // An optional field can release a column required by a different field.
  await categoryMapping.selectOption("0");
  assert.equal(
    await dateMapping.locator('option[value="0"]').getAttribute("disabled"),
    "",
  );
  assert.ok(
    (await dateMapping.locator('option[value="0"]').textContent()).includes(
      "sudah dipakai untuk Kategori",
    ),
  );
  assert.equal(
    await modal
      .getByRole("button", { name: "Periksa Data Transaksi", exact: true })
      .isEnabled(),
    false,
  );
  assert.equal((await state()).writes, 0);
  await categoryMapping.selectOption("");
  assert.equal(
    await dateMapping.locator('option[value="0"]').getAttribute("disabled"),
    null,
  );
  await modal
    .getByLabel("Tanggal transaksi *", { exact: true })
    .selectOption("0");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal.getByText("3 baris transaksi valid", { exact: true }).waitFor();
  assert.equal((await state()).writes, 0);
  // Switching sheets invalidates the old preview and confirmation.
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("Detail Sales");
  await modal.getByText("✓ Struktur Data Dikenali", { exact: true }).waitFor();
  assert.equal(
    await modal.getByRole("button", { name: /^Konfirmasi Import/ }).count(),
    0,
  );
  assert.equal((await state()).writes, 0);
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal.getByText("3 baris transaksi valid", { exact: true }).waitFor();
  assert.equal(await modal.locator("tbody tr").count(), 3);
  assert.equal(
    await modal.locator("tbody tr").first().locator("td").nth(1).innerText(),
    "Lensa",
  );
  assert.equal((await state()).writes, 0);
  const commit = modal.getByRole("button", {
    name: "Konfirmasi Import 3 transaksi",
    exact: true,
  });
  assert.equal(await commit.isEnabled(), false);
  await mkdir("test-artifacts", { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await modal.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `Import overflow ${width}`,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({ path: `test-artifacts/import-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await modal.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal((await state()).writes, 0);
  assert.equal(await modal.count(), 0);
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Import Excel" });
  const droppedFile = await page.evaluateHandle((bytes) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([new Uint8Array(bytes)], "drag-drop.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    return transfer;
  }, Array.from(buffer));
  await modal
    .getByTestId("excel-dropzone")
    .dispatchEvent("drop", { dataTransfer: droppedFile });
  await droppedFile.dispose();
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("Detail Sales");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal.getByText("3 baris transaksi valid", { exact: true }).waitFor();
  assert.equal(
    (await state()).writes,
    0,
    "Dropping a file and previewing must never save data",
  );
  await modal.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Import Excel" });
  expectedBadFile = true;
  await modal.locator("input[type=file]").setInputFiles({
    name: "bad.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("invalid"),
  });
  await modal.getByText(/File bukan Excel/).waitFor();
  expectedBadFile = false;
  assert.equal((await state()).writes, 0);
  await modal.locator("input[type=file]").setInputFiles({
    name: "multi.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("Detail Sales");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal.getByText("3 baris transaksi valid", { exact: true }).waitFor();
  await modal.getByRole("checkbox").check();
  await modal
    .getByRole("button", { name: "Konfirmasi Import 3 transaksi", exact: true })
    .click();
  await page.getByText(/Impor berhasil/).waitFor();
  assert.equal((await state()).writes, 1);
  assert.equal((await state()).refraksi_sales.length, 3);
  assert.equal(
    await page.getByRole("region", { name: "Ringkasan keuangan" }).count(),
    0,
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh Excel", exact: true }).click();
  const downloaded = await downloadEvent;
  const downloadPath = resolve("test-artifacts/export.xlsx");
  await downloaded.saveAs(downloadPath);
  const exported = await readXlsxFile(downloadPath, { sheet: "Sales" });
  assert.equal(exported.length, 3); // Current year filter excludes previous year.
  // Verify table search, numeric sorting and pagination with isolated test records.
  const zeroIds = [];
  for (let index = 0; index < 11; index++) {
    const response = await fetch(base + "/api/sales", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        date: `${year}-01-01`,
        product: `Pagination ${index}`,
        quantity: 1,
        price: "0",
        unit_cost: "0",
      }),
    });
    zeroIds.push((await response.json())[0].id);
  }
  await page
    .getByRole("button", { name: "Muat ulang data", exact: true })
    .click();
  await page.getByText(/13 baris · Halaman 1 dari 2/).waitFor();
  await page
    .getByRole("button", { name: "Halaman berikutnya", exact: true })
    .first()
    .click();
  await page.getByText(/Halaman 2 dari 2/).waitFor();
  await page.getByLabel("Cari transaksi", { exact: true }).fill("Lensa");
  assert.equal(
    await page
      .getByRole("region", { name: "Tabel penjualan", exact: true })
      .locator("tbody tr")
      .count(),
    1,
  );
  await page.getByLabel("Cari transaksi", { exact: true }).fill("");
  const salesTable = page.getByRole("region", {
    name: "Tabel penjualan",
    exact: true,
  });
  await salesTable
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  await salesTable
    .getByRole("button", { name: "Penjualan", exact: true })
    .click();
  assert.ok(
    (await salesTable.locator("tbody tr").first().innerText()).includes(
      "Lensa",
    ),
  );
  for (const id of zeroIds)
    await fetch(base + "/api/sales/" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer test-access" },
    });
  await page
    .getByRole("button", { name: "Muat ulang data", exact: true })
    .click();
  await page.getByText(/2 baris · Halaman 1 dari 1/).waitFor();
  await page
    .getByRole("button", { name: "Tambah transaksi", exact: true })
    .click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Pelanggan", { exact: true }).fill("Uji");
  await editor.getByLabel("Produk", { exact: true }).fill("Produk CRUD");
  await editor
    .getByLabel("Harga jual aktual per unit (Rp)", { exact: true })
    .fill("100");
  await editor.getByLabel("HPP per unit (Rp)", { exact: true }).fill("50");
  await editor
    .getByRole("button", { name: "Simpan data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Produk CRUD", exact: true })
    .click();
  await editor.getByLabel("Jumlah unit", { exact: true }).fill("2");
  await editor
    .getByRole("button", { name: "Simpan data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Hapus Produk CRUD", exact: true })
    .waitFor();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Hapus Produk CRUD", exact: true })
    .click();
  await page.getByText("Data berhasil dihapus.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("region", { name: "Ringkasan keuangan" }).waitFor();
  assert.ok(
    (
      await page.getByRole("region", { name: "Ringkasan keuangan" }).innerText()
    ).includes("1.200.000"),
  );
  for (const name of ["Import Excel", "Tambah transaksi", "Unduh Excel"])
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      0,
    );
  await page.getByRole("button", { name: "Analisis", exact: true }).click();
  await page
    .getByRole("heading", { name: "Profitabilitas Produk", exact: true })
    .waitFor();
  assert.equal(
    await page.getByText("Data berhasil dihapus.", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("region", { name: "Ringkasan keuangan" }).count(),
    0,
  );
  assert.ok(
    (
      await page.getByRole("region", { name: "Ringkasan analisis" }).innerText()
    ).includes("140%"),
  );
  await page.getByLabel("Bulan", { exact: true }).selectOption("2");
  await page
    .getByRole("region", { name: "Tabel profitabilitas produk" })
    .getByRole("cell", { name: "Frame", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("region", { name: "Tabel profitabilitas produk" })
      .locator("tbody tr")
      .count(),
    1,
  );
  assert.ok(
    (
      await page.getByRole("region", { name: "Ringkasan analisis" }).innerText()
    ).includes("-80%"),
  );
  await page
    .getByLabel("Cabang / Lokasi", { exact: true })
    .selectOption("Bali");
  await page
    .getByRole("heading", {
      name: "Belum ada data untuk dianalisis",
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Reset Filter", exact: true }).click();
  await page
    .getByRole("heading", { name: "Kontribusi Produk", exact: true })
    .waitFor();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Page overflow ${width}`,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-artifacts/analysis-${width}.png`,
        fullPage: true,
      });
  }
  // Dated recaps use a dedicated business preview, not transaction-column mapping.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Data Penjualan", exact: true })
    .click();
  const beforeReport = await state();
  const realSource = process.env.REFRAKSI_SOURCE_FOLDER;
  const reportBuffer = realSource
    ? await readFile(resolve(realSource, "REPORT SALES DOUBLE DATE.xlsx"))
    : Buffer.from(
        await (await fetch(base + "/test/report-file")).arrayBuffer(),
      );
  const reportFile = {
    name: "dated-report.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: reportBuffer,
  };
  const goodSheet = realSource ? "DOUBLE DATE MARET" : "Detail Maret";
  const reportCount = realSource ? 47 : 1;
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Import Excel" });
  await modal.locator("input[type=file]").setInputFiles(reportFile);
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption(goodSheet);
  await modal
    .getByRole("heading", { name: "✓ Laporan penjualan dikenali", exact: true })
    .waitFor();
  assert.equal(
    await modal.getByLabel("Tanggal transaksi *", { exact: true }).count(),
    0,
  );
  const reportYear = modal.getByLabel("Tahun laporan", { exact: true });
  await reportYear.fill("2026");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal
    .getByText(
      `${reportCount} baris siap diimpor tanpa mengubah total penjualan dan HPP`,
      { exact: true },
    )
    .waitFor();
  assert.equal((await state()).writes, beforeReport.writes);
  const reportCommit = modal.getByRole("button", {
    name: `Konfirmasi Import ${reportCount} baris laporan`,
    exact: true,
  });
  assert.equal(await reportCommit.isEnabled(), false);
  await reportYear.fill("2025");
  assert.equal(
    await modal
      .getByRole("heading", { name: "Preview laporan penjualan", exact: true })
      .count(),
    0,
  );
  assert.equal(await reportCommit.count(), 0);
  await reportYear.fill("2026");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await reportCommit.waitFor();
  // Changing the file must clear the previous valid preview and its confirmation.
  const badReport = realSource
    ? reportBuffer
    : Buffer.from(
        await (
          await fetch(base + "/test/report-file?precision=true")
        ).arrayBuffer(),
      );
  await modal.locator("input[type=file]").setInputFiles({
    ...reportFile,
    name: "report-precision.xlsx",
    buffer: badReport,
  });
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption(realSource ? "DOUBLE DATE OKTOBER" : "Detail Maret");
  await modal
    .getByRole("heading", { name: "✓ Laporan penjualan dikenali", exact: true })
    .waitFor();
  assert.equal(await reportCommit.count(), 0);
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal
    .getByText("Preview tersedia, tetapi laporan belum dapat disimpan", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await modal.getByRole("button", { name: /^Konfirmasi Import/ }).count(),
    0,
  );
  assert.ok(
    (await modal.getByRole("alert").innerText()).includes(
      "HPP sumber memiliki lebih dari dua desimal",
    ),
  );
  assert.equal((await state()).writes, beforeReport.writes);
  await modal.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal((await state()).writes, beforeReport.writes);
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Import Excel" });
  await modal.locator("input[type=file]").setInputFiles(reportFile);
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption(goodSheet);
  await modal
    .getByRole("heading", { name: "✓ Laporan penjualan dikenali", exact: true })
    .waitFor();
  await modal.getByLabel("Tahun laporan", { exact: true }).fill("2026");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal
    .getByText(
      `${reportCount} baris siap diimpor tanpa mengubah total penjualan dan HPP`,
      { exact: true },
    )
    .waitFor();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await modal.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `Report overflow ${width}`,
    );
    if (width === 390 || width === 1440) {
      await modal.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await page.screenshot({
        path: `test-artifacts/report-import-${width}.png`,
      });
    }
  }
  await modal.getByRole("checkbox").check();
  await modal
    .getByRole("button", {
      name: `Konfirmasi Import ${reportCount} baris laporan`,
      exact: true,
    })
    .click();
  await page.getByText(/Impor berhasil/).waitFor();
  const afterReport = await state();
  assert.equal(afterReport.writes, beforeReport.writes + 1);
  assert.equal(
    afterReport.refraksi_sales.length,
    beforeReport.refraksi_sales.length + reportCount,
  );
  const addedReport = afterReport.refraksi_sales.slice(
    beforeReport.refraksi_sales.length,
  );
  assert.ok(addedReport.every((row) => row.date === "2026-03-03"));
  assert.equal(
    addedReport.reduce((sum, row) => sum + Number(row.price) * row.quantity, 0),
    realSource ? 11541000 : 20001,
  );
  // Already-imported reports must be identified during preview, without a
  // second save attempt or a misleading ready-to-import status.
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  modal = page.getByRole("dialog", { name: "Import Excel" });
  await modal.locator("input[type=file]").setInputFiles(reportFile);
  await modal
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption(goodSheet);
  await modal
    .getByRole("heading", { name: "✓ Laporan penjualan dikenali", exact: true })
    .waitFor();
  await modal.getByLabel("Tahun laporan", { exact: true }).fill("2026");
  await modal
    .getByRole("button", { name: "Periksa Data", exact: true })
    .click();
  await modal
    .getByText("Laporan ini sudah tersimpan", { exact: true })
    .waitFor();
  assert.equal(
    await modal.getByRole("button", { name: /^Konfirmasi Import/ }).count(),
    0,
  );
  assert.equal((await state()).writes, afterReport.writes);
  await modal.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Selamat datang", exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  console.log(
    `PASS: real FastAPI Excel inspection/preview/commit and analysis; dated report preview/commit (${realSource ? "actual Maret workbook, 47 rows" : "fixture workbook"}), precision blocking, year/file reset; empty states, sidebar, native file chooser, cancellation, CRUD, filtered export, read-only dashboard/analysis, comparison, filters, responsive 320–1440px, logout. Isolated storage and mocked Supabase Auth; no production data changed.`,
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await mkdir("test-artifacts", { recursive: true });
    await page
      .screenshot({ path: "test-artifacts/failure.png", fullPage: true })
      .catch(() => {});
    console.error(
      "UI diagnostic:",
      await page
        .locator("body")
        .innerText()
        .catch(() => "unavailable"),
    );
  }
  console.error(
    "Console:",
    errors,
    "Failed requests:",
    failedRequests,
    "API:",
    apiLogs.join(""),
  );
  throw error;
} finally {
  await browser?.close();
  await server?.httpServer.close();
  apiProcess?.kill("SIGTERM");
}
