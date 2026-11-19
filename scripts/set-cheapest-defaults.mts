/**
 * Sets every priced piece to open on its cheapest option.
 *
 * Rule from the client: the piece page opens on the smallest size (the first row) and on the first timber, in
 * the piece's availableTimbers order, that has the lowest price in that row. Timber-only pieces use the same
 * timber rule on their single row.
 *
 *   node --experimental-strip-types scripts/set-cheapest-defaults.mts                       dry run (default): reads, prints, writes nothing
 *   SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/set-cheapest-defaults.mts --apply --yes
 *
 * Reads content/pricing.json and the live availableTimbers order and price rows (public dataset, read-only).
 * --apply patches only pricing.defaultTimber and the isStart flag of the rows that change, one transaction,
 * each piece guarded by ifRevisionId. A piece with an unpublished draft, without a price table, or whose live
 * table differs from content/pricing.json is skipped and reported. The token is read from the environment and
 * only for --apply. Never commit it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@sanity/client";

const PROJECT_ID = "ka21otlh";
const DATASET = "production";
const API_VERSION = "2025-01-01";
const PRICING_PATH = path.join(import.meta.dirname, "..", "content", "pricing.json");

export interface SourceCell {
  timber: string;
  amount: number;
}

export interface SourceRow {
  label?: string;
  isStart: boolean;
  prices: SourceCell[];
}

export interface SourcePricing {
  slug: string;
  defaultTimber: string;
  rows: SourceRow[];
}

export interface Choice {
  timber: string;
  size: string | null;
  amount: number;
}

export interface Comparison {
  slug: string;
  current: Choice | null;
  next: Choice;
  /** Index of the row that is the starting size once the rule is applied. */
  nextRowIndex: number;
  changed: boolean;
  /** The first timber in the availableTimbers order is not the cheapest one in the start row. */
  firstTimberNotCheapest: boolean;
  /** The new default price differs from the lowest price in the whole table (the card price). */
  cardMismatch: boolean;
  cardAmount: number;
}

interface LiveCell {
  timber: string | null;
  amount: number | null;
}

interface LiveRow {
  _key: string;
  label: string | null;
  isStart: boolean | null;
  prices: LiveCell[] | null;
}

interface LivePiece {
  _id: string;
  _rev: string;
  slug: string | null;
  timbers: (string | null)[] | null;
  defaultTimber: string | null;
  rows: LiveRow[] | null;
}

interface Patch {
  slug: string;
  id: string;
  rev: string;
  set: Record<string, unknown>;
}

function amountOf(row: SourceRow, timber: string): number | null {
  return row.prices.find((price) => price.timber === timber)?.amount ?? null;
}

function currentChoice(source: SourcePricing): Choice | null {
  const row = source.rows.find((candidate) => candidate.isStart);
  const amount = row ? amountOf(row, source.defaultTimber) : null;
  return row && amount !== null ? { timber: source.defaultTimber, size: row.label ?? null, amount } : null;
}

/** The first timber in `order` with the lowest price in the row, or null when no timber of the order is priced. */
export function cheapestTimber(row: SourceRow, order: string[]): Choice | null {
  let best: Choice | null = null;
  for (const timber of order) {
    const amount = amountOf(row, timber);
    if (amount !== null && (best === null || amount < best.amount)) best = { timber, size: row.label ?? null, amount };
  }
  return best;
}

export function compare(source: SourcePricing, order: string[]): Comparison | null {
  const firstRow = source.rows[0];
  const next = firstRow ? cheapestTimber(firstRow, order) : null;
  if (!firstRow || !next) return null;
  const cardAmount = Math.min(...source.rows.flatMap((row) => row.prices.map((price) => price.amount)));
  const current = currentChoice(source);
  const firstTimber = order[0];
  return {
    slug: source.slug,
    current,
    next,
    nextRowIndex: 0,
    changed: current?.timber !== next.timber || current?.size !== next.size,
    firstTimberNotCheapest: firstTimber !== undefined && firstTimber !== next.timber,
    cardMismatch: next.amount !== cardAmount,
    cardAmount,
  };
}

/** The new source entry: defaultTimber set and only the first row marked as the start. */
export function withCheapestDefault(source: SourcePricing, comparison: Comparison): SourcePricing {
  return {
    ...source,
    defaultTimber: comparison.next.timber,
    rows: source.rows.map((row, index) => ({ ...row, isStart: index === comparison.nextRowIndex })),
  };
}

function describe(choice: Choice | null): string {
  return choice ? `${choice.timber}, ${choice.size ?? "no size"}, $${choice.amount}` : "none";
}

