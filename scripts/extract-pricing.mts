/**
 * Turns the price logic of the original single-file site into explicit, reviewable data.
 *
 *   node --experimental-strip-types scripts/extract-pricing.mts <original.html> \
 *     [--reference <js_tables.json>] [--review <pricing-review.html>]
 *
 * Reads the constants, each piece's data-* attributes and its timber and size options from the original,
 * prices every cell with the original formulas (A: size table, B: Rex chair, C: ratio) and writes
 * content/pricing.json. Timber keys are the Sanity material slugs, read from the public dataset (read-only).
 * With --review it also writes a self-contained HTML table per piece for the client.
 * data: URIs are stripped in memory and never printed. Exits non-zero if any validation fails;
 * nothing is written in that case.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@sanity/client";

const PROJECT_ID = "ka21otlh";
const DATASET = "production";
const API_VERSION = "2025-01-01";
const PRICING_PATH = path.join(import.meta.dirname, "..", "content", "pricing.json");
const PIECES_PATH = path.join(import.meta.dirname, "..", "content", "pieces.json");
const CHAIR_SET_SIZE = 8;
const CHAIR_SET_DISCOUNT = 200;

type Mechanism = "table" | "ratio" | "chair";

export interface Constants {
  size: Record<string, number>;
  timber: Record<string, number>;
  rex: Record<string, number>;
  length: Record<string, number>;
  ratio: Record<string, number>;
}

interface Attrs {
  base: number;
  bt: string;
  wadd: number;
  add: number;
  l0: string | null;
  pair: number;
  unit: string;
}

interface OptionGroup {
  label: string;
  values: string[];
  on: string;
}

export interface ParsedPiece {
  title: string;
  mechanism: Mechanism;
  attrs: Attrs;
  timbers: OptionGroup;
  sizes: OptionGroup | null;
}

export interface Cell {
  timber: string;
  size: string | null;
  amount: number;
  bundleAmount?: number;
}

interface BundleSpec {
  label: string;
  quantity: number;
}

export interface PricedPiece {
  slug: string;
  title: string;
  parsed: ParsedPiece;
  bundle: BundleSpec | null;
  cells: Cell[];
}

interface PricingRow {
  label?: string;
  isStart: boolean;
  prices: { timber: string; amount: number; bundleAmount?: number }[];
}

export interface PricingEntry {
  slug: string;
  sizeLabel?: string;
  defaultTimber: string;
  startSize?: string;
  priceSuffix: string;
  bundle?: BundleSpec;
  rows: PricingRow[];
}

interface SourcePiece {
  slug: string;
  name: string;
  cardPrice: string;
  pagePrice: string;
  priceNote: string | null;
  availableTimbers: string[];
}

interface Report {
  errors: string[];
  anomalies: string[];
  skipped: string[];
}

// ---------------------------------------------------------------- reading the original

const DATA_URI = /data:[a-zA-Z0-9/+.;=-]*base64,[A-Za-z0-9+/=]+/g;

export function stripDataUris(html: string): string {
  return html.replace(DATA_URI, "data:");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "number")
  );
}

function readConstant(html: string, name: string): Record<string, number> {
  const match = new RegExp(`var ${name}=(\\{[^}]*\\});`).exec(html);
  if (!match?.[1]) throw new Error(`constant ${name} not found in the original`);
  const parsed: unknown = JSON.parse(match[1]);
  if (!isNumberRecord(parsed)) throw new Error(`constant ${name} is not a map of numbers`);
  return parsed;
}

export function readConstants(html: string): Constants {
  return {
    size: readConstant(html, "CFG_SIZE"),
    timber: readConstant(html, "CFG_TIMBER"),
    rex: readConstant(html, "REX_P"),
    length: readConstant(html, "LEN_R"),
    ratio: readConstant(html, "RATIO_T"),
  };
}

function assertChairFormula(html: string): void {
  const expected = `st=p*${CHAIR_SET_SIZE}-${CHAIR_SET_DISCOUNT}`;
  if (!html.includes(expected)) throw new Error(`the Rex set formula is no longer "${expected}"`);
  if (!html.includes(`for a set of ${CHAIR_SET_SIZE}, saving $${CHAIR_SET_DISCOUNT}`)) {
    throw new Error("the Rex set text changed; review the chair bundle in the original");
  }
}

function attributesOf(tag: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of tag.matchAll(/([a-z][a-z0-9-]*)="([^"]*)"/g)) {
    if (match[1] !== undefined && match[2] !== undefined) attrs.set(match[1], match[2]);
  }
  return attrs;
}

function numberAttr(attrs: Map<string, string>, name: string, where: string): number {
  const raw = attrs.get(name);
  if (raw === undefined || raw === "") return 0;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${where}: ${name}="${raw}" is not a number`);
  return value;
}

function readGroups(section: string, where: string): Map<string, OptionGroup> {
  const groups = new Map<string, OptionGroup>();
  const groupPattern = /<span>(.*?)<\/span><div class="cfg-o" data-k="(\w)">(.*?)<\/div><\/div>/gs;
  for (const group of section.matchAll(groupPattern)) {
    const [, label, key, body] = group;
    if (label === undefined || key === undefined || body === undefined) continue;
    const values: string[] = [];
    let on: string | null = null;
    for (const button of body.matchAll(/<button\b([^>]*)>/g)) {
      const value = /data-v="([^"]*)"/.exec(button[1] ?? "")?.[1];
      if (value === undefined) throw new Error(`${where}: option button without data-v`);
      values.push(decodeEntities(value));
      if (/\bclass="?on\b/.test(button[1] ?? "")) on = decodeEntities(value);
    }
    if (on === null) throw new Error(`${where}: option group "${label}" has no default`);
    groups.set(key, { label: decodeEntities(label), values, on });
  }
  return groups;
}

interface Configurator {
  index: number;
  attrs: Map<string, string>;
}

/** The configurator is the first div whose class list contains "cfg"; attribute order varies. */
function findConfigurator(segment: string): Configurator | null {
  for (const tag of segment.matchAll(/<div\b([^>]*)>/g)) {
    const attrs = attributesOf(tag[1] ?? "");
    if ((attrs.get("class") ?? "").split(/\s+/).includes("cfg")) return { index: tag.index, attrs };
  }
  return null;
}

