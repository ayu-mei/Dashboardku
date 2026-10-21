import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build, preview } from "vite";
import { chromium } from "playwright";
const directory = await mkdtemp(join(tmpdir(), "refraksi-source-ui-"));
const base = "http://127.0.0.1:4184",
  url = "http://127.0.0.1:4185";
let apiProcess, server, browser;
const logs = [],
  errors = [];
const state = async () => (await fetch(base + "/test/state")).json();
try {
  apiProcess = spawn(
    resolve(".venv/bin/python"),
    [
      "-m",
      "uvicorn",
      "fixture_api:app",
      "--app-dir",
      "tests",
      "--host",
      "127.0.0.1",
      "--port",
      "4184",
    ],
    {
      cwd: resolve("backend"),
      env: { ...process.env, ALLOWED_ORIGINS: url },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  apiProcess.stderr.on("data", (data) => logs.push(String(data)));
  apiProcess.stdout.on("data", (data) => logs.push(String(data)));
  let healthy = false;
  for (let i = 0; i < 100; i++) {
    if (apiProcess.exitCode !== null) throw Error(logs.join(""));
    try {
      const response = await fetch(base + "/health");
      healthy = response.ok;
      if (!healthy && i < 3)
        logs.push(`Health: ${response.status} ${await response.text()}`);
    } catch (error) {
      if (i < 3) logs.push(error.message + ": " + error.cause?.message);
    }
    if (healthy) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(healthy, logs.join(""));
  await build({
    root: resolve("frontend"),
    configFile: resolve("frontend/vite.config.js"),
    build: { outDir: directory, emptyOutDir: true },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://source-ui-test.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_test",
      ),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(base),
    },
  });
  server = await preview({
    root: resolve("frontend"),
    configFile: false,
    build: { outDir: directory },
    preview: { host: "127.0.0.1", port: 4185, strictPort: true },
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await page.route("https://source-ui-test.supabase.co/**", (route) =>
    route.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 7200,
        user: { id: "test-user" },
      },
    }),
  );
  await page.goto(url);
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByRole("button", { name: "Data Bisnis", exact: true }).click();
  async function choose(kind) {
    await page
      .getByRole("button", { name: "Import Excel", exact: true })
      .click();
    const buffer = Buffer.from(
      await (
        await fetch(base + "/test/source-file?kind=" + kind)
      ).arrayBuffer(),
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: `${kind}.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
  }
  await choose("master");
  await page
    .getByRole("heading", { name: "Master produk dikenali", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText(
        "Sheet berhasil dibaca, tetapi kolom transaksi belum lengkap",
        { exact: true },
      )
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Periksa Data", exact: true }).click();
  await page.getByRole("table", { name: "Preview data sumber" }).waitFor();
  assert.equal((await state()).writes, 0);
  await page
    .getByRole("button", { name: "Konfirmasi Import 1 baris", exact: true })
    .isDisabled()
    .then((value) => assert.ok(value));
  await page.getByLabel(/Saya menyetujui jenis data/).check();
  await page
    .getByRole("button", { name: "Konfirmasi Import 1 baris", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal((await state()).refraksi_sources[0].kind, "master");
  await choose("recap");
  await page.getByLabel("Pilih Sheet", { exact: true }).selectOption("SUMMARY");
  await page
    .getByRole("heading", {
      name: "Ringkasan / referensi dikenali",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Periksa Data", exact: true })
      .count(),
    0,
  );
  await page
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("DETAIL SALES");
  await page
    .getByRole("heading", { name: "Rekap penjualan dikenali", exact: true })
    .waitFor();
  await page.getByLabel("Tahun laporan", { exact: true }).fill("2026");
  await page.getByLabel("Awal periode", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Akhir periode", { exact: true }).fill("2026-01-31");
  await page.getByRole("button", { name: "Periksa Data", exact: true }).click();
  await page.getByRole("table", { name: "Preview data sumber" }).waitFor();
  assert.equal((await state()).writes, 1);
  await page.getByLabel(/Saya menyetujui jenis data/).check();
  await page
    .getByRole("button", { name: "Konfirmasi Import 1 baris", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .getByRole("button", { name: "Smart Dashboard", exact: true })
    .click();
  const summary = page.getByRole("region", { name: "Ringkasan keuangan" });
  await page
    .getByRole("heading", { name: "Smart Dashboard", exact: true })
    .waitFor();
  await page
    .getByRole("status")
    .filter({ hasText: /HPP belum lengkap pada 1 baris/ })
    .waitFor();
  await page.getByRole("button", { name: "Analisis", exact: true }).click();
  await page
    .getByRole("heading", { name: "Analisis Penjualan", exact: true })
    .waitFor();
  await page
    .getByText(/Omzet tetap tersedia; laba dan peringkat profit/)
    .waitFor();
  await page.getByRole("button", { name: "Data Bisnis", exact: true }).click();
  await choose("claim");
  await page
    .getByRole("heading", { name: "Rafaksi supplier dikenali", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Periksa Data", exact: true }).click();
  await page.getByRole("table", { name: "Preview data sumber" }).waitFor();
  await page.getByLabel(/Saya menyetujui jenis data/).check();
  await page
    .getByRole("button", { name: "Konfirmasi Import 1 baris", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const response = await fetch(base + "/api/dashboard?year=2026", {
    headers: { Authorization: "Bearer test-access" },
  });
  const report = await response.json();
  assert.equal(report.metrics.sales, "100");
  assert.equal(report.metrics.hpp, null);
  assert.equal(report.expenses.length, 0);
  assert.equal(report.sources.length, 3);
  const manualResponse = await fetch(base + "/api/sales", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-access",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      date: "2026-01-15",
      product: "Produk Manual",
      quantity: 2,
      price: "250",
      unit_cost: "100",
    }),
  });
  assert.ok(manualResponse.ok);
  const [manual] = await manualResponse.json();
  await page
    .getByRole("button", { name: "Muat ulang data", exact: true })
    .click();
  const combined = page.getByRole("region", {
    name: "Tabel penjualan",
    exact: true,
  });
  await combined
    .getByRole("row")
    .filter({ hasText: "Produk Manual" })
    .waitFor();
  const recapRow = combined
    .getByRole("row")
    .filter({ hasText: "DETAIL SALES" });
  assert.equal(await recapRow.getByRole("checkbox").count(), 0);
  assert.equal(await recapRow.getByText("Rekap", { exact: true }).count(), 1);
  assert.ok((await recapRow.innerText()).includes("2026-01-01 – 2026-01-31"));
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({
    path: "test-artifacts/data-business-combined.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "combined sales overflow on mobile",
  );
  assert.equal(
    await page.getByRole("tab", { name: "Biaya", exact: true }).count(),
    0,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Pilih semua hasil filter", exact: true })
    .click();
  assert.equal(
    await combined.getByRole("checkbox", { checked: true }).count(),
    2,
  ); // header plus manual; no recap checkbox
  const deletion = page.waitForRequest((r) =>
    r.url().includes("/api/sales/bulk-delete"),
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Hapus terpilih (1)", exact: true })
    .click();
  assert.deepEqual((await deletion).postDataJSON().ids, [manual.id]);
  await combined
    .getByText("Produk Manual", { exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    (await state()).refraksi_sources.filter((s) => s.kind === "sales_recap")
      .length,
    1,
  );
  await combined
    .getByRole("button", { name: "Lihat sumber", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Rekap penjualan · DETAIL SALES",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Biaya", exact: true }).count(),
    0,
  );

  await choose("master");
  await page.getByRole("button", { name: "Periksa Data", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Data yang sama sudah tersimpan" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Konfirmasi Import 1 baris", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await page.getByRole("tab", { name: "Riwayat Impor", exact: true }).count(),
    0,
  );
  const sourcePanel = page.getByRole("region", { name: "Data sumber impor" });
  // Capture visible source management and importer at a small viewport too.
  await mkdir("test-artifacts/source-import", { recursive: true });
  await page.screenshot({
    path: "test-artifacts/source-import/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await choose("master");
  await page
    .getByRole("heading", { name: "Master produk dikenali", exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.getBoundingClientRect().width <= window.innerWidth),
  );
  await page.screenshot({
    path: "test-artifacts/source-import/mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  const row = page
    .locator('section[aria-label="Data sumber impor"] tr')
    .filter({ hasText: "DETAIL SALES" });
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Hapus impor", exact: true }).click();
  await row.waitFor({ state: "detached" });
  assert.equal(
    (await state()).refraksi_sources.filter(
      (item) => item.kind === "sales_recap",
    ).length,
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: actual API/parser + isolated fixtures; master, recap and rafaksi imports; summary protection; explicit confirmation; missing HPP; dashboard/analysis; duplicate blocking; source deletion; desktop/mobile. No production data changed.",
  );
} catch (error) {
  console.error(logs.join(""));
  throw error;
} finally {
  await browser?.close();
  await server?.httpServer.close();
  apiProcess?.kill();
  await rm(directory, { recursive: true, force: true });
}
