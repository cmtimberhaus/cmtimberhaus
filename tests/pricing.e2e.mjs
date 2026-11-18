/**
 * Browser check of the price selector against a built `out/` (see README, "Checking the price selector").
 *
 *   NODE_OPTIONS="--import ./tests/pricing-fixture.mjs" NEXT_PUBLIC_SITE_URL=http://localhost:4173 npm run build
 *   node tests/pricing.e2e.mjs [path to the baseline build's out/ folder for the card comparison]
 *
 * Serves out/ on 127.0.0.1, clicks every timber and size of every priced piece and compares what the page
 * shows with content/pricing.json. Expected values are worked out here from the JSON, not with the site's code.
 * Needs Playwright (PLAYWRIGHT_MODULE overrides the location of @playwright/test).
 */
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out");
const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const PLAYWRIGHT = process.env.PLAYWRIGHT_MODULE ?? "C:/Users/ndrji/AppData/Roaming/npm/node_modules/@playwright/test/index.mjs";
const { chromium } = await import(pathToFileURL(PLAYWRIGHT).href);

const pricing = JSON.parse(readFileSync(path.join(ROOT, "content", "pricing.json"), "utf8"));
const pieces = JSON.parse(readFileSync(path.join(ROOT, "content", "pieces.json"), "utf8"));
const CARD_SUFFIX = { "the-rex": "each", "the-study-nook": "installed", "the-nelly": "installed", "the-zoltan": "a pair" };

let failures = 0;
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`FAIL ${message}`);
  }
}

const money = (n) => `$${String(n).replace(/\B(?=(\d{3})+$)/g, ",")}`;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".txt": "text/plain", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webp": "image/webp" };

function serve() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", BASE);
    const clean = decodeURIComponent(url.pathname).replace(/\/$/, "");
    const candidates = [clean, `${clean}.html`, path.posix.join(clean, "index.html")];
    const file = candidates.map((candidate) => path.join(OUT, candidate)).find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
    if (!file) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

function cells(entry) {
  return entry.rows.flatMap((row) => row.prices.map((price) => ({ size: row.label ?? null, ...price })));
}

function expectedPrice(entry, cell) {
  return `${money(cell.amount)}${entry.priceSuffix ? ` ${entry.priceSuffix}` : ""}`;
}

function expectedBundle(entry, cell) {
  if (!entry.bundle) return null;
  const label = entry.bundle.label.toLowerCase();
  return `Or ${money(cell.bundleAmount)} for a ${label}, saving ${money(entry.bundle.quantity * cell.amount - cell.bundleAmount)}`;
}

function expectedCard(entry) {
  const all = cells(entry);
  let text = `From ${money(Math.min(...all.map((cell) => cell.amount)))}`;
  if (CARD_SUFFIX[entry.slug]) text += ` ${CARD_SUFFIX[entry.slug]}`;
  if (entry.bundle?.label.toLowerCase() === "pair") text += ` · Pair ${money(Math.min(...all.map((cell) => cell.bundleAmount)))}`;
  return text;
}

function expectedMessage(name, timberName, size, entry, cell) {
  const article = /^(the|mr|mrs|ms|miss) /i.test(name) ? "" : "the ";
  const detail = [timberName, size ? `${size} mm` : ""].filter(Boolean).join(", ");
  return `Hi, I'm interested in ${article}${name} in ${detail} (guide price ${money(cell.amount)}${entry.priceSuffix === "each" ? " each" : ""}). `;
}

function pieceMeta(slug) {
  const meta = pieces.find((piece) => piece.slug === slug);
  return { ...meta, category: meta.category };
}

async function timberNames(page) {
  const names = {};
  for (const label of await page.locator('fieldset:has(input[name="timber"]) .opt').all()) {
    names[await label.locator("input").getAttribute("value")] = (await label.locator("span").innerText()).trim();
  }
  return names;
}

