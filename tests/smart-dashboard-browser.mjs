import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build, preview } from "vite";
import { chromium } from "playwright";
const directory = await mkdtemp(join(tmpdir(), "refraksi-smart-ui-"));
const base = "http://127.0.0.1:4192",
  url = "http://127.0.0.1:4193";
let processApi, server, browser;
const logs = [],
  errors = [];
try {
  processApi = spawn(
    resolve(".venv/bin/python"),
    [
      "-m",
      "uvicorn",
      "smart_fixture_api:app",
      "--app-dir",
      "tests",
      "--host",
      "127.0.0.1",
      "--port",
      "4192",
    ],
    {
      cwd: resolve("backend"),
      env: { ...process.env, ALLOWED_ORIGINS: url },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  processApi.stderr.on("data", (d) => logs.push(String(d)));
  processApi.stdout.on("data", (d) => logs.push(String(d)));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      ready = (await fetch(base + "/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready, logs.join(""));
  await fetch(base + "/test/smart-seed", { method: "POST" });
  await build({
    root: resolve("frontend"),
    configFile: resolve("frontend/vite.config.js"),
    build: { outDir: directory, emptyOutDir: true },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://smart-ui-test.supabase.co",
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
    preview: { host: "127.0.0.1", port: 4193, strictPort: true },
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.route("https://smart-ui-test.supabase.co/**", (r) =>
    r.fulfill({
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
  const navigation = page.getByRole("navigation", { name: "Navigasi utama" });
  await navigation
    .getByRole("button", { name: "Smart Dashboard", exact: true })
    .waitFor();
  assert.deepEqual(await navigation.getByRole("button").allTextContents(), [
    "Smart Dashboard",
    "Data Bisnis",
    "Analisis",
  ]);
  assert.equal(
    await navigation
      .getByRole("button", { name: "Smart Dashboard", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
  await page.getByTestId("time-chart").waitFor();
  assert.equal(
    await page.getByRole("tab", { name: "Simulasi", exact: true }).count(),
    0,
  );
  const yearSelect = page.getByLabel("Tahun", { exact: true });
  await yearSelect.click();
  if (await page.evaluate(() => CSS.supports("appearance", "base-select"))) {
    await page.getByRole("option", { name: "2026", exact: true }).waitFor();
    assert.equal(
      await yearSelect.evaluate(
        (el) => getComputedStyle(el, "::picker(select)").borderRadius,
      ),
      "14px",
    );
    await mkdir("test-artifacts", { recursive: true });
    await page.screenshot({ path: "test-artifacts/dropdown-desktop.png" });
    await page.getByRole("option", { name: "2026", exact: true }).click();
    await yearSelect.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    assert.equal(await yearSelect.evaluate((el) => el.matches(":open")), false);
  } else {
    await page.keyboard.press("Escape");
  }
  assert.equal(
    await page.getByLabel("Dari tanggal", { exact: true }).isVisible(),
    false,
  );
  await page.getByText("Filter lainnya", { exact: false }).click();
  await page
    .getByLabel("Cabang / Lokasi", { exact: true })
    .selectOption("Bali");
  await page
    .getByRole("button", { name: "Hapus filter Lokasi", exact: true })
    .click();
  await page.getByText("Filter lainnya", { exact: false }).click();
  await page
    .getByRole("heading", { name: "Ada transaksi yang tampak sama" })
    .waitFor();
  await page
    .getByRole("button", { name: "Ringkasan bisnis", exact: true })
    .click();
  await page
    .getByText("Penjualan pada filter pilihan: 7000.", { exact: false })
    .waitFor();
  assert.ok(
    await page.getByTestId("time-chart").isVisible(),
    "chart must remain visible with AI response",
  );
  const graphBox = await page.getByTestId("time-chart").boundingBox();
  const assistantBox = await page
    .getByRole("region", { name: "Tanya AI", exact: true })
    .boundingBox();
  assert.ok(
    assistantBox.x > graphBox.x + graphBox.width,
    "AI panel should sit beside charts on desktop",
  );
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Tampilkan September tahun 2026");
  let releaseReply;
  const replyGate = new Promise((resolve) => {
    releaseReply = resolve;
  });
  await page.route(base + "/api/smart/ask?*", async (route) => {
    const response = await route.fetch();
    await replyGate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Pertanyaan berikutnya yang sedang disiapkan");
  releaseReply();

  await page
    .getByText("Usulan filter: September 2026", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Pertanyaan berikutnya yang sedang disiapkan",
  );
  await page.unroute(base + "/api/smart/ask?*");
  await page
    .getByRole("button", { name: "Terapkan filter usulan", exact: true })
    .click();
  await page.getByRole("button", { name: "Buat laporan", exact: true }).click();
  await page
    .getByText("Penjualan pada filter pilihan: 2000.", { exact: false })
    .waitFor();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh jawaban / laporan", exact: true })
    .click();
  assert.equal(
    (await downloaded).suggestedFilename(),
    "laporan-smart-dashboard.txt",
  );
  await page.route(base + "/api/smart/ask?*", (r) =>
    r.fulfill({ status: 429, json: { detail: "Batas AI uji tercapai." } }),
  );
  await page
    .getByRole("button", { name: "Rekomendasi tindakan", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Batas AI uji tercapai." })
    .waitFor();
  await page.unroute(base + "/api/smart/ask?*");
  await page
    .getByRole("button", { name: "Ringkasan bisnis", exact: true })
    .click();
  await page
    .getByText("Penjualan pada filter pilihan: 2000.", { exact: false })
    .last()
    .waitFor();
  await mkdir("test-artifacts", { recursive: true });
  await page.screenshot({
    path: "test-artifacts/smart-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  if (
    await page
      .getByRole("button", { name: "Tutup panel AI", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Tutup panel AI", exact: true })
      .click();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "mobile horizontal overflow",
  );
  const metricPosition = await page
    .getByRole("region", { name: "Ringkasan keuangan" })
    .boundingBox();
  assert.ok(
    metricPosition.y < 500,
    "financial metrics should appear near the top on mobile",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "no mobile overflow",
  );
  await page.screenshot({
    path: "test-artifacts/smart-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Tanya AI", exact: true }).click();
  assert.ok(
    await page
      .getByRole("region", { name: "Tanya AI", exact: true })
      .isVisible(),
  );
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Buat resep nasi goreng untuk dashboard");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page
    .getByText("Saya hanya membantu terkait dashboard Refraksi:", {
      exact: false,
    })
    .waitFor();
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Produk mana yang paling laku pada dashboard ini?");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page
    .getByText("Penjualan pada filter pilihan: 2000.", { exact: false })
    .last()
    .waitFor();
  await page.setViewportSize({ width: 390, height: 500 });
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  const composer = await page
    .getByRole("button", { name: "Kirim", exact: true })
    .boundingBox();
  assert.ok(
    composer.y >= 0 && composer.y + composer.height <= 500,
    "mobile composer must remain visible in a short viewport",
  );
  assert.ok(
    (await page.getByRole("log", { name: "Percakapan AI" }).boundingBox())
      .height >= 120,
    "short mobile viewport should leave room to read the response",
  );
  await page.screenshot({
    path: "test-artifacts/smart-mobile-chat.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Tutup panel AI", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("region", { name: "Tanya AI", exact: true })
      .isVisible(),
    false,
  );
  assert.ok(await page.getByTestId("time-chart").isVisible());
  await page
    .getByRole("button", { name: "Periksa data sumber", exact: false })
    .click();
  await page.getByRole("button", { name: "Import Excel", exact: true }).click();
  const file = Buffer.from(
    await (await fetch(base + "/test/source-file?kind=recap")).arrayBuffer(),
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "recap.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: file,
  });
  await page
    .getByLabel("Pilih Sheet", { exact: true })
    .selectOption("DETAIL SALES");
  await page
    .getByRole("button", { name: "Jelaskan & sarankan kolom", exact: true })
    .click();
  await page
    .getByText("Periksa tanggal, jumlah dan nilai total pada header sumber.", {
      exact: false,
    })
    .waitFor();
  assert.equal((await (await fetch(base + "/test/state")).json()).writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS smart dashboard: owner-scoped API, summary, explicit filter application, report download, provider error, mobile, Excel assistance; zero data mutations.",
  );
} finally {
  await browser?.close();
  await server?.httpServer.close();
  processApi?.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
