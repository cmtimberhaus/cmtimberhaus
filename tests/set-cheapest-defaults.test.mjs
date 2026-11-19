/** Unit checks of the cheapest-default rule and of content/pricing.json.  node --experimental-strip-types --test tests/set-cheapest-defaults.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cheapestTimber, compare, withCheapestDefault } from "../scripts/set-cheapest-defaults.mts";

const row = (label, isStart, ...prices) => ({ ...(label ? { label } : {}), isStart, prices: prices.map(([timber, amount]) => ({ timber, amount })) });

test("the first timber in the availableTimbers order wins a tie", () => {
  const first = row("A", true, ["oak", 500], ["ash", 400], ["elm", 400]);
  assert.equal(cheapestTimber(first, ["oak", "elm", "ash"])?.timber, "elm");
  assert.equal(cheapestTimber(first, ["oak", "ash", "elm"])?.timber, "ash");
});

test("a timber the row does not price is ignored, and no priced timber gives null", () => {
  assert.equal(cheapestTimber(row("A", true, ["oak", 500]), ["ash", "oak"])?.timber, "oak");
  assert.equal(cheapestTimber(row("A", true, ["oak", 500]), ["ash"]), null);
});

test("the smallest size is the first row, whatever isStart says", () => {
  const source = { slug: "p", defaultTimber: "oak", rows: [row("1200", false, ["oak", 300], ["ash", 280]), row("1800", true, ["oak", 500], ["ash", 450])] };
  const result = compare(source, ["oak", "ash"]);
  assert.deepEqual(result?.next, { timber: "ash", size: "1200", amount: 280 });
  assert.deepEqual(result?.current, { timber: "oak", size: "1800", amount: 500 });
  assert.equal(result?.changed, true);
  assert.equal(result?.cardMismatch, false);
  const updated = withCheapestDefault(source, result);
  assert.equal(updated.defaultTimber, "ash");
  assert.deepEqual(updated.rows.map((r) => r.isStart), [true, false]);
});

test("it flags a first timber that is not the cheapest, and a first row that is not the cheapest row", () => {
  const source = { slug: "p", defaultTimber: "oak", rows: [row(null, true, ["oak", 500], ["ash", 450])] };
  assert.equal(compare(source, ["oak", "ash"])?.firstTimberNotCheapest, true);
  const unsorted = { slug: "p", defaultTimber: "oak", rows: [row("A", true, ["oak", 500]), row("B", false, ["oak", 400])] };
  assert.equal(compare(unsorted, ["oak"])?.cardMismatch, true);
});

test("content/pricing.json already opens every piece on its cheapest option, priced at the card price", () => {
  const sources = JSON.parse(readFileSync(new URL("../content/pricing.json", import.meta.url), "utf8"));
  for (const source of sources) {
    const order = source.rows[0].prices.map((price) => price.timber);
    const result = compare(source, order);
    assert.equal(result?.changed, false, `${source.slug} does not open on its cheapest option`);
    assert.equal(result?.cardMismatch, false, `${source.slug}: default price differs from the card price`);
    assert.equal(source.rows.filter((r) => r.isStart).length, 1, `${source.slug}: need exactly one starting size`);
  }
});