function parsePiece(segment: string, id: string): ParsedPiece {
  const title = decodeEntities(/<h1>(.*?)<\/h1>/s.exec(segment)?.[1] ?? "").trim();
  if (title === "") throw new Error(`${id}: no title`);
  const cfg = findConfigurator(segment);
  if (!cfg) throw new Error(`${title}: no price configurator`);
  const end = segment.indexOf('class="pd-desc"', cfg.index);
  const groups = readGroups(segment.slice(cfg.index, end === -1 ? undefined : end), title);
  const timbers = groups.get("t");
  if (!timbers) throw new Error(`${title}: no timber options`);
  const attrs = cfg.attrs;
  const classes = (attrs.get("class") ?? "").split(/\s+/);
  const mechanism: Mechanism = classes.includes("cfg-chair") ? "chair" : classes.includes("cfg-ratio") ? "ratio" : "table";
  return {
    title,
    mechanism,
    timbers,
    sizes: groups.get("z") ?? null,
    attrs: {
      base: numberAttr(attrs, "data-base", title),
      bt: attrs.get("data-bt") ?? "",
      wadd: numberAttr(attrs, "data-wadd", title),
      add: numberAttr(attrs, "data-add", title),
      l0: attrs.get("data-l0") ?? null,
      pair: numberAttr(attrs, "data-pair", title),
      unit: attrs.get("data-unit") ?? "",
    },
  };
}

export function readPieces(html: string): ParsedPiece[] {
  const anchors = [...html.matchAll(/id="((?:piece|page)-[^"]+)"/g)];
  const pieces: ParsedPiece[] = [];
  anchors.forEach((anchor, index) => {
    const id = anchor[1];
    if (id === undefined || !id.startsWith("piece-")) return;
    const next = anchors[index + 1]?.index ?? html.length;
    pieces.push(parsePiece(html.slice(anchor.index, next), id));
  });
  return pieces;
}

// ---------------------------------------------------------------- the original formulas

