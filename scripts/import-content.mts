/**
 * One-off import of the site content into Sanity: materials, site settings and pieces.
 *
 *   node --experimental-strip-types scripts/import-content.mts            dry run: builds and checks every document, writes nothing
 *   SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/import-content.mts --write
 *   ... --write --replace                                                  overwrites documents that already exist
 *
 * Documents have stable _ids and are written with createIfNotExists, so re-running never undoes edits made
 * in the Studio. Images are uploaded once each; Sanity de-duplicates identical files.
 * The write token is read from the environment only. Never commit it.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@sanity/client";
import { LexoRank } from "lexorank";
import { limits, type LimitKey } from "../studio/schemaTypes/limits.ts";

const PROJECT_ID = "ka21otlh";
const DATASET = "production";
const API_VERSION = "2025-01-01";
const IMAGE_DIR = path.join(process.cwd(), "public", "images");
const UPLOAD_SIZE = 1600;

interface SourcePiece {
  slug: string;
  name: string;
  category: string;
  order: number;
  cardSubtitle: string;
  subtitle: string;
  cardPrice: string;
  pagePrice: string;
  priceNote: string | null;
  note: string | null;
  description: string[];
  specs: { label: string; value: string }[];
  availableTimbers: string[];
  cardImages: string[];
  galleryImages: string[];
  galleryLayout: string;
  galleryLead: number | null;
}

type GalleryLayout = "auto" | "lead" | "wide";

interface SourceMaterial {
  name: string;
  kind: string;
  description: string;
  summary: string;
  image: string;
}

interface CategoryCta {
  eyebrow: string;
  heading: string;
  body: string;
}

interface SourceSite {
  tagline: string;
  sub: string;
  location: string;
  est: number;
  email: string;
  instagram: string;
  pieceEnquiryNote: string;
  heroImage: string;
  categoryTiles: { category: string; label: string; image: string }[];
  enquireSection: { heading: string; body: string };
  about: { photo: string; photoAlt: string; heading: string; paragraphs: string[]; signoff: string };
  materialsIntro: { heading: string; paragraphs: string[] };
  materials: SourceMaterial[];
}

const readJson = <T,>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;
const pieces = readJson<SourcePiece[]>("content/pieces.json");
const site = readJson<SourceSite>("content/site.json");
const categoryCtas = readJson<Record<string, CategoryCta>>("content/category-cta.json");

const CATEGORIES = ["dining", "living", "bathroom"] as const;
const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+\/?$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ImageField {
  _type: "image";
  asset: { _type: "reference"; _ref: string };
  alt?: string;
}

interface Reference {
  _type: "reference";
  _key: string;
  _ref: string;
}

interface PieceDocument {
  _id: string;
  _type: "piece";
  name: string;
  slug: { _type: "slug"; current: string };
  category: string;
  cardSubtitle: string;
  subtitle: string;
  cardPrice: string;
  pagePrice: string;
  priceNote?: string;
  note?: string;
  description: string;
  specs: { _key: string; _type: "spec"; label: string; value: string }[];
  availableTimbers: Reference[];
  images: { _key: string; _type: "pieceImage"; image: ImageField }[];
  cardCover?: ImageField;
  galleryLayout: GalleryLayout;
  orderRank: string;
}

interface MaterialDocument {
  _id: string;
  _type: "material";
  name: string;
  slug: { _type: "slug"; current: string };
  kind: string;
  description: string;
  summary: string;
  image: ImageField;
  orderRank: string;
}

interface CategorySettings {
  tileTitle: string;
  tileImage: ImageField;
  ctaEyebrow: string;
  ctaHeading: string;
  ctaBody: string;
}

interface SiteSettingsDocument {
  _id: "siteSettings";
  _type: "siteSettings";
  heroImage: ImageField;
  tagline: string;
  sub: string;
  location: string;
  categories: Record<(typeof CATEGORIES)[number], CategorySettings>;
  about: { photo: ImageField; heading: string; paragraphs: string[]; signoff: string };
  materialsIntro: { heading: string; paragraphs: string[] };
  enquireSection: { heading: string; body: string };
  pieceEnquiryNote: string;
  email: string;
  instagram: string;
  est: number;
}

type ImportDocument = PieceDocument | MaterialDocument | SiteSettingsDocument;

/** Problems block the import. Warnings are soft Studio limits and are only reported. */
interface Report {
  problems: string[];
  warnings: string[];
}

/** Required text with a soft length limit, mirroring the Studio schema. */
function text(value: string | undefined, limit: LimitKey, where: string, report: Report): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) report.problems.push(`${where}: required but empty`);
  if (trimmed.length > limits[limit]) {
    report.warnings.push(`${where}: ${trimmed.length} characters, limit ${limits[limit]}`);
  }
  return value ?? "";
}

