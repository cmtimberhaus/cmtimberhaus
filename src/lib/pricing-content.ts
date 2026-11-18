import type { BundleLabel, PiecePricing, PriceRow } from "./pricing";

/**
 * Build-time check of a piece's price table as read from Sanity. Every problem found is added to
 * `problems`, so one build run reports them all.
 */

export interface RawPricing {
  sizeLabel: string | null;
  defaultTimber: string | null;
  priceSuffix: string | null;
  cardSuffix: string | null;
  bundle: { label: string | null; quantity: number | null } | null;
  rows: RawPricingRow[] | null;
}

interface RawPricingRow {
  label: string | null;
  isStart: boolean | null;
  prices: { timber: string | null; amount: number | null; bundleAmount: number | null }[] | null;
}

const BUNDLE_LABELS: readonly string[] = ["pair", "set of 8"] satisfies BundleLabel[];

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function isWholeAmount(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value > 0;
}

function buildRow(raw: RawPricingRow, rowName: string, timbers: string[], hasBundle: boolean, problems: string[]): PriceRow {
  const prices = (raw.prices ?? []).map((price) => {
    const cell = `${rowName} timber "${price.timber ?? "?"}"`;
    if (!price.timber || !timbers.includes(price.timber)) problems.push(`${cell}: not one of the available timbers`);
    if (!isWholeAmount(price.amount)) problems.push(`${cell}: price must be a whole number above 0`);
    if (hasBundle !== (price.bundleAmount !== null)) {
      problems.push(`${cell}: ${hasBundle ? "bundle price missing" : "bundle price without a bundle"}`);
    } else if (price.bundleAmount !== null && !isWholeAmount(price.bundleAmount)) {
      problems.push(`${cell}: bundle price must be a whole number above 0`);
    }
    return { timber: price.timber ?? "", amount: price.amount ?? 0, bundleAmount: price.bundleAmount };
  });
  const present = prices.map((price) => price.timber);
  for (const slug of duplicates(present)) problems.push(`${rowName}: timber "${slug}" is priced twice`);
  for (const slug of timbers.filter((candidate) => !present.includes(candidate))) {
    problems.push(`${rowName}: no price for timber "${slug}"`);
  }
  return { label: raw.label?.trim() || null, isStart: raw.isStart === true, prices };
}

function buildBundle(raw: RawPricing, where: string, problems: string[]): PiecePricing["bundle"] {
  if (!raw.bundle) return null;
  const { label, quantity } = raw.bundle;
  if (!label || !BUNDLE_LABELS.includes(label) || quantity === null || !Number.isInteger(quantity) || quantity < 2) {
    problems.push(`${where}: bundle needs a label (pair or set of 8) and a quantity of 2 or more`);
    return null;
  }
  return { label: label as BundleLabel, quantity };
}

function checkStartAndSizes(pricing: PiecePricing, where: string, problems: string[]): void {
  const starts = pricing.rows.filter((row) => row.isStart);
  if (starts.length !== 1) {
    problems.push(`${where}: ${starts.length === 0 ? "no row is" : "more than one row is"} marked as the starting size`);
  } else if (!starts[0]?.prices.some((price) => price.timber === pricing.defaultTimber)) {
    problems.push(`${where}: the starting row has no price for the default timber "${pricing.defaultTimber}"`);
  }
  const labels = pricing.rows.flatMap((row) => (row.label ? [row.label] : []));
  for (const label of duplicates(labels)) problems.push(`${where}: size "${label}" appears twice`);
  const consistent = pricing.sizeLabel ? labels.length === pricing.rows.length : pricing.rows.length === 1 && labels.length === 0;
  if (!consistent) {
    problems.push(`${where}: use a size name with a size on every row, or no size name with a single row and no size`);
  }
}

/** Returns the validated table, or null when the piece has none. `timbers` are the slugs the piece offers. */
export function buildPricing(raw: RawPricing | null, timbers: string[], where: string, problems: string[]): PiecePricing | null {
  if (!raw) return null;
  const name = `${where} pricing`;
  const hasBundle = raw.bundle !== null;
  const rows = (raw.rows ?? []).map((row, index) =>
    buildRow(row, `${name} row ${row.label ? `"${row.label}"` : index + 1}`, timbers, hasBundle, problems),
  );
  if (rows.length === 0) problems.push(`${name}: no rows`);
  if (!raw.defaultTimber || !timbers.includes(raw.defaultTimber)) {
    problems.push(`${name}: default timber "${raw.defaultTimber ?? ""}" is not one of the available timbers`);
  }
  const pricing: PiecePricing = {
    sizeLabel: raw.sizeLabel?.trim() || null,
    defaultTimber: raw.defaultTimber ?? "",
    priceSuffix: raw.priceSuffix?.trim() || null,
    cardSuffix: raw.cardSuffix?.trim() || null,
    bundle: buildBundle(raw, name, problems),
    rows,
  };
  checkStartAndSizes(pricing, name, problems);
  return pricing;
}