function lookup(map: Record<string, number>, key: string, where: string): number {
  const value = map[key];
  if (value === undefined) throw new Error(`${where}: no entry for "${key}"`);
  return value;
}

/** ratioP in the original. */
function ratioPrice(value: number, timber: string, baseTimber: string, c: Constants, where: string): number {
  if (timber === baseTimber) return value;
  return Math.round((value * lookup(c.ratio, timber, where)) / lookup(c.ratio, baseTimber, where) / 10) * 10;
}

/** Mechanism A: size table plus timber difference. */
function tablePrice(a: Attrs, timber: string, size: string, c: Constants, where: string): number {
  const price =
    a.base + lookup(c.size, size, where) + lookup(c.timber, timber, where) - lookup(c.timber, a.bt, where);
  return timber === "Walnut" ? price + a.wadd : price;
}

/** Mechanism C: timber ratio, with an optional length factor. */
function ratioCellPrice(a: Attrs, timber: string, size: string | null, c: Constants, where: string): number {
  let body: number;
  if (size === null) {
    body = ratioPrice(a.base, timber, a.bt, c, where);
  } else {
    const lengthFactor =
      a.l0 !== null ? 1 + (0.5 * (Number(size) - Number(a.l0))) / Number(a.l0) : lookup(c.length, size, where);
    const atBase = a.l0 !== null ? size === a.l0 : size === "2000";
    body =
      timber === a.bt && atBase
        ? a.base
        : Math.round(
            ((a.base * lookup(c.ratio, timber, where)) / lookup(c.ratio, a.bt, where)) * lengthFactor / 10,
          ) * 10;
  }
  const price = a.add + body;
  return timber === "Walnut" ? price + a.wadd : price;
}

function pairBundle(piece: ParsedPiece): BundleSpec | null {
  return piece.attrs.pair > 0 ? { label: "Pair", quantity: 2 } : null;
}

export function priceCells(piece: ParsedPiece, c: Constants): Cell[] {
  const where = piece.title;
  const sizes = piece.sizes ? piece.sizes.values : [null];
  const cells: Cell[] = [];
  for (const size of sizes) {
    for (const timber of piece.timbers.values) {
      if (piece.mechanism === "chair") {
        const each = lookup(c.rex, timber, where);
        cells.push({ timber, size, amount: each, bundleAmount: each * CHAIR_SET_SIZE - CHAIR_SET_DISCOUNT });
      } else if (piece.mechanism === "table") {
        if (size === null) throw new Error(`${where}: size table piece without sizes`);
        cells.push({ timber, size, amount: tablePrice(piece.attrs, timber, size, c, where) });
      } else {
        const amount = ratioCellPrice(piece.attrs, timber, size, c, where);
        const cell: Cell = { timber, size, amount };
        if (piece.attrs.pair > 0) {
          if (size !== null) throw new Error(`${where}: pair price with sizes is not supported`);
          cell.bundleAmount = ratioPrice(piece.attrs.pair, timber, piece.attrs.bt, c, where);
        }
        cells.push(cell);
      }
    }
  }
  return cells;
}

// ---------------------------------------------------------------- materials and slugs

export interface Material {
  name: string;
  slug: string;
}

async function fetchMaterials(): Promise<Material[]> {
  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: API_VERSION,
    useCdn: false,
    perspective: "published",
  });
  const rows = await client.fetch<{ _id: string; name: string; slug: string | null }[]>(
    `*[_type == "material"]{_id, name, "slug": slug.current}`,
  );
  return rows.map((row) => {
    if (!row.slug || row._id !== `material-${row.slug}`) {
      throw new Error(`material ${row._id} (${row.name}) does not have the id material-<slug>`);
    }
    return { name: row.name, slug: row.slug };
  });
}

export function mapTimbers(names: string[], materials: Material[]): Map<string, string> {
  const bySlugName = new Map(materials.map((m) => [m.name.trim().toLowerCase(), m.slug]));
  const mapping = new Map<string, string>();
  const missing: string[] = [];
  for (const name of names) {
    const slug = bySlugName.get(name.trim().toLowerCase());
    if (slug === undefined) missing.push(name);
    else mapping.set(name, slug);
  }
  if (missing.length > 0) {
    throw new Error(`no Sanity material for timber name(s): ${missing.map((n) => `"${n}"`).join(", ")}`);
  }
  return mapping;
}

