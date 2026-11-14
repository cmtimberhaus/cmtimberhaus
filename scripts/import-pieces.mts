/**
 * One-off import of content/pieces.json into Sanity.
 *
 *   node --experimental-strip-types scripts/import-pieces.mts            dry run: builds and checks every document, writes nothing
 *   SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/import-pieces.mts --write
 *   ... --write --replace                                                overwrites documents that already exist
 *
 * Without --replace, existing documents are left alone, so re-running never undoes edits made in the Studio.
 * The write token is read from the environment only. Never commit it.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@sanity/client";
import { LexoRank } from "lexorank";

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

interface ImageField {
  _type: "image";
  asset: { _type: "reference"; _ref: string };
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
  availableTimbers: string[];
  images: { _key: string; _type: "pieceImage"; image: ImageField }[];
  cardCover?: ImageField;
  galleryLayout: GalleryLayout;
  orderRank: string;
}

const pieces: SourcePiece[] = JSON.parse(readFileSync("content/pieces.json", "utf8"));

/** Photo count to the grid code the site uses today when no lead or wide layout applies. */
function automaticCode(count: number): string {
  if (count >= 6) return "3";
  return count === 3 ? "3" : `n${count}`;
}

function layoutFor(piece: SourcePiece, problems: string[]): GalleryLayout {
  if (piece.galleryLead !== null) {
    if (piece.galleryLead !== 0) problems.push(`${piece.slug}: galleryLead ${piece.galleryLead} is not the first photo`);
    return "lead";
  }
  if (piece.galleryLayout === "wide") return "wide";
  const expected = automaticCode(piece.galleryImages.length);
  if (piece.galleryLayout !== expected) {
    problems.push(
      `${piece.slug}: layout "${piece.galleryLayout}" is not what Automatic gives for ${piece.galleryImages.length} photos ("${expected}")`,
    );
  }
  return "auto";
}

function cardCoverFor(piece: SourcePiece, problems: string[]): string | null {
  const [cardFirst, ...cardRest] = piece.cardImages;
  const [galleryFirst, ...galleryRest] = piece.galleryImages;
  if (cardRest.join() !== galleryRest.join()) {
    problems.push(`${piece.slug}: card and gallery photos differ after the first one`);
  }
  return cardFirst !== undefined && cardFirst !== galleryFirst ? cardFirst : null;
}

function imageFile(name: string): string {
  return path.join(IMAGE_DIR, `${name}-${UPLOAD_SIZE}.webp`);
}

function uniqueImageNames(): string[] {
  return [...new Set(pieces.flatMap((piece) => [...piece.cardImages, ...piece.galleryImages]))];
}

function ranksInOrder(): Map<string, string> {
  const sorted = [...pieces].sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  const ranks = new Map<string, string>();
  let rank = LexoRank.middle();
  for (const piece of sorted) {
    ranks.set(piece.slug, rank.toString());
    rank = rank.genNext();
  }
  return ranks;
}

function buildDocument(
  piece: SourcePiece,
  assetIds: Map<string, string>,
  ranks: Map<string, string>,
  problems: string[],
): PieceDocument {
  const toImage = (name: string): ImageField => {
    const ref = assetIds.get(name);
    if (!ref) throw new Error(`no asset for "${name}"`);
    return { _type: "image", asset: { _type: "reference", _ref: ref } };
  };
  const cover = cardCoverFor(piece, problems);
  const rank = ranks.get(piece.slug);
  if (!rank) throw new Error(`no rank for ${piece.slug}`);

  return {
    _id: `piece-${piece.slug}`,
    _type: "piece",
    name: piece.name,
    slug: { _type: "slug", current: piece.slug },
    category: piece.category,
    cardSubtitle: piece.cardSubtitle,
    subtitle: piece.subtitle,
    cardPrice: piece.cardPrice,
    pagePrice: piece.pagePrice,
    ...(piece.priceNote ? { priceNote: piece.priceNote } : {}),
    ...(piece.note ? { note: piece.note } : {}),
    description: piece.description.join("\n\n"),
    specs: piece.specs.map((spec, index) => ({ _key: `spec${index}`, _type: "spec", ...spec })),
    availableTimbers: piece.availableTimbers,
    images: piece.galleryImages.map((name, index) => ({
      _key: `img${index}`,
      _type: "pieceImage",
      image: toImage(name),
    })),
    ...(cover ? { cardCover: toImage(cover) } : {}),
    galleryLayout: layoutFor(piece, problems),
    orderRank: rank,
  };
}

function checkSource(): string[] {
  const problems: string[] = [];
  for (const name of uniqueImageNames()) {
    if (!existsSync(imageFile(name))) problems.push(`missing file ${imageFile(name)}`);
  }
  const slugs = pieces.map((piece) => piece.slug);
  for (const slug of new Set(slugs.filter((slug, index) => slugs.indexOf(slug) !== index))) {
    problems.push(`duplicate slug ${slug}`);
  }
  return problems;
}

async function uploadAll(names: string[], token: string): Promise<Map<string, string>> {
  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: API_VERSION,
    useCdn: false,
    token,
  });
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

async function commit(documents: PieceDocument[], token: string, replace: boolean): Promise<void> {
  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: API_VERSION,
    useCdn: false,
    token,
  });
  const transaction = client.transaction();
  for (const document of documents) {
    if (replace) transaction.createOrReplace(document);
    else transaction.createIfNotExists(document);
  }
  await transaction.commit();
  console.log(`Wrote ${documents.length} documents (${replace ? "replacing existing" : "existing left untouched"}).`);
}

async function main(): Promise<void> {
  const write = process.argv.includes("--write");
  const replace = process.argv.includes("--replace");
  const token = process.env.SANITY_WRITE_TOKEN;
  const problems = checkSource();
  const names = uniqueImageNames();

  if (write && !token) throw new Error("Set SANITY_WRITE_TOKEN to use --write.");
  if (write && problems.length > 0) throw new Error(`Fix these first:\n - ${problems.join("\n - ")}`);

  const assetIds =
    write && token
      ? await uploadAll(names, token)
      : new Map(names.map((name): [string, string] => [name, `image-dryrun-${name}`]));

  const ranks = ranksInOrder();
  const documents = pieces.map((piece) => buildDocument(piece, assetIds, ranks, problems));
  for (const document of documents) {
    console.log(
      `${document._id.padEnd(24)} ${document.category.padEnd(9)} ${document.galleryLayout.padEnd(5)} photos=${document.images.length}${document.cardCover ? " cardCover" : ""} rank=${document.orderRank}`,
    );
  }
  console.log(`${documents.length} documents, ${names.length} distinct photos`);

  if (problems.length > 0) throw new Error(`Import blocked:\n - ${problems.join("\n - ")}`);
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
