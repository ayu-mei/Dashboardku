import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build, preview } from "vite";
import { chromium } from "playwright";

// Exercises the existing auth module with controlled network responses only.
// Never contacts the user's Supabase project or changes auth/session storage.
const directory = await mkdtemp(join(tmpdir(), "refraksi-login-"));
let server, browser, release;
let reply = "pending",
  calls = 0,
  logoutCalls = 0;
const errors = [],
  payloads = [];
try {
  await build({
    root: resolve("frontend"),
    configFile: resolve("frontend/vite.config.js"),
    build: { outDir: directory, emptyOutDir: true },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        "https://login-test.supabase.co",
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        "sb_publishable_test_only",
      ),
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(
        "https://api-login-test.onrender.com",
      ),
    },
  });
  server = await preview({
    root: resolve("frontend"),
    configFile: false,
    build: { outDir: directory },
    preview: { host: "127.0.0.1", port: 4177, strictPort: true },
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    )
      errors.push(message.text());
  });
  await page.route("https://login-test.supabase.co/**", async (route) => {
    if (route.request().method() === "OPTIONS")
      return route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "apikey, Content-Type, Authorization",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
      });
    if (route.request().url().includes("/logout")) {
      logoutCalls++;
      return route.fulfill({
        json: {},
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
    calls++;
    payloads.push(route.request().postDataJSON());
    const response =
      reply === "pending"
        ? await new Promise((done) => {
            release = done;
          })
        : reply;
    await route.fulfill({
      status:
        response === "success" ? 200 : response === "server-error" ? 500 : 401,
      headers: { "Access-Control-Allow-Origin": "*" },
      json:
        response === "success"
          ? {
              access_token: "login-test-token",
              refresh_token: "test-refresh",
              expires_in: 3600,
            }
          : { msg: "Internal PostgrestError secret_code PRIVATE_DATABASE" },
    });
  });
  await page.route("https://api-login-test.onrender.com/**", (route) =>
    route.fulfill({
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
      json: {
        sales: [],
        expenses: [],
        metrics: {
          sales: "0",
          hpp: "0",
          gross: "0",
          operational: "0",
          net: "0",
          gross_margin: null,
          net_margin: null,
        },
        options: { product: [], category: [], location: [] },
        years: [],
        timeline: [],
        products: [],
        note: "Akun uji terisolasi.",
      },
    }),
  );
  await page.goto("http://127.0.0.1:4177");
  const email = page.getByLabel("Email", { exact: true }),
    password = page.getByLabel("Password", { exact: true });
  const form = page.getByRole("form", { name: "Masuk ke REFRAKSI" });
  assert.equal(await email.getAttribute("autocomplete"), "email");
  assert.equal(await password.getAttribute("autocomplete"), "current-password");
  await mkdir("test-artifacts/login", { recursive: true });
  for (const [width, height] of [
    [1440, 900],
    [1280, 800],
    [1024, 900],
    [768, 1024],
    [390, 844],
    [360, 800],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(550);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Horizontal overflow ${width}`,
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Masuk", exact: true })
        .isVisible(),
    );
    assert.equal(await page.locator(".login-brand").isVisible(), width > 900);
    await page.screenshot({
      path: `test-artifacts/login/${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const contrasts = await page.evaluate(() => {
    const rgb = (value) =>
      (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const lum = (color) =>
      rgb(color)
        .map((value) => {
          value /= 255;
          return value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        })
        .reduce(
          (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const ratio = (a, b) =>
      (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    const surface = getComputedStyle(
      document.querySelector(".login-panel"),
    ).backgroundColor;
    return [
      ".login-panel-heading > p",
      ".login-input-group label",
      ".login-account-note",
      ".login-support-note p",
    ].map((selector) => ({
      selector,
      ratio: ratio(
        getComputedStyle(document.querySelector(selector)).color,
        surface,
      ),
    }));
  });
  for (const result of contrasts)
    assert.ok(result.ratio >= 4.5, JSON.stringify(result));
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  assert.equal(
    calls,
    0,
    "Native required validation must prevent an empty submission",
  );
  await email.fill("design-test@example.invalid");
  await password.fill("ui-test-password");
  await page
    .getByRole("button", { name: "Tampilkan password", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "text");
  assert.equal(await password.inputValue(), "ui-test-password");
  await page
    .getByRole("button", { name: "Sembunyikan password", exact: true })
    .click();
  assert.equal(await password.getAttribute("type"), "password");
  await email.focus();
  await page.keyboard.press("Tab");
  assert.ok(await password.evaluate((el) => el === document.activeElement));
  await page.keyboard.press("Tab");
  const toggle = page.getByRole("button", {
    name: "Tampilkan password",
    exact: true,
  });
  assert.ok(await toggle.evaluate((el) => el === document.activeElement));
  assert.ok(
    await toggle.evaluate((el) => getComputedStyle(el).outlineStyle !== "none"),
  );
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .getByRole("button", { name: "Masuk", exact: true })
      .evaluate((el) => el === document.activeElement),
  );
  await password.press("Enter");
  const loading = page.getByRole("button", {
    name: "Memproses...",
    exact: true,
  });
  await loading.waitFor();
  assert.equal(await loading.isDisabled(), true);
  assert.equal(await email.isDisabled(), true);
  assert.equal(await password.isDisabled(), true);
  assert.equal(await form.getAttribute("aria-busy"), "true");
  await form.evaluate((el) => {
    el.requestSubmit();
    el.requestSubmit();
  });
  await page.waitForTimeout(150);
  assert.equal(calls, 1, "Loading guard must prevent double submit");
  assert.deepEqual(payloads[0], {
    email: "design-test@example.invalid",
    password: "ui-test-password",
  });
  await page.screenshot({
    path: "test-artifacts/login/loading.png",
    fullPage: true,
  });
  release("invalid");
  await page
    .getByRole("alert")
    .getByText("Email atau password tidak sesuai.", { exact: true })
    .waitFor();
  assert.equal(await email.getAttribute("aria-invalid"), "true");
  assert.equal(await email.getAttribute("aria-describedby"), "login-error");
  assert.equal(await password.inputValue(), "ui-test-password");
  await page.screenshot({
    path: "test-artifacts/login/error.png",
    fullPage: true,
  });
  reply = "server-error";
  await password.press("Enter");
  await page
    .getByRole("alert")
    .getByText(
      "Login belum berhasil. Periksa koneksi atau coba beberapa saat lagi.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByText(/PostgrestError|secret_code|PRIVATE_DATABASE/).count(),
    0,
  );
  reply = "success";
  await password.press("Enter");
  await page
    .getByRole("heading", { name: "Dashboard Penjualan", exact: true })
    .waitFor();
  // Existing source keeps the session in memory: document, don't change, this behavior.
  await page.reload();
  await page
    .getByRole("heading", { name: "Selamat datang", exact: true })
    .waitFor();
  console.log(
    "EXISTING BEHAVIOR: full reload returns to login; auth/session implementation was preserved.",
  );
  await email.fill("design-test@example.invalid");
  await password.fill("ui-test-password");
  await password.press("Enter");
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page
    .getByRole("heading", { name: "Selamat datang", exact: true })
    .waitFor();
  assert.equal(logoutCalls, 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".login-panel")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.equal(
    await page
      .locator(".login-preview-chart")
      .evaluate((el) => getComputedStyle(el).animationName),
    "none",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/laptop/tablet/mobile 360–1440px, required labels/autocomplete, keyboard/focus/Enter, show/hide password, loading/double-submit guard, sanitized errors, existing successful-login transition, refresh behavior, existing logout, reduced motion, key text contrast >=4.5, no JavaScript errors. Auth responses mocked; production accounts untouched.",
  );
} finally {
  release?.("invalid");
  await browser?.close();
  await server?.httpServer.close();
  await rm(directory, { recursive: true, force: true });
}
