import { existsSync } from "node:fs";
import path from "node:path";
import piecesJson from "../../content/pieces.json";
import siteJson from "../../content/site.json";
import categoryCtaJson from "../../content/category-cta.json";
import { LOGO_IMAGE, getImage } from "./images";

/**
 * Single access point for site content. Every function is async so the data
 * source can later move from these JSON files to a CMS without touching pages.
 */

export const categories = ["dining", "living", "bathroom"] as const;
type Category = (typeof categories)[number];

export const categoryTitles: Record<Category, string> = {
  dining: "Dining",
  living: "Living",
  bathroom: "Bathroom",
};

export function isCategory(value: string): value is Category {
  return (categories as readonly string[]).includes(value);
}

interface PieceSpec {
  label: string;
  value: string;
}

export interface Piece {
  slug: string;
  name: string;
  category: Category;
  order: number;
  cardSubtitle: string;
  subtitle: string;
  cardPrice: string;
  pagePrice: string;
  priceNote: string | null;
  note: string | null;
  description: string[];
  specs: PieceSpec[];
  availableTimbers: string[];
  cardImages: string[];
  galleryImages: string[];
  galleryLayout: string;
  galleryLead: number | null;
}

interface CategoryCta {
  eyebrow: string;
  heading: string;
  body: string;
}

interface Material {
  name: string;
  kind: string;
  description: string;
  summary: string;
  image: string;
}

interface SiteContent {
  brand: string;
  tagline: string;
  sub: string;
  location: string;
  est: number;
  email: string;
  instagram: string;
  pieceEnquiryNote: string;
  heroImage: string;
  categoryTiles: { category: Category; label: string; image: string }[];
  enquireSection: { heading: string; body: string };
  about: {
    photo: string;
    photoAlt: string;
    heading: string;
    paragraphs: string[];
    signoff: string;
  };
  materialsIntro: { heading: string; paragraphs: string[] };
  materials: Material[];
}

const pieces = piecesJson as Piece[];
const site = siteJson as SiteContent;
const categoryCtas = categoryCtaJson as Record<Category, CategoryCta>;

const IMAGE_DIR = path.join(process.cwd(), "public");

function imageFileProblems(name: string, where: string): string[] {
  let urls: string[];
  try {
    const image = getImage(name);
    urls = [image.src, ...(image.srcSet ?? "").split(",").map((entry) => entry.trim().split(" ")[0])].filter(
      (url): url is string => Boolean(url),
    );
  } catch {
    return [`${where}: image "${name}" is not listed in content/images.json`];
  }
  return urls
    .filter((url) => !existsSync(path.join(IMAGE_DIR, url)))
    .map((url) => `${where}: missing file public${url}`);
}

function findDuplicates(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function pieceProblems(): string[] {
  const problems: string[] = [];
  const materialNames = new Set(site.materials.map((material) => material.name));

  for (const slug of new Set(findDuplicates(pieces.map((piece) => piece.slug)))) {
    problems.push(`duplicate piece slug "${slug}"`);
  }
  for (const piece of pieces) {
    const where = `piece "${piece.slug}"`;
    if (!isCategory(piece.category)) problems.push(`${where}: unknown category "${piece.category}"`);
    for (const timber of piece.availableTimbers) {
      if (!materialNames.has(timber)) problems.push(`${where}: availableTimbers "${timber}" has no matching material`);
    }
    if (piece.galleryLead !== null && !piece.galleryImages[piece.galleryLead]) {
      problems.push(`${where}: galleryLead ${piece.galleryLead} is outside galleryImages`);
    }
    for (const name of [...piece.cardImages, ...piece.galleryImages]) {
      problems.push(...imageFileProblems(name, where));
    }
  }
  return problems;
}

function siteProblems(): string[] {
  const problems: string[] = [];
  for (const name of new Set(findDuplicates(site.materials.map((material) => material.name)))) {
    problems.push(`duplicate material "${name}"`);
  }
  for (const tile of site.categoryTiles) {
    if (!isCategory(tile.category)) problems.push(`categoryTiles: unknown category "${tile.category}"`);
  }
  for (const category of categories) {
    if (!categoryCtas[category]) problems.push(`content/category-cta.json has no entry for "${category}"`);
  }

  const images: [string, string][] = [
    [LOGO_IMAGE, "logo"],
    [site.heroImage, "heroImage"],
    [site.about.photo, "about.photo"],
    ...site.categoryTiles.map((tile): [string, string] => [tile.image, `categoryTiles.${tile.category}`]),
    ...site.materials.map((material): [string, string] => [material.image, `material "${material.name}"`]),
  ];
  for (const [name, where] of images) problems.push(...imageFileProblems(name, where));
  return problems;
}

/** Fails the build on content mistakes that would otherwise ship as broken pages or images. */
function validateContent(): void {
  const problems = [...siteProblems(), ...pieceProblems()];
  if (problems.length > 0) {
    throw new Error(`Invalid content:\n - ${problems.join("\n - ")}`);
  }
}

validateContent();

export async function getSite(): Promise<SiteContent> {
  return site;
}

export async function getPieces(): Promise<Piece[]> {
  return pieces;
}

export async function getPiecesByCategory(category: Category): Promise<Piece[]> {
  return pieces
    .filter((piece) => piece.category === category)
    .sort((a, b) => a.order - b.order);
}

export async function getPiece(category: Category, slug: string): Promise<Piece | undefined> {
  return pieces.find((piece) => piece.category === category && piece.slug === slug);
}

export async function getCategoryCta(category: Category): Promise<CategoryCta> {
  return categoryCtas[category];
}

export function materialAnchorId(name: string): string {
  return `mat-${name.toLowerCase().replace(/\s+/g, "-")}`;
}

export function pieceHref(piece: Pick<Piece, "category" | "slug">): string {
  return `/${piece.category}/${piece.slug}`;
}
