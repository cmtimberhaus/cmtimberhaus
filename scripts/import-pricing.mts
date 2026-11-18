/**
 * Loads the price tables from content/pricing.json into the live piece documents.
 *
 *   node --experimental-strip-types scripts/import-pricing.mts                            dry run (default): reads, validates, prints, writes nothing
 *   SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/import-pricing.mts --apply --yes
 *
 * Safe by construction: each piece is patched with setIfMissing on `pricing` and the revision that was read
 * (ifRevisionId), so a price table that already exists, or an edit made in the Studio in the meantime, is
 * never overwritten. A piece with an unpublished draft (drafts.piece-...) is skipped and reported, because
 * a published-only patch would be hidden by, or overwritten from, the draft. There is no replace mode.
 * The token is read from the environment and only for --apply. Never commit it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@sanity/client";
import { cardPriceText, type PiecePricing } from "../src/lib/pricing.ts";

const PROJECT_ID = "ka21otlh";
const DATASET = "production";
const API_VERSION = "2025-01-01";
const PRICING_PATH = path.join(import.meta.dirname, "..", "content", "pricing.json");

interface SourceCell {
  timber: string;
  amount: number;
  bundleAmount?: number;
}

interface SourceRow {
  label?: string;
  isStart: boolean;
  prices: SourceCell[];
}

interface SourcePricing {
  slug: string;
  sizeLabel?: string;
  defaultTimber: string;
  priceSuffix?: string;
  bundle?: { label: string; quantity: number };
  rows: SourceRow[];
}

interface LivePiece {
  _id: string;
  _rev: string;
  slug: string | null;
  cardPrice: string | null;
  hasPricing: boolean;
  timbers: (string | null)[] | null;
}

interface Plan {
  slug: string;
  id: string;
  rev: string;
  pricing: Record<string, unknown>;
  summary: PiecePricing;
  oldCard: string | null;
}

const BUNDLE_LABELS: Record<string, "pair" | "set of 8"> = { pair: "pair", "set of 8": "set of 8" };

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

/** "From $900 installed" or "From $500 · Pair $850" to the words that follow the price: "installed", "". */
function cardSuffixOf(cardPrice: string | null): string | null {
  const match = /^From \$[\d,]+(?: ((?!·).+?))?(?: · Pair \$[\d,]+)?$/.exec(cardPrice ?? "");
  return match?.[1] ?? null;
}

function toSummary(source: SourcePricing, cardSuffix: string | null, timbers: string[]): PiecePricing {
  const bundleLabel = source.bundle ? BUNDLE_LABELS[source.bundle.label.toLowerCase()] : undefined;
  return {
    sizeLabel: source.sizeLabel ?? null,
    defaultTimber: source.defaultTimber,
    priceSuffix: source.priceSuffix || null,
    cardSuffix,
    bundle: source.bundle && bundleLabel ? { label: bundleLabel, quantity: source.bundle.quantity } : null,
    rows: source.rows.map((row) => ({
      label: row.label ?? null,
      isStart: row.isStart,
      prices: timbers.map((timber) => {
        const cell = row.prices.find((price) => price.timber === timber);
        return { timber, amount: cell?.amount ?? 0, bundleAmount: cell?.bundleAmount ?? null };
      }),
    })),
  };
}

function rowErrors(source: SourcePricing, row: SourceRow, rowName: string, timbers: string[]): string[] {
  const errors: string[] = [];
  const present = row.prices.map((price) => price.timber);
  for (const slug of duplicates(present)) errors.push(`${rowName}: timber ${slug} priced twice`);
  for (const slug of present.filter((candidate) => !timbers.includes(candidate))) {
    errors.push(`${rowName}: timber ${slug} is not one of the piece's available timbers`);
  }
  for (const slug of timbers.filter((candidate) => !present.includes(candidate))) {
    errors.push(`${rowName}: no price for ${slug}`);
  }
  for (const price of row.prices) {
    if (!Number.isInteger(price.amount) || price.amount <= 0) errors.push(`${rowName}: ${price.timber} amount ${price.amount} is not a whole number above 0`);
    const hasBundleAmount = price.bundleAmount !== undefined;
    if (hasBundleAmount !== Boolean(source.bundle)) errors.push(`${rowName}: ${price.timber} bundle price does not match the bundle`);
    if (hasBundleAmount && (!Number.isInteger(price.bundleAmount) || (price.bundleAmount ?? 0) <= 0)) {
      errors.push(`${rowName}: ${price.timber} bundle amount is not a whole number above 0`);
    }
  }
  return errors;
}

function validate(source: SourcePricing, timbers: string[]): string[] {
  const errors: string[] = [];
  if (source.bundle && !BUNDLE_LABELS[source.bundle.label.toLowerCase()]) errors.push(`bundle label "${source.bundle.label}" is not pair or set of 8`);
  if (!timbers.includes(source.defaultTimber)) errors.push(`default timber ${source.defaultTimber} is not available`);
  source.rows.forEach((row, index) => errors.push(...rowErrors(source, row, `row ${row.label ?? index + 1}`, timbers)));
  const starts = source.rows.filter((row) => row.isStart);
  if (starts.length !== 1) errors.push(`${starts.length} rows are marked as the start (need exactly 1)`);
  else if (!starts[0]?.prices.some((price) => price.timber === source.defaultTimber)) errors.push("the start row has no price for the default timber");
  const labels = source.rows.flatMap((row) => (row.label ? [row.label] : []));
  for (const label of duplicates(labels)) errors.push(`size ${label} appears twice`);
  const consistent = source.sizeLabel ? labels.length === source.rows.length : source.rows.length === 1 && labels.length === 0;
  if (!consistent) errors.push("sizeLabel and row labels do not agree");
  return errors;
}