function optionalText(value: string, limit: LimitKey, where: string, report: Report): string {
  return text(value, limit, where, report);
}

/** Photo count to the grid code the site uses today when no lead or wide layout applies. */
function automaticCode(count: number): string {
  if (count >= 6) return "3";
  return count === 3 ? "3" : `n${count}`;
}

function layoutFor(piece: SourcePiece, report: Report): GalleryLayout {
  if (piece.galleryLead !== null) {
    if (piece.galleryLead !== 0) report.problems.push(`${piece.slug}: galleryLead ${piece.galleryLead} is not the first photo`);
    return "lead";
  }
  if (piece.galleryLayout === "wide") return "wide";
  const expected = automaticCode(piece.galleryImages.length);
  if (piece.galleryLayout !== expected) {
    report.problems.push(
      `${piece.slug}: layout "${piece.galleryLayout}" is not what Automatic gives for ${piece.galleryImages.length} photos ("${expected}")`,
    );
  }
  return "auto";
}

function cardCoverFor(piece: SourcePiece, report: Report): string | null {
  const [cardFirst, ...cardRest] = piece.cardImages;
  const [galleryFirst, ...galleryRest] = piece.galleryImages;
  if (cardRest.join() !== galleryRest.join()) {
    report.problems.push(`${piece.slug}: card and gallery photos differ after the first one`);
  }
  return cardFirst !== undefined && cardFirst !== galleryFirst ? cardFirst : null;
}

function imageFile(name: string): string {
  return path.join(IMAGE_DIR, `${name}-${UPLOAD_SIZE}.webp`);
}

