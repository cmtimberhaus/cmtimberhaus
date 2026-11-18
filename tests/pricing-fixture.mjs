/**
 * Test-only. Preloaded with NODE_OPTIONS="--import ./tests/pricing-fixture.mjs" it makes a build read the live
 * Sanity content (read-only GET) with the price tables from content/pricing.json merged into the pieces.
 * Nothing is written anywhere and nothing here is part of the site or the build.
 */
import { readFileSync } from "node:fs";

const pricing = JSON.parse(readFileSync(new URL("../content/pricing.json", import.meta.url), "utf8"));
const bySlug = new Map(pricing.map((entry) => [entry.slug, entry]));
const BUNDLE = { pair: "pair", "set of 8": "set of 8" };

function toRaw(entry) {
  return {
    sizeLabel: entry.sizeLabel ?? null,
    defaultTimber: entry.defaultTimber,
    priceSuffix: entry.priceSuffix || null,
    cardSuffix: entry.cardSuffix ?? null,
    bundle: entry.bundle ? { label: BUNDLE[entry.bundle.label.toLowerCase()], quantity: entry.bundle.quantity } : null,
    rows: entry.rows.map((row) => ({
      label: row.label ?? null,
      isStart: row.isStart,
      prices: row.prices.map((price) => ({ timber: price.timber, amount: price.amount, bundleAmount: price.bundleAmount ?? null })),
    })),
  };
}

const CARD_SUFFIX = { "the-rex": "each", "the-study-nook": "installed", "the-nelly": "installed", "the-zoltan": "a pair" };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const response = await realFetch(input, init);
  if (!url.includes("api.sanity.io") || !url.includes("/data/query/") || (init?.method ?? "GET") !== "GET") return response;
  const body = await response.json();
  for (const piece of body.result?.pieces ?? []) {
    const entry = bySlug.get(piece.slug);
    if (entry) piece.pricing = { ...toRaw(entry), cardSuffix: CARD_SUFFIX[piece.slug] ?? null };
    // PRICING_FIXTURE_BREAK=<slug> drops one price so the build-time validation can be seen failing.
    if (entry && piece.slug === process.env.PRICING_FIXTURE_BREAK) piece.pricing.rows[1].prices.pop();
  }
  return new Response(JSON.stringify(body), { status: response.status, headers: { "content-type": "application/json" } });
};