function toDocumentValue(source: SourcePricing, summary: PiecePricing, materialIds: Map<string, string>): Record<string, unknown> {
  const reference = (slug: string) => ({ _type: "reference", _ref: materialIds.get(slug) });
  return {
    ...(summary.sizeLabel ? { sizeLabel: summary.sizeLabel } : {}),
    defaultTimber: reference(source.defaultTimber),
    ...(summary.priceSuffix ? { priceSuffix: summary.priceSuffix } : {}),
    ...(summary.cardSuffix ? { cardSuffix: summary.cardSuffix } : {}),
    ...(summary.bundle ? { bundle: summary.bundle } : {}),
    rows: summary.rows.map((row, index) => ({
      _type: "priceRow",
      _key: `row${index + 1}`,
      ...(row.label ? { label: row.label } : {}),
      isStart: row.isStart,
      prices: row.prices.map((price) => ({
        _type: "timberPrice",
        _key: price.timber,
        timber: reference(price.timber),
        amount: price.amount,
        ...(price.bundleAmount !== null ? { bundleAmount: price.bundleAmount } : {}),
      })),
    })),
  };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  if (apply && !process.argv.includes("--yes")) throw new Error("--apply writes to the live dataset. Add --yes to confirm.");
  const token = process.env.SANITY_WRITE_TOKEN;
  if (apply && !token) throw new Error("Set SANITY_WRITE_TOKEN in the environment to use --apply.");

  const sources = JSON.parse(readFileSync(PRICING_PATH, "utf8")) as SourcePricing[];
  const client = createClient({ projectId: PROJECT_ID, dataset: DATASET, apiVersion: API_VERSION, useCdn: false, perspective: "raw", ...(apply ? { token } : {}) });

  const [materials, pieces] = await Promise.all([
    client.fetch<{ _id: string; slug: string }[]>(`*[_type == "material" && !(_id in path("drafts.**"))]{_id, "slug": slug.current}`),
    client.fetch<LivePiece[]>(
      `*[_type == "piece"]{_id, _rev, "slug": slug.current, cardPrice, "hasPricing": defined(pricing), "timbers": availableTimbers[]->slug.current}`,
    ),
  ]);
  const materialIds = new Map(materials.map((material) => [material.slug, material._id]));
  const published = new Map(pieces.filter((piece) => !piece._id.startsWith("drafts.")).map((piece) => [piece.slug, piece]));
  const draftIds = new Set(pieces.filter((piece) => piece._id.startsWith("drafts.")).map((piece) => piece._id));

  const plans: Plan[] = [];
  const skipped: string[] = [];
  const failures: string[] = [];

  for (const source of sources) {
    const live = published.get(source.slug);
    if (!live) {
      failures.push(`${source.slug}: no published piece with this slug`);
      continue;
    }
    const timbers = (live.timbers ?? []).filter((slug): slug is string => slug !== null);
    const errors = validate(source, timbers);
    if (errors.length > 0) {
      failures.push(...errors.map((error) => `${source.slug}: ${error}`));
      continue;
    }
    if (draftIds.has(`drafts.${live._id}`)) {
      skipped.push(`${source.slug}: has an unpublished draft (drafts.${live._id}), skipped`);
      continue;
    }
    if (live.hasPricing) {
      skipped.push(`${source.slug}: already has pricing, left untouched`);
      continue;
    }
    const summary = toSummary(source, cardSuffixOf(live.cardPrice), timbers);
    plans.push({ slug: source.slug, id: live._id, rev: live._rev, pricing: toDocumentValue(source, summary, materialIds), summary, oldCard: live.cardPrice });
  }

  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${sources.length} price tables, ${pieces.length} piece documents (${draftIds.size} drafts)\n`);
  for (const plan of plans) {
    const next = cardPriceText(plan.summary);
    const cells = plan.summary.rows.reduce((total, row) => total + row.prices.length, 0);
    console.log(`${plan.id} (rev ${plan.rev})`);
    console.log(`  setIfMissing pricing: ${plan.summary.rows.length} row(s), ${cells} prices, default ${plan.summary.defaultTimber}, size name ${plan.summary.sizeLabel ?? "none"}`);
    console.log(`  suffix "${plan.summary.priceSuffix ?? ""}", card suffix "${plan.summary.cardSuffix ?? ""}", bundle ${plan.summary.bundle ? `${plan.summary.bundle.label} x${plan.summary.bundle.quantity}` : "none"}`);
    console.log(`  card: "${plan.oldCard}" -> "${next}"${plan.oldCard === next ? " (unchanged)" : " (CHANGES)"}`);
  }
  for (const line of skipped) console.log(`SKIPPED ${line}`);
  for (const line of failures) console.error(`INVALID ${line}`);
  console.log(`\n${plans.length} to set, ${skipped.length} skipped, ${failures.length} problems`);
  if (failures.length > 0) process.exitCode = 1;
  if (!apply || failures.length > 0) {
    if (!apply) console.log("Dry run: nothing was written.");
    return;
  }

  const transaction = client.transaction();
  for (const plan of plans) transaction.patch(plan.id, (patch) => patch.ifRevisionId(plan.rev).setIfMissing({ pricing: plan.pricing }));
  await transaction.commit();
  console.log(`Wrote pricing to ${plans.length} pieces.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