/** Every image the documents use, with the places that use it. */
function imageUses(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  const add = (name: string, where: string): void => {
    uses.set(name, [...(uses.get(name) ?? []), where]);
  };
  add(site.heroImage, "siteSettings.heroImage");
  add(site.about.photo, "siteSettings.about.photo");
  for (const tile of site.categoryTiles) add(tile.image, `siteSettings.categories.${tile.category}.tileImage`);
  for (const material of site.materials) add(material.image, `material ${material.name}`);
  for (const piece of pieces) {
    for (const name of new Set([...piece.cardImages, ...piece.galleryImages])) add(name, `piece ${piece.slug}`);
  }
  return uses;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

const materialId = (name: string): string => `material-${slugify(name)}`;

function ranksFor<T>(items: T[], key: (item: T) => string): Map<string, string> {
  const ranks = new Map<string, string>();
  let rank = LexoRank.middle();
  for (const item of items) {
    ranks.set(key(item), rank.toString());
    rank = rank.genNext();
  }
  return ranks;
}

type ImageRef = (name: string, alt?: string) => ImageField;

function makeImageRef(assetIds: Map<string, string>): ImageRef {
  return (name, alt) => {
    const ref = assetIds.get(name);
    if (!ref) throw new Error(`no asset for "${name}"`);
    return { _type: "image", asset: { _type: "reference", _ref: ref }, ...(alt ? { alt } : {}) };
  };
}

function buildMaterials(toImage: ImageRef, report: Report): MaterialDocument[] {
  const ranks = ranksFor(site.materials, (material) => material.name);
  return site.materials.map((material) => {
    const where = `material ${material.name}`;
    const rank = ranks.get(material.name);
    if (!rank) throw new Error(`no rank for ${where}`);
    return {
      _id: materialId(material.name),
      _type: "material",
      name: text(material.name, "materialName", `${where} name`, report),
      slug: { _type: "slug", current: slugify(material.name) },
      kind: text(material.kind, "materialKind", `${where} kind`, report),
      description: text(material.description, "materialDescription", `${where} description`, report),
      summary: text(material.summary, "materialSummary", `${where} summary`, report),
      image: toImage(material.image, text(`${material.name} timber`, "photoAlt", `${where} photo description`, report)),
      orderRank: rank,
    };
  });
}

function buildCategory(category: string, toImage: ImageRef, report: Report): CategorySettings {
  const tile = site.categoryTiles.find((candidate) => candidate.category === category);
  const cta = categoryCtas[category];
  if (!tile || !cta) throw new Error(`site.json or category-cta.json has no entry for "${category}"`);
  const where = `siteSettings.categories.${category}`;
  return {
    tileTitle: text(tile.label, "tileTitle", `${where} tile title`, report),
    tileImage: toImage(tile.image, text(tile.label, "photoAlt", `${where} tile photo description`, report)),
    ctaEyebrow: text(cta.eyebrow, "ctaEyebrow", `${where} eyebrow`, report),
    ctaHeading: text(cta.heading, "heading", `${where} heading`, report),
    ctaBody: text(cta.body, "ctaBody", `${where} body`, report),
  };
}

function checkContact(report: Report): void {
  if (!EMAIL.test(site.email)) report.problems.push(`siteSettings: email "${site.email}" is not a valid address`);
  if (!INSTAGRAM_URL.test(site.instagram)) {
    report.problems.push(`siteSettings: instagram "${site.instagram}" is not an instagram.com link`);
  }
  if (!Number.isInteger(site.est) || site.est < 1900 || site.est > 2100) {
    report.problems.push(`siteSettings: est ${site.est} is not a plausible year`);
  }
}

function buildSiteSettings(toImage: ImageRef, report: Report): SiteSettingsDocument {
  checkContact(report);
  const paragraphs = (values: string[], limit: LimitKey, where: string): string[] =>
    values.map((value, index) => text(value, limit, `${where} paragraph ${index + 1}`, report));
  return {
    _id: "siteSettings",
    _type: "siteSettings",
    heroImage: toImage(site.heroImage),
    tagline: text(site.tagline, "tagline", "siteSettings tagline", report),
    sub: text(site.sub, "sub", "siteSettings sub", report),
    location: text(site.location, "location", "siteSettings location", report),
    categories: {
      dining: buildCategory("dining", toImage, report),
      living: buildCategory("living", toImage, report),
      bathroom: buildCategory("bathroom", toImage, report),
    },
    about: {
      photo: toImage(site.about.photo, text(site.about.photoAlt, "photoAlt", "siteSettings.about photo description", report)),
      heading: text(site.about.heading, "heading", "siteSettings.about heading", report),
      paragraphs: paragraphs(site.about.paragraphs, "aboutParagraph", "siteSettings.about"),
      signoff: text(site.about.signoff, "signoff", "siteSettings.about signoff", report),
    },
    materialsIntro: {
      heading: text(site.materialsIntro.heading, "heading", "siteSettings.materialsIntro heading", report),
      paragraphs: paragraphs(site.materialsIntro.paragraphs, "introParagraph", "siteSettings.materialsIntro"),
    },
    enquireSection: {
      heading: text(site.enquireSection.heading, "heading", "siteSettings.enquireSection heading", report),
      body: text(site.enquireSection.body, "enquireBody", "siteSettings.enquireSection body", report),
    },
    pieceEnquiryNote: text(site.pieceEnquiryNote, "pieceEnquiryNote", "siteSettings pieceEnquiryNote", report),
    email: site.email,
    instagram: site.instagram,
    est: site.est,
  };
}

function buildPiece(piece: SourcePiece, toImage: ImageRef, ranks: Map<string, string>, report: Report): PieceDocument {
  const where = `piece ${piece.slug}`;
  const cover = cardCoverFor(piece, report);
  const rank = ranks.get(piece.slug);
  if (!rank) throw new Error(`no rank for ${piece.slug}`);
  const knownTimbers = new Set(site.materials.map((material) => material.name));
  for (const timber of piece.availableTimbers) {
    if (!knownTimbers.has(timber)) report.problems.push(`${where}: timber "${timber}" has no material`);
  }
  if (piece.availableTimbers.length === 0) report.problems.push(`${where}: no available timbers`);

  return {
    _id: `piece-${piece.slug}`,
    _type: "piece",
    name: text(piece.name, "pieceName", `${where} name`, report),
    slug: { _type: "slug", current: piece.slug },
    category: piece.category,
    cardSubtitle: text(piece.cardSubtitle, "pieceSubtitle", `${where} cardSubtitle`, report),
    subtitle: text(piece.subtitle, "pieceSubtitle", `${where} subtitle`, report),
    cardPrice: text(piece.cardPrice, "piecePrice", `${where} cardPrice`, report),
    pagePrice: text(piece.pagePrice, "piecePrice", `${where} pagePrice`, report),
    ...(piece.priceNote ? { priceNote: optionalText(piece.priceNote, "piecePriceNote", `${where} priceNote`, report) } : {}),
    ...(piece.note ? { note: optionalText(piece.note, "pieceNote", `${where} note`, report) } : {}),
    description: text(piece.description.join("\n\n"), "pieceDescription", `${where} description`, report),
    specs: piece.specs.map((spec, index) => ({
      _key: `spec${index}`,
      _type: "spec",
      label: text(spec.label, "specLabel", `${where} spec ${index + 1} label`, report),
      value: text(spec.value, "specValue", `${where} spec ${index + 1} value`, report),
    })),
    availableTimbers: piece.availableTimbers.map((timber, index) => ({
      _type: "reference",
      _key: `timber${index}`,
      _ref: materialId(timber),
    })),
    // Piece photo descriptions stay empty: the site writes them from the piece name and position,
    // which is what it does today, and they stay correct when photos are reordered.
    images: piece.galleryImages.map((name, index) => ({
      _key: `img${index}`,
      _type: "pieceImage",
      image: toImage(name),
    })),
    ...(cover ? { cardCover: toImage(cover) } : {}),
    galleryLayout: layoutFor(piece, report),
    orderRank: rank,
  };
}

function duplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function checkSource(report: Report, uses: Map<string, string[]>): void {
  for (const name of uses.keys()) {
    if (!existsSync(imageFile(name))) report.problems.push(`missing file ${imageFile(name)}`);
  }
  for (const slug of duplicates(pieces.map((piece) => `${piece.category}/${piece.slug}`))) {
    report.problems.push(`duplicate piece ${slug}`);
  }
  for (const slug of duplicates(site.materials.map((material) => slugify(material.name)))) {
    report.problems.push(`duplicate material ${slug}`);
  }
  for (const piece of pieces) {
    if (!(CATEGORIES as readonly string[]).includes(piece.category)) {
      report.problems.push(`piece ${piece.slug}: unknown category "${piece.category}"`);
    }
  }
}

function makeClient(token: string) {
  return createClient({ projectId: PROJECT_ID, dataset: DATASET, apiVersion: API_VERSION, useCdn: false, token });
}

async function uploadAll(names: string[], token: string): Promise<Map<string, string>> {
  const client = makeClient(token);
  const assetIds = new Map<string, string>();
  for (const name of names) {
    const asset = await client.assets.upload("image", createReadStream(imageFile(name)), {
      filename: `${name}.webp`,
      contentType: "image/webp",
    });
    assetIds.set(name, asset._id);
    console.log(`uploaded ${name} -> ${asset._id}`);
  }
  return assetIds;
}

async function commit(documents: ImportDocument[], token: string, replace: boolean): Promise<void> {
  const transaction = makeClient(token).transaction();
  for (const document of documents) {
    if (replace) transaction.createOrReplace(document);
    else transaction.createIfNotExists(document);
  }
  await transaction.commit();
  console.log(`Wrote ${documents.length} documents (${replace ? "replacing existing" : "existing left untouched"}).`);
}

function describe(document: ImportDocument): string {
  if (document._type === "piece") {
    return `${document.category.padEnd(9)} ${document.galleryLayout.padEnd(5)} photos=${document.images.length} timbers=${document.availableTimbers.length}${document.cardCover ? " cardCover" : ""}`;
  }
  if (document._type === "material") return `alt="${document.image.alt}"`;
  return `hero, about, ${CATEGORIES.length} categories, contact`;
}

function printReport(documents: ImportDocument[], uses: Map<string, string[]>, report: Report): void {
  for (const document of documents) {
    console.log(`${document._type.padEnd(13)} ${document._id.padEnd(34)} ${describe(document)}`);
  }
  console.log("");
  for (const [name, where] of uses) {
    const sample = where.length > 2 ? `${where.slice(0, 2).join(", ")} +${where.length - 2}` : where.join(", ");
    const status = existsSync(imageFile(name)) ? "file ok " : "MISSING  ";
    console.log(`image ${name.padEnd(28)} ${status} used ${where.length}x  ${sample}`);
  }
  const count = (type: string): number => documents.filter((document) => document._type === type).length;
  console.log("");
  console.log(
    `${documents.length} documents (${count("siteSettings")} siteSettings, ${count("material")} material, ${count("piece")} piece), ${uses.size} images to upload`,
  );
  console.log(`${report.warnings.length} warnings${report.warnings.map((warning) => `\n - ${warning}`).join("")}`);
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const replace = process.argv.includes("--replace");
  const token = process.env.SANITY_WRITE_TOKEN;
  const report: Report = { problems: [], warnings: [] };
  const uses = imageUses();
  checkSource(report, uses);

  if (write && !token) throw new Error("Set SANITY_WRITE_TOKEN to use --write.");
  if (write && report.problems.length > 0) throw new Error(`Fix these first:\n - ${report.problems.join("\n - ")}`);

  const names = [...uses.keys()];
  const assetIds =
    write && token
      ? await uploadAll(names, token)
      : new Map(names.map((name): [string, string] => [name, `image-dryrun-${name}`]));
  const toImage = makeImageRef(assetIds);

  const pieceRanks = ranksFor(
    [...pieces].sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order),
    (piece) => piece.slug,
  );
  const documents: ImportDocument[] = [
    buildSiteSettings(toImage, report),
    ...buildMaterials(toImage, report),
    ...pieces.map((piece) => buildPiece(piece, toImage, pieceRanks, report)),
  ];
  printReport(documents, uses, report);

  if (report.problems.length > 0) throw new Error(`Import blocked:\n - ${report.problems.join("\n - ")}`);
  if (!write || !token) {
    console.log("Dry run only. Nothing was written.");
    return;
  }
  await commit(documents, token, replace);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