/** Live rows must carry the same sizes and prices as content/pricing.json, otherwise patching by position is unsafe. */
function liveDrift(source: SourcePricing, live: LivePiece): string[] {
  const rows = live.rows ?? [];
  const problems: string[] = [];
  if (rows.length !== source.rows.length) problems.push(`live table has ${rows.length} rows, content/pricing.json has ${source.rows.length}`);
  source.rows.forEach((row, index) => {
    const liveRow = rows[index];
    if (!liveRow || (liveRow.label ?? undefined) !== row.label) problems.push(`row ${index + 1}: size differs from the live table`);
    else if (row.prices.some((price) => liveRow.prices?.find((cell) => cell.timber === price.timber)?.amount !== price.amount)) {
      problems.push(`row ${row.label ?? index + 1}: prices differ from the live table`);
    }
  });
  return problems;
}

function buildPatch(source: SourcePricing, comparison: Comparison, live: LivePiece, timberIds: Map<string, string>): Patch | string {
  const timberId = timberIds.get(comparison.next.timber);
  if (!timberId) return `no material document for ${comparison.next.timber}`;
  const set: Record<string, unknown> = {};
  if (live.defaultTimber !== comparison.next.timber) set["pricing.defaultTimber"] = { _type: "reference", _ref: timberId };
  (live.rows ?? []).forEach((row, index) => {
    const wanted = index === comparison.nextRowIndex;
    if ((row.isStart ?? false) !== wanted) set[`pricing.rows[_key=="${row._key}"].isStart`] = wanted;
  });
  return { slug: source.slug, id: live._id, rev: live._rev, set };
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
      `*[_type == "piece"]{_id, _rev, "slug": slug.current, "timbers": availableTimbers[]->slug.current,
        "defaultTimber": pricing.defaultTimber->slug.current,
        "rows": pricing.rows[]{_key, label, isStart, "prices": prices[]{"timber": timber->slug.current, amount}}}`,
    ),
  ]);
  const timberIds = new Map(materials.map((material) => [material.slug, material._id]));
  const published = new Map(pieces.filter((piece) => !piece._id.startsWith("drafts.")).map((piece) => [piece.slug, piece]));
  const draftIds = new Set(pieces.filter((piece) => piece._id.startsWith("drafts.")).map((piece) => piece._id));

  const patches: Patch[] = [];
  const notes: string[] = [];
  const problems: string[] = [];
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${sources.length} priced pieces\n`);
  console.log("piece | current (timber, size, price) | new (timber, size, price) | change");

  for (const source of sources) {
    const live = published.get(source.slug);
    const order = (live?.timbers ?? []).filter((slug): slug is string => slug !== null);
    const result = live ? compare(source, order) : null;
    if (!live || !result) {
      problems.push(`${source.slug}: no published piece or no priced timber in its availableTimbers`);
      continue;
    }
    console.log(`${source.slug} | ${describe(result.current)} | ${describe(result.next)} | ${result.changed ? "CHANGES" : "same"}`);
    if (result.firstTimberNotCheapest) notes.push(`${source.slug}: first timber ${order[0]} is not the cheapest (${result.next.timber} at $${result.next.amount}); the client's two statements disagree`);
    if (result.cardMismatch) problems.push(`${source.slug}: new default $${result.next.amount} differs from the card price $${result.cardAmount}`);
    if (draftIds.has(`drafts.${live._id}`)) {
      notes.push(`${source.slug}: has an unpublished draft (drafts.${live._id}), skipped`);
      continue;
    }
    if (!live.rows) {
      if (result.changed) notes.push(`${source.slug}: no price table in the live dataset yet, skipped`);
      continue;
    }
    const drift = liveDrift(source, live);
    if (drift.length > 0) {
      problems.push(...drift.map((line) => `${source.slug}: ${line}`));
      continue;
    }
    const patch = buildPatch(source, result, live, timberIds);
    if (typeof patch === "string") problems.push(`${source.slug}: ${patch}`);
    else if (Object.keys(patch.set).length > 0) patches.push(patch);
  }

  for (const line of notes) console.log(`NOTE ${line}`);
  for (const line of problems) console.error(`PROBLEM ${line}`);
  console.log(`\n${patches.length} live pieces to patch, ${notes.length} notes, ${problems.length} problems`);
  if (problems.length > 0) process.exitCode = 1;
  if (!apply || problems.length > 0) {
    if (!apply) console.log("Dry run: nothing was written.");
    return;
  }

  const transaction = client.transaction();
  for (const patch of patches) transaction.patch(patch.id, (builder) => builder.ifRevisionId(patch.rev).set(patch.set));
  await transaction.commit();
  console.log(`Patched ${patches.length} pieces.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
