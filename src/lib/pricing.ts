/**
 * Pure price logic shared by the cards, the piece page and the enquiry form. No Sanity import:
 * timbers are identified by their slug and sizes by their row label.
 */

export interface PriceCell {
  timber: string;
  amount: number;
  bundleAmount: number | null;
}

export interface PriceRow {
  /** The size, or null for a piece priced by timber only. */
  label: string | null;
  isStart: boolean;
  prices: PriceCell[];
}

export type BundleLabel = "pair" | "set of 8";

export interface Bundle {
  label: BundleLabel;
  quantity: number;
}

export interface PiecePricing {
  sizeLabel: string | null;
  defaultTimber: string;
  priceSuffix: string | null;
  cardSuffix: string | null;
  bundle: Bundle | null;
  rows: PriceRow[];
}

export interface Selection {
  timber: string;
  /** The row label, or null when the piece has no size control. */
  size: string | null;
}

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

/** "$4,300". Written by hand so server and browser always agree. */
export function formatPrice(amount: number): string {
  return `$${String(amount).replace(THOUSANDS, ",")}`;
}

function withSuffix(price: string, suffix: string | null): string {
  return suffix ? `${price} ${suffix}` : price;
}

function minimum(values: number[]): number {
  return values.reduce((lowest, value) => Math.min(lowest, value), Infinity);
}

function allCells(pricing: PiecePricing): PriceCell[] {
  return pricing.rows.flatMap((row) => row.prices);
}

export function lowestAmount(pricing: PiecePricing): number {
  return minimum(allCells(pricing).map((cell) => cell.amount));
}

function lowestBundleAmount(pricing: PiecePricing): number | null {
  const amounts = allCells(pricing).flatMap((cell) => (cell.bundleAmount === null ? [] : [cell.bundleAmount]));
  return amounts.length > 0 ? minimum(amounts) : null;
}

/** The card text: "From $430 · Pair $740" for a pair bundle, otherwise "From $900 installed" and the like. */
export function cardPriceText(pricing: PiecePricing): string {
  const from = `From ${withSuffix(formatPrice(lowestAmount(pricing)), pricing.cardSuffix)}`;
  const bundleAmount = lowestBundleAmount(pricing);
  return pricing.bundle?.label === "pair" && bundleAmount !== null ? `${from} · Pair ${formatPrice(bundleAmount)}` : from;
}

/** The page price before anything is chosen, for page descriptions: "From $430 each". */
export function fromPriceText(pricing: PiecePricing): string {
  return `From ${withSuffix(formatPrice(lowestAmount(pricing)), pricing.priceSuffix)}`;
}

export function startSelection(pricing: PiecePricing): Selection {
  const start = pricing.rows.find((row) => row.isStart) ?? pricing.rows[0];
  return { timber: pricing.defaultTimber, size: start?.label ?? null };
}

export function findCell(pricing: PiecePricing, selection: Selection): PriceCell | undefined {
  const row = pricing.rows.find((candidate) => candidate.label === selection.size);
  return row?.prices.find((cell) => cell.timber === selection.timber);
}

/** The exact price of a selection: "$4,300", or "$400 each" when the piece has a suffix. */
export function selectionPriceText(pricing: PiecePricing, selection: Selection): string | null {
  const cell = findCell(pricing, selection);
  return cell ? withSuffix(formatPrice(cell.amount), pricing.priceSuffix) : null;
}

/** "Or $3,000 for a set of 8, saving $200", or null when the piece has no bundle. */
export function bundleLine(pricing: PiecePricing, selection: Selection): string | null {
  const cell = findCell(pricing, selection);
  if (!pricing.bundle || !cell || cell.bundleAmount === null) return null;
  const saving = pricing.bundle.quantity * cell.amount - cell.bundleAmount;
  return `Or ${formatPrice(cell.bundleAmount)} for a ${pricing.bundle.label}, saving ${formatPrice(saving)}`;
}

/** Keeps a timber and size from a link only when this piece really offers that combination. */
export function resolveSelection(pricing: PiecePricing, timber: string | null, size: string | null): Selection {
  const fallback = startSelection(pricing);
  const sizeKnown = pricing.rows.some((row) => row.label !== null && row.label === size);
  const chosen: Selection = {
    timber: timber ?? fallback.timber,
    size: sizeKnown ? size : fallback.size,
  };
  return findCell(pricing, chosen) ? chosen : { timber: fallback.timber, size: chosen.size };
}