async function checkPage(browser, entry) {
  const meta = pieceMeta(entry.slug);
  const url = `${BASE}/${meta.category}/${entry.slug}`;
  const defaultCell = cells(entry).find((cell) => cell.timber === entry.defaultTimber && cell.size === (entry.rows.find((row) => row.isStart).label ?? null));

  const html = readFileSync(path.join(OUT, meta.category, `${entry.slug}.html`), "utf8");
  check(html.includes(`class="pd-price">${expectedPrice(entry, defaultCell)}</span>`), `${entry.slug}: static HTML lacks default price ${expectedPrice(entry, defaultCell)}`);
  check((html.match(/<dt>Timber<\/dt>/gi) ?? []).length === 1, `${entry.slug}: Timber row count in static HTML`);
  check((html.match(/<dt>Size<\/dt>/gi) ?? []).length <= 1, `${entry.slug}: Size row count in static HTML`);
  check(/<form[^>]*method="get"[^>]*action="\/enquire"|<form[^>]*action="\/enquire"[^>]*method="get"/.test(html), `${entry.slug}: form is GET /enquire`);
  check(html.includes(`name="piece" value="${entry.slug}"`), `${entry.slug}: hidden piece field`);

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("response", (response) => response.status() >= 400 && errors.push(`${response.status()} ${response.url()}`));
  await page.goto(url);
  await page.waitForLoadState("networkidle");

  const names = await timberNames(page);
  check(Object.keys(names).length === entry.rows[0].prices.length, `${entry.slug}: timber radio count`);
  check((await page.locator("[aria-live=polite] .pd-price").count()) === 1, `${entry.slug}: price is inside aria-live=polite`);
  check((await page.locator('fieldset > legend', { hasText: "Timber" }).count()) === 1, `${entry.slug}: Timber legend`);
  if (entry.sizeLabel) {
    const legend = entry.sizeLabel.includes("(mm)") ? entry.sizeLabel : `${entry.sizeLabel} (mm)`;
    check((await page.locator("fieldset > legend", { hasText: legend }).count()) === 1, `${entry.slug}: size legend "${legend}"`);
  } else {
    check((await page.locator('input[name="size"]').count()) === 0, `${entry.slug}: no size control`);
  }
  check((await page.locator("dt", { hasText: /^timber$/i }).count()) === 1, `${entry.slug}: one Timber row`);
  const sizeRows = await page.locator("dt", { hasText: /^size$/i }).count();
  check(sizeRows <= 1, `${entry.slug}: at most one Size row`);

  for (const cell of cells(entry)) {
    await page.locator(`input[name="timber"][value="${cell.timber}"]`).check();
    if (cell.size) await page.locator(`input[name="size"][value="${cell.size}"]`).check();
    const label = `${entry.slug} ${cell.timber} ${cell.size ?? ""}`;
    check((await page.locator(".pd-price").innerText()) === expectedPrice(entry, cell), `${label}: price ${await page.locator(".pd-price").innerText()} vs ${expectedPrice(entry, cell)}`);
    const bundle = expectedBundle(entry, cell);
    if (bundle) check((await page.locator(".pd-set").innerText()) === bundle, `${label}: bundle line`);
    check((await page.locator("dt", { hasText: /^timber$/i }).locator("xpath=following-sibling::dd").innerText()) === names[cell.timber], `${label}: Timber row`);
    if (cell.size) check((await page.locator("dt", { hasText: /^size$/i }).locator("xpath=following-sibling::dd").innerText()) === `${cell.size} mm`, `${label}: Size row`);
    check((await page.locator(".pd-more").getAttribute("href")) === `/materials#mat-${cell.timber}`, `${label}: timber link`);
    const query = await page.locator("form.pd-form").evaluate((form) => new URLSearchParams(new FormData(form)).toString());
    const wanted = new URLSearchParams({ piece: entry.slug, timber: cell.timber, ...(cell.size ? { size: cell.size } : {}) }).toString();
    check(query === wanted, `${label}: form data ${query} vs ${wanted}`);
  }

  await checkEnquiry(context, page, entry, meta, names);
  await checkKeyboard(page, entry, names);
  check(errors.length === 0, `${entry.slug}: console errors ${errors.join(" | ")}`);
  await context.close();
  await checkNoJs(browser, entry, url);
}

/** The form fills the message in after it loads, so wait for it. */
async function filledMessage(page) {
  const area = page.locator('textarea[name="message"]');
  await page.waitForFunction(() => document.querySelector('textarea[name="message"]')?.value);
  return area.inputValue();
}

async function checkEnquiry(context, page, entry, meta, names) {
  const all = cells(entry);
  for (const cell of [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]]) {
    await page.goto(`${BASE}/${meta.category}/${entry.slug}`);
    await page.locator(`input[name="timber"][value="${cell.timber}"]`).check();
    if (cell.size) await page.locator(`input[name="size"][value="${cell.size}"]`).check();
    await page.getByRole("button", { name: "Enquire about this piece" }).click();
    await page.waitForURL(/\/enquire\?/);
    const params = new URL(page.url()).searchParams;
    check(params.get("piece") === entry.slug && params.get("timber") === cell.timber && params.get("size") === cell.size, `${entry.slug}: enquiry URL ${page.url()}`);
    const message = await filledMessage(page);
    check(message === expectedMessage(meta.name, names[cell.timber], cell.size, entry, cell), `${entry.slug}: prefill "${message}"`);
  }

  const cell = all[all.length - 1];
  await page.route("**/api/enquiry", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
  const sent = page.waitForRequest("**/api/enquiry");
  await page.locator('input[name="name"]').fill("Test");
  await page.locator('input[name="email"]').fill("test@example.com");
  await page.getByRole("button", { name: "Send Enquiry" }).click();
  const body = (await sent).postDataJSON();
  check(body.piece === entry.slug && body.timber === names[cell.timber] && body.size === (cell.size ? `${cell.size} mm` : "") && body.guidePrice === `${money(cell.amount)}${entry.priceSuffix === "each" ? " each" : ""}`, `${entry.slug}: payload ${JSON.stringify(body)}`);
  await page.unroute("**/api/enquiry");

  await page.goto(`${BASE}/enquire?piece=${entry.slug}&timber=not-a-timber&size=not-a-size`);
  await page.locator('textarea[name="message"]').waitFor();
  await page.waitForTimeout(300);
  check((await page.locator('textarea[name="message"]').inputValue()) === `Hi, I'm interested in ${/^(the|mr) /i.test(meta.name) ? "" : "the "}${meta.name}. `, `${entry.slug}: unknown values ignored`);
}