// ---------------------------------------------------------------- assembling the entries

function readSourcePieces(): SourcePiece[] {
  const parsed: unknown = JSON.parse(readFileSync(PIECES_PATH, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("content/pieces.json is not an array");
  return parsed as SourcePiece[];
}

function isSkipped(piece: ParsedPiece): boolean {
  return piece.mechanism === "ratio" && piece.attrs.base === 0;
}

export function priceAll(parsed: ParsedPiece[], sources: SourcePiece[], c: Constants, report: Report): PricedPiece[] {
  const slugByName = new Map(sources.map((s) => [s.name, s.slug]));
  const priced: PricedPiece[] = [];
  for (const piece of parsed) {
    const slug = slugByName.get(piece.title);
    if (slug === undefined) {
      report.errors.push(`${piece.title}: no piece with this name in content/pieces.json`);
      continue;
    }
    if (isSkipped(piece)) {
      report.skipped.push(`${piece.title} (${slug}): no prices in the original, stays "Price on request"`);
      continue;
    }
    const bundle = piece.mechanism === "chair" ? { label: `Set of ${CHAIR_SET_SIZE}`, quantity: CHAIR_SET_SIZE } : pairBundle(piece);
    priced.push({ slug, title: piece.title, parsed: piece, bundle, cells: priceCells(piece, c) });
  }
  for (const source of sources) {
    const found = parsed.some((p) => p.title === source.name);
    if (!found) report.errors.push(`${source.name} (${source.slug}): piece is in content/pieces.json but not in the original`);
  }
  return priced;
}

function suffixOf(piece: ParsedPiece): string {
  return piece.mechanism === "chair" ? "each" : piece.attrs.unit.trim();
}

export function buildEntry(piece: PricedPiece, slugs: Map<string, string>): PricingEntry {
  const { parsed } = piece;
  const sizes = parsed.sizes ? parsed.sizes.values : [null];
  const slugOf = (name: string): string => {
    const slug = slugs.get(name);
    if (slug === undefined) throw new Error(`${piece.title}: timber "${name}" has no slug`);
    return slug;
  };
  const rows = sizes.map((size): PricingRow => {
    const prices = piece.cells
      .filter((cell) => cell.size === size)
      .map((cell) => ({
        timber: slugOf(cell.timber),
        amount: cell.amount,
        ...(cell.bundleAmount !== undefined ? { bundleAmount: cell.bundleAmount } : {}),
      }));
    const isStart = parsed.sizes ? size === parsed.sizes.on : true;
    return { ...(size !== null ? { label: size } : {}), isStart, prices };
  });
  return {
    slug: piece.slug,
    ...(parsed.sizes ? { sizeLabel: parsed.sizes.label } : {}),
    defaultTimber: slugOf(parsed.timbers.on),
    ...(parsed.sizes ? { startSize: parsed.sizes.on } : {}),
    priceSuffix: suffixOf(parsed),
    ...(piece.bundle ? { bundle: piece.bundle } : {}),
    rows,
  };
}

// ---------------------------------------------------------------- validation

function amountsOf(entry: PricingEntry): number[] {
  return entry.rows.flatMap((row) => row.prices.map((price) => price.amount));
}

function validateCells(piece: PricedPiece, report: Report): void {
  const sizes = piece.parsed.sizes ? piece.parsed.sizes.values : [null];
  const seen = new Map<string, number>();
  for (const cell of piece.cells) {
    const key = `${cell.timber}|${cell.size}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (!Number.isInteger(cell.amount) || cell.amount <= 0) {
      report.errors.push(`${piece.title}: ${key} price ${cell.amount} is not a positive integer`);
    }
    if (cell.bundleAmount !== undefined && (!Number.isInteger(cell.bundleAmount) || cell.bundleAmount <= 0)) {
      report.errors.push(`${piece.title}: ${key} bundle price ${cell.bundleAmount} is not a positive integer`);
    }
  }
  for (const size of sizes) {
    for (const timber of piece.parsed.timbers.values) {
      const count = seen.get(`${timber}|${size}`) ?? 0;
      if (count !== 1) report.errors.push(`${piece.title}: ${timber} x ${size ?? "n/a"} has ${count} prices`);
    }
  }
  if (new Set(piece.parsed.timbers.values).size !== piece.parsed.timbers.values.length) {
    report.errors.push(`${piece.title}: duplicate timber options`);
  }
}

function firstDollarAmount(text: string): number | null {
  const match = /\$([\d,]+)/.exec(text);
  return match?.[1] ? Number(match[1].replace(/,/g, "")) : null;
}

export function startCell(entry: PricingEntry): number | null {
  const starts = entry.rows.filter((row) => row.isStart);
  const price = starts[0]?.prices.find((p) => p.timber === entry.defaultTimber);
  return price?.amount ?? null;
}

function validateStart(entry: PricingEntry, source: SourcePiece, report: Report): void {
  const starts = entry.rows.filter((row) => row.isStart).length;
  if (starts > 1) report.errors.push(`${source.name}: ${starts} start rows, expected at most one`);
  const found = startCell(entry);
  for (const [field, text] of [["pagePrice", source.pagePrice], ["cardPrice", source.cardPrice]] as const) {
    const expected = firstDollarAmount(text);
    if (expected === null || found === null || expected !== found) {
      report.errors.push(`${source.name} ${field}: expected ${expected ?? `no number in "${text}"`}, found ${found ?? "no start cell"}`);
    }
  }
}

function checkReference(pieces: PricedPiece[], reference: Record<string, Record<string, number>>, report: Report): number {
  let checked = 0;
  const wanted = new Set<string>();
  for (const piece of pieces) {
    const table = reference[piece.title];
    if (!table) {
      console.log(`note: ${piece.title} is not in the reference tables, ${piece.cells.length} cells not cross-checked`);
      continue;
    }
    for (const cell of piece.cells) {
      const key = `${cell.timber}|${cell.size}`;
      wanted.add(`${piece.title}|${key}`);
      checked += 1;
      if (table[key] !== cell.amount) {
        report.errors.push(`reference: ${piece.title} ${key}: reference ${table[key] ?? "missing"}, computed ${cell.amount}`);
      }
    }
    for (const key of Object.keys(table)) {
      if (!wanted.has(`${piece.title}|${key}`)) report.errors.push(`reference: ${piece.title} ${key} has no computed cell`);
    }
  }
  return checked;
}

function readReference(file: string): Record<string, Record<string, number>> {
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null) throw new Error("reference file is not an object");
  const tables: Record<string, Record<string, number>> = {};
  for (const [title, table] of Object.entries(parsed)) {
    if (!isNumberRecord(table)) throw new Error(`reference table for ${title} is not a map of numbers`);
    tables[title] = table;
  }
  return tables;
}

// ---------------------------------------------------------------- anomalies

function cellAt(piece: PricedPiece, timber: string, size: string | null): Cell | undefined {
  return piece.cells.find((cell) => cell.timber === timber && cell.size === size);
}

function lowest(piece: PricedPiece): Cell {
  const first = piece.cells[0];
  if (!first) throw new Error(`${piece.title}: no cells`);
  return piece.cells.reduce((best, cell) => (cell.amount < best.amount ? cell : best), first);
}

function describe(cell: Cell): string {
  return `${cell.timber}${cell.size ? ` ${cell.size}` : ""} ${money(cell.amount)}`;
}

function findEqualRatioDifferences(piece: PricedPiece, c: Constants, report: Report): void {
  const weight = piece.parsed.mechanism === "table" ? c.timber : c.ratio;
  const sizes = piece.parsed.sizes ? piece.parsed.sizes.values : [null];
  const groups = new Map<number, string[]>();
  for (const timber of piece.parsed.timbers.values) {
    const key = weight[timber];
    if (key !== undefined) groups.set(key, [...(groups.get(key) ?? []), timber]);
  }
  for (const [, names] of groups) {
    if (names.length < 2) continue;
    const diffs = sizes.filter((size) => new Set(names.map((n) => cellAt(piece, n, size)?.amount)).size > 1);
    if (diffs.length === 0) continue;
    const size = diffs[0] ?? null;
    const detail = names.map((n) => `${n} $${cellAt(piece, n, size)?.amount}`).join(" vs ");
    report.anomalies.push(`${piece.title}: timbers priced as equal differ by rounding (${detail}${size ? ` at ${size}` : ""}); ${diffs.length} of ${sizes.length} sizes affected`);
  }
}

function findBundleIssues(piece: PricedPiece, source: SourcePiece, report: Report): void {
  const bundle = piece.bundle;
  if (!bundle) return;
  const savings = piece.cells.map((cell) => cell.amount * bundle.quantity - (cell.bundleAmount ?? 0));
  const min = Math.min(...savings);
  const max = Math.max(...savings);
  const noted = /saving \$([\d,]+)/.exec(source.priceNote ?? "")?.[1];
  const text = noted ? `"saving $${noted}"` : "no saving text";
  if (min !== max) report.anomalies.push(`${piece.title}: ${bundle.label.toLowerCase()} saving varies from $${min} to $${max} by timber against ${text}`);
  else if (noted && Number(noted.replace(/,/g, "")) !== min) report.anomalies.push(`${piece.title}: saving is $${min} for every timber but the text says $${noted}`);
  const start = cellAt(piece, piece.parsed.timbers.on, null);
  const shown = /\$([\d,]+) for a/.exec(source.priceNote ?? "")?.[1];
  if (start?.bundleAmount !== undefined && shown && Number(shown.replace(/,/g, "")) !== start.bundleAmount) {
    report.errors.push(`${piece.title} priceNote: expected $${start.bundleAmount} for the ${bundle.label.toLowerCase()}, found $${shown}`);
  }
}

function findIdenticalTables(entries: PricingEntry[], titles: Map<string, string>, report: Report): void {
  const bySignature = new Map<string, string[]>();
  for (const entry of entries) {
    const signature = JSON.stringify([entry.sizeLabel, entry.rows.map((r) => [r.label, r.prices])]);
    bySignature.set(signature, [...(bySignature.get(signature) ?? []), titles.get(entry.slug) ?? entry.slug]);
  }
  for (const names of bySignature.values()) {
    if (names.length > 1) report.anomalies.push(`${names.join(" and ")} have identical price tables`);
  }
}

function findWalnutSurcharge(parsed: ParsedPiece[], report: Report): void {
  const flat = parsed.filter((p) => p.mechanism !== "chair");
  const present = flat.filter((p) => p.attrs.wadd > 0);
  const absent = flat.filter((p) => p.attrs.wadd === 0);
  const amounts = [...new Set(present.map((p) => p.attrs.wadd))].join("/");
  report.anomalies.push(`Walnut surcharge (+$${amounts}) present on ${present.length} pieces (${present.map((p) => p.title).join(", ")}) and absent on ${absent.length} (${absent.map((p) => p.title).join(", ")})`);
  if (parsed.some((p) => p.mechanism === "chair")) report.anomalies.push("The Rex has its own price list per timber and no Walnut surcharge setting");
}

function findStartNotLowest(piece: PricedPiece, entry: PricingEntry, report: Report): void {
  const start = startCell(entry);
  const cheapest = lowest(piece);
  if (start !== null && cheapest.amount < start) {
    report.anomalies.push(`${piece.title}: "From ${money(start)}" is not the lowest price, ${describe(cheapest)} is cheaper`);
  }
}

function findNonMonotonic(piece: PricedPiece, report: Report): void {
  if (!piece.parsed.sizes) return;
  for (const timber of piece.parsed.timbers.values) {
    const series = piece.parsed.sizes.values.map((size) => cellAt(piece, timber, size)?.amount ?? 0);
    if (series.some((value, i) => i > 0 && value <= (series[i - 1] ?? 0))) {
      report.anomalies.push(`${piece.title}: ${timber} prices do not rise with size (${series.join(", ")})`);
    }
  }
}

function findTimberListMismatch(piece: PricedPiece, source: SourcePiece, report: Report): void {
  const original = [...piece.parsed.timbers.values].sort().join(", ");
  const current = [...source.availableTimbers].sort().join(", ");
  if (original !== current) report.anomalies.push(`${piece.title}: timbers in pieces.json (${current}) differ from the original (${original})`);
}

function collectAnomalies(
  priced: PricedPiece[],
  parsed: ParsedPiece[],
  entries: PricingEntry[],
  sources: SourcePiece[],
  c: Constants,
  report: Report,
): void {
  const sourceBySlug = new Map(sources.map((s) => [s.slug, s]));
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  for (const piece of priced) {
    const source = sourceBySlug.get(piece.slug);
    const entry = entryBySlug.get(piece.slug);
    if (!source || !entry) continue;
    if (piece.parsed.mechanism !== "chair") findEqualRatioDifferences(piece, c, report);
    findBundleIssues(piece, source, report);
    findStartNotLowest(piece, entry, report);
    findNonMonotonic(piece, report);
    findTimberListMismatch(piece, source, report);
  }
  findWalnutSurcharge(parsed, report);
  findIdenticalTables(entries, new Map(priced.map((p) => [p.slug, p.title])), report);
}

// ---------------------------------------------------------------- review file

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const money = (value: number): string => `$${value.toLocaleString("en-AU")}`;

function renderTable(piece: PricedPiece): string {
  const { parsed } = piece;
  const sizes = parsed.sizes ? parsed.sizes.values : [null];
  const head = sizes.map((size) => `<th>${escapeHtml(size ?? "Price")}</th>`).join("");
  const bundleHead = piece.bundle ? `<th class="bundle">${escapeHtml(piece.bundle.label)}</th><th class="bundle">Saving</th>` : "";
  const corner = parsed.sizes ? `Timber \\ ${escapeHtml(parsed.sizes.label)}` : "Timber";
  const rows = parsed.timbers.values.map((timber) => {
    const cells = sizes.map((size) => {
      const cell = cellAt(piece, timber, size);
      const start = timber === parsed.timbers.on && size === (parsed.sizes ? parsed.sizes.on : null);
      return `<td${start ? ' class="start"' : ""}>${cell ? money(cell.amount) : "?"}</td>`;
    });
    const only = piece.bundle ? cellAt(piece, timber, sizes[0] ?? null) : undefined;
    const bundle = only?.bundleAmount !== undefined && piece.bundle
      ? `<td class="bundle">${money(only.bundleAmount)}</td><td class="bundle">${money(only.amount * piece.bundle.quantity - only.bundleAmount)}</td>`
      : "";
    return `<tr><th>${escapeHtml(timber)}</th>${cells.join("")}${bundle}</tr>`;
  });
  return `<table><thead><tr><th>${corner}</th>${head}${bundleHead}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

function renderPiece(piece: PricedPiece, entry: PricingEntry): string {
  const start = startCell(entry);
  const suffix = entry.priceSuffix ? ` ${escapeHtml(entry.priceSuffix)}` : "";
  const size = entry.startSize ? `, ${escapeHtml(entry.startSize)}` : "";
  const note = `Shown price: from ${start === null ? "?" : money(start)}${suffix} (${escapeHtml(piece.parsed.timbers.on)}${size}). Highlighted cell is that price.`;
  return `<section><h2>${escapeHtml(piece.title)}</h2><p class="note">${note}</p>${renderTable(piece)}</section>`;
}

const STYLE = `body{font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem;color:#222}
h1{font-size:1.6rem}h2{font-size:1.2rem;margin:2rem 0 .25rem}
.note{margin:.25rem 0 .5rem;color:#555;font-size:.9rem}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{border:1px solid #ccc;padding:.35rem .6rem;text-align:right}
thead th{background:#f2f2f2}tbody th{text-align:left;background:#fafafa;font-weight:600}
td.start{background:#ffe9a8;font-weight:700}
.bundle{background:#eef5ff}
.look li{margin:.3rem 0}
section{break-inside:avoid}`;

export function renderReview(priced: PricedPiece[], entries: PricingEntry[], anomalies: string[], skipped: string[]): string {
  const entryBySlug = new Map(entries.map((e) => [e.slug, e]));
  const list = anomalies.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const skippedList = skipped.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const sections = priced.map((piece) => {
    const entry = entryBySlug.get(piece.slug);
    return entry ? renderPiece(piece, entry) : "";
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CM Timberhaus price review</title><style>${STYLE}</style></head><body><h1>CM Timberhaus: price review</h1><p>Every price below is worked out from the original site's rules. Please check each table and tell us anything that looks wrong.</p><h2>Things worth a look</h2><ul class="look">${list}</ul><h2>Not priced</h2><ul>${skippedList}</ul>${sections.join("")}</body></html>`;
}

// ---------------------------------------------------------------- reporting and entry point

function summarise(piece: PricedPiece, entry: PricingEntry): string {
  const sizes = piece.parsed.sizes ? piece.parsed.sizes.values.join(", ") : "none";
  const start = startCell(entry);
  const bundle = piece.bundle ? `, bundle ${piece.bundle.label}` : "";
  return `${piece.title.padEnd(16)} ${String(piece.cells.length).padStart(3)} cells | ${piece.parsed.timbers.values.length} timbers | sizes: ${sizes} | start ${start === null ? "n/a" : `$${start}`}${entry.priceSuffix ? ` ${entry.priceSuffix}` : ""} (${piece.parsed.timbers.on}${entry.startSize ? `, ${entry.startSize}` : ""})${bundle}`;
}

interface Options {
  html: string;
  reference: string | null;
  review: string | null;
}

function parseArgs(argv: string[]): Options {
  const html = argv[0];
  if (!html || html.startsWith("--")) throw new Error("usage: extract-pricing.mts <original.html> [--reference file] [--review file]");
  const option = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : (argv[at + 1] ?? null);
  };
  return { html, reference: option("--reference"), review: option("--review") };
}

function printList(title: string, lines: string[]): void {
  console.log(`\n${title} (${lines.length})`);
  for (const line of lines) console.log(`  - ${line}`);
}

async function run(options: Options): Promise<number> {
  const html = stripDataUris(readFileSync(options.html, "utf8"));
  const constants = readConstants(html);
  assertChairFormula(html);
  const parsed = readPieces(html);
  const sources = readSourcePieces();
  const report: Report = { errors: [], anomalies: [], skipped: [] };
  const priced = priceAll(parsed, sources, constants, report);
  const timberNames = [...new Set(parsed.flatMap((p) => p.timbers.values))];
  const slugs = mapTimbers(timberNames, await fetchMaterials());
  const entries = priced.map((piece) => buildEntry(piece, slugs));
  const sourceBySlug = new Map(sources.map((s) => [s.slug, s]));
  priced.forEach((piece, i) => {
    validateCells(piece, report);
    const entry = entries[i];
    const source = sourceBySlug.get(piece.slug);
    if (entry && source) validateStart(entry, source, report);
  });
  const checked = options.reference ? checkReference(priced, readReference(options.reference), report) : 0;
  collectAnomalies(priced, parsed, entries, sources, constants, report);

  console.log(`${parsed.length} pieces in the original, ${priced.length} priced, ${entries.reduce((n, e) => n + amountsOf(e).length, 0)} cells`);
  priced.forEach((piece, i) => { const entry = entries[i]; if (entry) console.log(summarise(piece, entry)); });
  printList("Timber name to slug", [...slugs].map(([name, slug]) => `${name} -> ${slug}`));
  printList("Skipped", report.skipped);
  printList("Anomalies", report.anomalies);
  console.log(`\nReference cross-check: ${options.reference ? `${checked} cells checked` : "not run"}`);
  printList("Validation errors", report.errors);
  if (report.errors.length > 0) return 1;
  writeFileSync(PRICING_PATH, JSON.stringify(entries, null, 1));
  console.log(`\nwrote ${path.relative(process.cwd(), PRICING_PATH)}`);
  if (options.review) {
    writeFileSync(options.review, renderReview(priced, entries, report.anomalies, report.skipped));
    console.log(`wrote ${options.review}`);
  }
  return 0;
}

if (import.meta.filename === process.argv[1]) {
  run(parseArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
