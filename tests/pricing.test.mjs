/** Unit checks of the pure price functions and the build-time table validation.  node --experimental-strip-types --test tests/pricing.test.mjs */
import assert from "node:assert/strict";
import test from "node:test";
import { bundleLine, cardPriceText, formatPrice, resolveSelection, selectionPriceText, startSelection } from "../src/lib/pricing.ts";
import { buildPricing } from "../src/lib/pricing-content.ts";

const price = (timber, amount, bundleAmount = null) => ({ timber, amount, bundleAmount });
const table = {
  sizeLabel: "Size (mm)",
  defaultTimber: "oak",
  priceSuffix: "each",
  cardSuffix: null,
  bundle: { label: "pair", quantity: 2 },
  rows: [
    { label: "A", isStart: true, prices: [price("oak", 500, 900), price("ash", 430, 740)] },
    { label: "B", isStart: false, prices: [price("oak", 1500, 2800), price("ash", 1430, 2700)] },
  ],
};

test("formatPrice puts thousands separators in by hand", () => {
  assert.deepEqual([0, 225, 1000, 4300, 12345, 1234567].map(formatPrice), ["$0", "$225", "$1,000", "$4,300", "$12,345", "$1,234,567"]);
});

test("card text is the lowest price, plus the pair price for pair bundles", () => {
  assert.equal(cardPriceText(table), "From $430 · Pair $740");
  assert.equal(cardPriceText({ ...table, bundle: null, cardSuffix: "installed", rows: table.rows.map((r) => ({ ...r, prices: r.prices.map((p) => ({ ...p, bundleAmount: null })) })) }), "From $430 installed");
  assert.equal(cardPriceText({ ...table, bundle: { label: "set of 8", quantity: 8 } }), "From $430");
});

test("selection price, bundle saving and fallbacks", () => {
  assert.deepEqual(startSelection(table), { timber: "oak", size: "A" });
  assert.equal(selectionPriceText(table, { timber: "ash", size: "B" }), "$1,430 each");
  assert.equal(bundleLine(table, { timber: "oak", size: "A" }), "Or $900 for a pair, saving $100");
  assert.deepEqual(resolveSelection(table, "ash", "B"), { timber: "ash", size: "B" });
  assert.deepEqual(resolveSelection(table, "nope", "nope"), { timber: "oak", size: "A" });
});

const raw = (overrides = {}) => ({
  sizeLabel: "Size (mm)",
  defaultTimber: "oak",
  priceSuffix: null,
  cardSuffix: null,
  bundle: null,
  rows: [
    { label: "A", isStart: true, prices: [price("oak", 500), price("ash", 430)] },
    { label: "B", isStart: false, prices: [price("oak", 600), price("ash", 530)] },
  ],
  ...overrides,
});

function problemsFor(value) {
  const problems = [];
  buildPricing(value, ["oak", "ash"], "piece", problems);
  return problems.join("\n");
}

test("a valid table has no problems", () => assert.equal(problemsFor(raw()), ""));
test("missing combination", () => assert.match(problemsFor(raw({ rows: [{ label: "A", isStart: true, prices: [price("oak", 500)] }, raw().rows[1]] })), /no price for timber "ash"/));
test("duplicate timber", () => assert.match(problemsFor(raw({ rows: [{ label: "A", isStart: true, prices: [price("oak", 500), price("oak", 1), price("ash", 2)] }, raw().rows[1]] })), /priced twice/));
test("unknown timber", () => assert.match(problemsFor(raw({ rows: [{ label: "A", isStart: true, prices: [price("oak", 500), price("ash", 1), price("elm", 2)] }, raw().rows[1]] })), /"elm": not one of the available timbers/));
test("no start row and two start rows", () => {
  assert.match(problemsFor(raw({ rows: raw().rows.map((r) => ({ ...r, isStart: false })) })), /no row is marked/);
  assert.match(problemsFor(raw({ rows: raw().rows.map((r) => ({ ...r, isStart: true })) })), /more than one row/);
});
test("start row without the default timber", () => assert.match(problemsFor(raw({ defaultTimber: "oak", rows: [{ label: "A", isStart: true, prices: [price("ash", 430)] }, raw().rows[1]] })), /starting row has no price/));
test("amounts must be whole numbers above 0", () => assert.match(problemsFor(raw({ rows: [{ label: "A", isStart: true, prices: [price("oak", 0), price("ash", 4.5)] }, raw().rows[1]] })), /whole number above 0/));
test("bundle prices must match the bundle", () => assert.match(problemsFor(raw({ bundle: { label: "pair", quantity: 2 } })), /bundle price missing/));