async function checkKeyboard(page, entry) {
  await page.goto(`${BASE}/${pieceMeta(entry.slug).category}/${entry.slug}`);
  await page.locator('input[name="timber"]:checked').focus();
  const before = await page.locator(".pd-price").innerText();
  const startTimber = await page.locator('input[name="timber"]:checked').getAttribute("value");
  const order = entry.rows[0].prices.map((price) => price.timber);
  const next = order[(order.indexOf(startTimber) + 1) % order.length];
  await page.keyboard.press("ArrowRight");
  check((await page.locator('input[name="timber"]:checked').getAttribute("value")) === next, `${entry.slug}: ArrowRight moves the timber`);
  const row = entry.rows.find((candidate) => candidate.isStart);
  const cell = row.prices.find((price) => price.timber === next);
  check((await page.locator(".pd-price").innerText()) === expectedPrice(entry, { ...cell }), `${entry.slug}: price after keyboard (was ${before})`);
  check((await page.locator('input[name="timber"]:focus').count()) === 1, `${entry.slug}: focus stays on the radio`);
  check((await page.locator(".pd-pricebox").getAttribute("aria-live")) === "polite", `${entry.slug}: aria-live`);
}

async function checkNoJs(browser, entry, url) {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(url);
  const defaultRow = entry.rows.find((row) => row.isStart);
  const defaultCell = defaultRow.prices.find((price) => price.timber === entry.defaultTimber);
  check((await page.locator(".pd-price").innerText()) === expectedPrice(entry, defaultCell), `${entry.slug}: no-JS default price`);
  const all = cells(entry);
  const cell = all[all.length - 1];
  await page.locator(`input[name="timber"][value="${cell.timber}"]`).check();
  if (cell.size) await page.locator(`input[name="size"][value="${cell.size}"]`).check();
  await page.getByRole("button", { name: "Enquire about this piece" }).click();
  await page.waitForURL(/\/enquire\?/);
  const params = new URL(page.url()).searchParams;
  check(params.get("piece") === entry.slug && params.get("timber") === cell.timber && params.get("size") === cell.size, `${entry.slug}: no-JS GET ${page.url()}`);
  await context.close();
}

async function checkCards(browser, baselineOut) {
  const changed = [];
  const page = await browser.newPage();
  for (const category of ["dining", "living", "bathroom"]) {
    await page.goto(`${BASE}/${category}`);
    for (const card of await page.locator(".card").all()) {
      const name = (await card.locator(".nm").innerText()).trim();
      const text = (await card.locator(".pr").innerText()).trim();
      const href = await card.locator("a.card-link").getAttribute("href");
      const slug = href.split("/").pop();
      const entry = pricing.find((candidate) => candidate.slug === slug);
      if (entry) check(text === expectedCard(entry), `${slug}: card "${text}" vs "${expectedCard(entry)}"`);
      if (baselineOut) {
        const baseline = readFileSync(path.join(baselineOut, `${category}.html`), "utf8");
        const old = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h2><span class="ds">[^<]*</span><span class="pr">([^<]*)</span>`, "i").exec(baseline)?.[1];
        const oldText = old?.replace(/&middot;|&#x27;/g, (m) => (m === "&middot;" ? "·" : "'"));
        if (oldText !== text) changed.push(`${name}: "${oldText}" -> "${text}"`);
      }
    }
  }
  await page.close();
  return changed;
}

const server = await serve();
const browser = await chromium.launch();
try {
  for (const entry of pricing) await checkPage(browser, entry);
  const changed = await checkCards(browser, process.argv[2]);
  console.log(`Cards whose text changed (${changed.length}):\n  ${changed.join("\n  ")}`);
  const total = pricing.reduce((sum, entry) => sum + cells(entry).length, 0);
  console.log(`${pricing.length} pieces, ${total} price cells, ${checks} checks, ${failures} failures`);
} finally {
  await browser.close();
  server.close();
}
process.exitCode = failures > 0 ? 1 : 0;
