import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, readFile } from "node:fs/promises";
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
  let authUserId = "test-user";
  await page.route("https://smart-ui-test.supabase.co/**", (r) =>
    r.fulfill({
      headers: { "Access-Control-Allow-Origin": "*" },
      json: {
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 7200,
        user: { id: authUserId },
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
  for (const name of [
    "Ringkasan bisnis",
    "Rekomendasi tindakan",
    "Buat laporan",
  ]) {
    assert.equal(
      await page.getByRole("button", { name, exact: true }).count(),
      0,
    );
  }
  assert.equal(
    await page
      .getByRole("dialog", { name: "Tanya Yuwi", exact: true })
      .isVisible(),
    false,
  );
  const widthBeforeHide = await page
    .locator("main")
    .evaluate((el) => el.getBoundingClientRect().width);
  await page
    .getByRole("button", { name: "Sembunyikan navigasi", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector("#dashboard-navigation").getBoundingClientRect()
        .right <= 1,
  );
  assert.ok(
    (await page
      .locator("main")
      .evaluate((el) => el.getBoundingClientRect().width)) >
      widthBeforeHide + 200,
  );
  assert.equal(
    await page.locator("#dashboard-navigation").evaluate((el) => el.inert),
    true,
  );
  await page
    .getByRole("button", { name: "Tampilkan navigasi", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector("main").getBoundingClientRect().left - 240,
      ) < 1,
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
  if (
    !(await page
      .getByRole("dialog", { name: "Tanya Yuwi", exact: true })
      .isVisible())
  ) {
    await page.getByRole("button", { name: "Tanya Yuwi", exact: true }).click();
  }
  await page.getByLabel("Pertanyaan untuk AI").fill("Ringkas penjualan saya");
  await page.getByLabel("Pertanyaan untuk AI").press("Enter");
  await page
    .getByText("Penjualan pada filter pilihan: 7000.", { exact: false })
    .waitFor();
  assert.ok(
    await page.getByTestId("time-chart").isVisible(),
    "chart must remain visible with AI response",
  );
  assert.equal(await page.locator(".yuwi-message-name").count(), 0);
  assert.ok(
    await page
      .getByRole("columnheader", { name: "Keterangan" })
      .first()
      .isVisible(),
  );
  assert.ok(
    await page
      .getByRole("cell", { name: "Rp7.000", exact: true })
      .first()
      .isVisible(),
  );
  assert.equal(await page.locator(".ai-answer-table script").count(), 0);
  assert.match(
    await page.getByTestId("ai-duration").first().textContent(),
    /Diproses dalam \d+ (detik|menit)/,
  );
  assert.equal(
    await page
      .locator(".yuwi-user time")
      .first()
      .evaluate((el) => getComputedStyle(el).display),
    "inline-block",
  );
  const assistantBox = await page
    .getByRole("dialog", { name: "Tanya Yuwi", exact: true })
    .boundingBox();
  assert.ok(
    assistantBox.width <= 440,
    "chat panel should leave room for charts",
  );
  const chartBox = await page.getByTestId("time-chart").boundingBox();
  assert.ok(
    chartBox.x + chartBox.width <= assistantBox.x,
    "desktop chat must not cover the chart",
  );
  assert.equal(
    await page.locator("#smart-chat").evaluate((el) => el.matches(":modal")),
    false,
    "desktop dashboard must remain interactive",
  );
  assert.equal(await page.locator("#open-smart-chat img").count(), 1);
  const chatInput = page.getByLabel("Pertanyaan untuk AI");
  const repliesBefore = await page
    .getByRole("log", { name: "Percakapan AI" })
    .locator("article")
    .count();
  await chatInput.fill("Pesan singkat");
  const shortInputHeight = (await chatInput.boundingBox()).height;
  assert.ok(
    shortInputHeight <= 46,
    "short messages use a compact one-line composer",
  );
  await chatInput.fill(
    "Baris pertama\nBaris kedua\nBaris ketiga\nBaris keempat",
  );
  assert.ok(
    (await chatInput.boundingBox()).height > shortInputHeight,
    "multiline messages expand the composer",
  );
  await chatInput.fill(Array(20).fill("Pesan panjang").join("\n"));
  assert.ok(
    (await chatInput.boundingBox()).height <= 120,
    "composer height is capped",
  );
  await chatInput.fill("");
  assert.equal(
    (await chatInput.boundingBox()).height,
    shortInputHeight,
    "clearing the draft shrinks the composer",
  );
  await chatInput.fill("Bandingkan penjualan");
  await chatInput.press("Shift+Enter");
  assert.equal(await chatInput.inputValue(), "Bandingkan penjualan\n");
  assert.equal(
    await page
      .getByRole("log", { name: "Percakapan AI" })
      .locator("article")
      .count(),
    repliesBefore,
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
  await page.getByLabel("Pertanyaan untuk AI").press("Enter");
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "",
    "composer clears before the AI response arrives",
  );
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Pertanyaan berikutnya yang sedang disiapkan");
  const panelBeforeExpand = await page.locator("#smart-chat").boundingBox();
  await page
    .getByRole("button", { name: "Perbesar chat", exact: true })
    .click();
  const expandedPanel = await page.locator("#smart-chat").boundingBox();
  assert.ok(expandedPanel.width > panelBeforeExpand.width * 1.5);
  await page
    .getByRole("button", { name: "Sembunyikan navigasi", exact: true })
    .click();
  await page.waitForFunction(() => {
    const workspace = document
      .getElementById("smart-panel-summary")
      .getBoundingClientRect();
    const chat = document.getElementById("smart-chat").getBoundingClientRect();
    return (
      workspace.left < 40 &&
      Math.abs(workspace.left - chat.left) < 2 &&
      Math.abs(workspace.width - chat.width) < 2
    );
  });
  await page
    .getByRole("button", { name: "Tampilkan navigasi", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.getElementById("smart-chat").getBoundingClientRect().left >= 271,
  );

  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Pertanyaan berikutnya yang sedang disiapkan",
  );
  assert.ok(
    await page
      .getByRole("button", { name: "Hentikan", exact: true })
      .isVisible(),
  );
  await page.screenshot({ path: "test-artifacts/yuwi-maximized.png" });
  await page
    .getByRole("button", { name: "Kembalikan ukuran chat", exact: true })
    .click();
  assert.ok(
    Math.abs(
      (await page.locator("#smart-chat").boundingBox()).width -
        panelBeforeExpand.width,
    ) < 2,
  );
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Pertanyaan berikutnya yang sedang disiapkan",
  );
  releaseReply();

  await page.waitForFunction(
    () => !document.querySelector('[role="log"][aria-busy="true"]'),
  );
  assert.equal(
    await page.getByText("Usulan filter:", { exact: false }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Terapkan filter usulan" }).count(),
    0,
  );
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Pertanyaan berikutnya yang sedang disiapkan",
  );
  await page.unroute(base + "/api/smart/ask?*");
  const chatLog = page.getByRole("log", { name: "Percakapan AI" });
  const messageCountBeforeFilter = await chatLog.locator("article").count();
  const updatedOverview = page.waitForResponse(
    (response) =>
      response.url().includes("/api/smart/overview?") &&
      response.url().includes("month=9") &&
      response.status() === 200,
  );
  await page.getByLabel("Bulan", { exact: true }).selectOption("9");
  await updatedOverview;
  assert.equal(
    await chatLog.locator("article").count(),
    messageCountBeforeFilter,
    "filter changes preserve existing messages",
  );
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Pertanyaan berikutnya yang sedang disiapkan",
    "filter changes preserve drafts",
  );
  assert.equal(
    await page
      .getByRole("dialog", { name: "Tanya Yuwi", exact: true })
      .isVisible(),
    true,
  );

  await page.getByLabel("Pertanyaan untuk AI").fill("Buat laporan penjualan");
  await page.getByLabel("Pertanyaan untuk AI").press("Enter");
  await page
    .getByText("Penjualan pada filter pilihan: 2000.", { exact: false })
    .waitFor();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Unduh jawaban / laporan", exact: true })
    .last()
    .click();
  const reportDownload = await downloaded;
  assert.equal(
    reportDownload.suggestedFilename(),
    "laporan-smart-dashboard.txt",
  );
  const reportText = await readFile(await reportDownload.path(), "utf8");
  assert.ok(reportText.includes("Penjualan pada filter pilihan: 2000."));
  assert.ok(reportText.includes("Filter: September 2026"));
  assert.ok(!reportText.includes("Angka backend:"));
  assert.ok(!reportText.includes("gross_margin:"));
  assert.ok(!reportText.includes("Tidak ada data yang diubah."));
  await page.route(base + "/api/smart/ask?*", (r) =>
    r.fulfill({ status: 429, json: { detail: "Batas AI uji tercapai." } }),
  );
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Berikan rekomendasi penjualan");
  await page.getByLabel("Pertanyaan untuk AI").press("Enter");
  await page
    .getByRole("alert")
    .filter({ hasText: "Batas AI uji tercapai." })
    .waitFor();
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Berikan rekomendasi penjualan",
    "failed request restores the sent text",
  );
  await page.unroute(base + "/api/smart/ask?*");
  await page.getByLabel("Pertanyaan untuk AI").fill("Ringkas penjualan saya");
  await page.getByLabel("Pertanyaan untuk AI").press("Enter");
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
  await page.getByLabel("Bulan", { exact: true }).selectOption("");
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const fits = await page
      .getByLabel("Bulan", { exact: true })
      .evaluate((el) => {
        const style = getComputedStyle(el);
        const context = document.createElement("canvas").getContext("2d");
        context.font = style.font;
        return (
          el.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight) >=
          context.measureText(el.selectedOptions[0].textContent).width
        );
      });
    assert.ok(fits, `month label must not overlap the arrow at ${width}px`);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      `no overflow at ${width}px`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("region", { name: "Filter laporan" })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "test-artifacts/mobile-dashboard-filters.png",
  });
  const monthResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/smart/overview?") &&
      response.url().includes("month=9") &&
      response.status() === 200,
  );
  await page.getByLabel("Bulan", { exact: true }).selectOption("9");
  await monthResponse;
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
  await page.getByRole("button", { name: "Tanya Yuwi", exact: true }).click();
  assert.ok(
    await page
      .getByRole("dialog", { name: "Tanya Yuwi", exact: true })
      .isVisible(),
  );
  await page
    .getByLabel("Pertanyaan untuk AI")
    .fill("Buat resep nasi goreng untuk dashboard");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page
    .getByText("Saya membantu menganalisis data pada dashboard ini.", {
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
  await page.getByRole("button", { name: "Chat baru", exact: true }).click();
  await page
    .getByRole("heading", { name: "Halo, saya Yuwi", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("log", { name: "Percakapan AI" })
      .locator("article")
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Riwayat chat", exact: true }).click();
  await page
    .locator(".yuwi-history-item")
    .filter({ hasText: "Ringkas penjualan saya" })
    .click();
  assert.ok(
    (await page
      .getByRole("log", { name: "Percakapan AI" })
      .locator("article")
      .count()) > 0,
    "new chat keeps old messages",
  );
  await page.getByLabel("Pertanyaan untuk AI").fill("Draft yang disimpan");
  await page.reload();
  await page.getByRole("button", { name: "Tanya Yuwi", exact: true }).click();
  assert.equal(
    await page.getByLabel("Pertanyaan untuk AI").inputValue(),
    "Draft yang disimpan",
  );
  assert.ok(
    (await page
      .getByRole("log", { name: "Percakapan AI" })
      .locator("article")
      .count()) > 0,
  );
  await page.getByRole("button", { name: "Riwayat chat", exact: true }).click();
  await page.screenshot({ path: "test-artifacts/yuwi-history-mobile.png" });
  await page
    .getByRole("button", {
      name: "Hapus chat Ringkas penjualan saya",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  assert.equal(
    await page
      .locator(".yuwi-history-item")
      .filter({ hasText: "Ringkas penjualan saya" })
      .count(),
    1,
  );
  await page
    .getByRole("button", {
      name: "Ubah nama chat Ringkas penjualan saya",
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Nama percakapan", exact: true })
    .fill("Evaluasi September");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByLabel("Cari riwayat chat").fill("evaluasi");
  assert.equal(await page.locator(".yuwi-history-item").count(), 1);
  await page.getByLabel("Cari riwayat chat").fill("tidak-ditemukan");
  await page
    .getByText("Percakapan tidak ditemukan.", { exact: true })
    .waitFor();
  await page.getByLabel("Cari riwayat chat").fill("");
  await page
    .getByRole("button", { name: "Tutup riwayat", exact: true })
    .click();
  assert.ok((await page.locator(".yuwi-avatar img").count()) > 0);
  assert.ok(
    await page
      .locator(".yuwi-header .yuwi-avatar img")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    "Yuwi profile image loads",
  );
  await page
    .getByRole("button", { name: "Tutup panel AI", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("dialog", { name: "Tanya Yuwi", exact: true })
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
  await page.reload();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  authUserId = "different-user";
  await page.getByLabel("Email", { exact: true }).fill("other@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByRole("button", { name: "Tanya Yuwi", exact: true }).click();
  assert.equal(
    await page
      .getByRole("log", { name: "Percakapan AI" })
      .locator("article")
      .count(),
    0,
    "another account must not see old messages",
  );
  await page
    .getByRole("button", { name: "Tutup panel AI", exact: true })
    .click();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  authUserId = "test-user";
  await page.getByLabel("Email", { exact: true }).fill("test@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByRole("button", { name: "Tanya Yuwi", exact: true }).click();
  assert.ok(
    (await page
      .getByRole("log", { name: "Percakapan AI" })
      .locator("article")
      .count()) > 0,
    "returning account restores history",
  );
  await page.getByRole("button", { name: "Riwayat chat", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Hapus chat Evaluasi September",
      exact: true,
    })
    .click();
  await page
    .locator(".yuwi-history-confirm")
    .getByRole("button", { name: "Hapus", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".yuwi-history-item")
      .filter({ hasText: "Evaluasi September" })
      .count(),
    0,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS smart dashboard: owner-scoped API, summary, explicit filter application, report download, provider error, mobile, Excel assistance; zero data mutations.",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser?.close();
  await server?.httpServer.close();
  processApi?.kill("SIGTERM");
  await rm(directory, { recursive: true, force: true });
}
