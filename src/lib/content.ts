import type { ImageSource } from "./images";
import { cardPriceText, fromPriceText, type PiecePricing } from "./pricing";
import { buildPricing, type RawPricing } from "./pricing-content";
import { IMAGE_PROJECTION, fetchSanity, toImageSource, type RawImage } from "./sanity";

/**
 * Single access point for site content. Content lives in Sanity and is read once per build;
 * every problem found (missing fields, duplicate slugs, broken references, photos without alt
 * text) fails the build instead of shipping a broken page.
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

const BRAND = "CM Timberhaus";

interface PieceSpec {
  label: string;
  value: string;
}

export interface TimberLink {
  name: string;
  slug: string;
}

export interface Piece {
  slug: string;
  name: string;
  category: Category;
  cardSubtitle: string;
  subtitle: string;
  /** Derived from the price table when the piece has one. */
  cardPrice: string;
  /** Derived from the price table when the piece has one: the "from" price, used in page descriptions. */
  pagePrice: string;
  priceNote: string | null;
  /** Null when the piece has no price table and keeps the plain text prices. */
  pricing: PiecePricing | null;
  note: string | null;
  description: string[];
  specs: PieceSpec[];
  availableTimbers: TimberLink[];
  cardImages: ImageSource[];
  galleryImages: ImageSource[];
  /** Grid code the stylesheet understands: "3", "n1" to "n5" or "wide". */
  galleryLayout: string;
  /** Index of the full-width lead photo, or null. */
  galleryLead: number | null;
}

interface CategoryCta {
  eyebrow: string;
  heading: string;
  body: string;
}

interface Material {
  name: string;
  slug: string;
  kind: string;
  description: string;
  summary: string;
  image: ImageSource;
  imageAlt: string;
}

interface CategoryTile {
  category: Category;
  label: string;
  alt: string;
  image: ImageSource;
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
  heroImage: ImageSource;
  categoryTiles: CategoryTile[];
  enquireSection: { heading: string; body: string };
  about: {
    photo: ImageSource;
    photoAlt: string;
    heading: string;
    paragraphs: string[];
    signoff: string;
  };
  materialsIntro: { heading: string; paragraphs: string[] };
  materials: Material[];
}

interface Content {
  site: SiteContent;
  pieces: Piece[];
  categoryCtas: Record<Category, CategoryCta>;
}

interface RawCategory {
  tileTitle: string | null;
  tileImage: RawImage | null;
  ctaEyebrow: string | null;
  ctaHeading: string | null;
  ctaBody: string | null;
}

interface RawSite {
  tagline: string | null;
  sub: string | null;
  location: string | null;
  est: number | null;
  email: string | null;
  instagram: string | null;
  pieceEnquiryNote: string | null;
  heroImage: RawImage | null;
  categories: Partial<Record<Category, RawCategory>> | null;
  enquireSection: { heading: string | null; body: string | null } | null;
  about: {
    photo: RawImage | null;
    heading: string | null;
    paragraphs: string[] | null;
    signoff: string | null;
  } | null;
  materialsIntro: { heading: string | null; paragraphs: string[] | null } | null;
}

interface RawMaterial {
  _id: string;
  name: string | null;
  slug: string | null;
  kind: string | null;
  description: string | null;
  summary: string | null;
  image: RawImage | null;
}

interface RawPiece {
  _id: string;
  name: string | null;
  slug: string | null;
  category: string | null;
  cardSubtitle: string | null;
  subtitle: string | null;
  cardPrice: string | null;
  pagePrice: string | null;
  priceNote: string | null;
  pricing: RawPricing | null;
  note: string | null;
  description: string | null;
  specs: { label: string | null; value: string | null }[] | null;
  availableTimbers: ({ name: string | null; slug: string | null } | null)[] | null;
  images: { image: RawImage | null }[] | null;
  cardCover: RawImage | null;
  galleryLayout: string | null;
}

interface RawContent {
  site: RawSite | null;
  materials: RawMaterial[];
  pieces: RawPiece[];
}

const CATEGORY_PROJECTION = `{
  tileTitle,
  "tileImage": tileImage${IMAGE_PROJECTION},
  ctaEyebrow,
  ctaHeading,
  ctaBody
}`;

const QUERY = `{
  "site": *[_id == "siteSettings"][0]{
    tagline, sub, location, est, email, instagram, pieceEnquiryNote,
    "heroImage": heroImage${IMAGE_PROJECTION},
    "categories": {
      "dining": categories.dining${CATEGORY_PROJECTION},
      "living": categories.living${CATEGORY_PROJECTION},
      "bathroom": categories.bathroom${CATEGORY_PROJECTION}
    },
    enquireSection,
    "about": about{ "photo": photo${IMAGE_PROJECTION}, heading, paragraphs, signoff },
    materialsIntro
  },
  "materials": *[_type == "material"] | order(orderRank){
    _id, name, "slug": slug.current, kind, description, summary,
    "image": image${IMAGE_PROJECTION}
  },
  "pieces": *[_type == "piece"] | order(orderRank){
    _id, name, "slug": slug.current, category, cardSubtitle, subtitle, cardPrice, pagePrice,
    priceNote, note, description, specs, galleryLayout,
    "pricing": pricing{
      sizeLabel, priceSuffix, cardSuffix, bundle,
      "defaultTimber": defaultTimber->slug.current,
      "rows": rows[]{
        label, isStart,
        "prices": prices[]{ "timber": timber->slug.current, amount, bundleAmount }
      }
    },
    "availableTimbers": availableTimbers[]->{ name, "slug": slug.current },
    "images": images[]{ "image": image${IMAGE_PROJECTION} },
    "cardCover": cardCover${IMAGE_PROJECTION}
  }
}`;

type Problems = string[];

function text(value: string | null | undefined, where: string, problems: Problems): string {
  if (!value?.trim()) {
    problems.push(`${where}: missing`);
    return "";
  }
  return value;
}

function paragraphs(values: string[] | null | undefined, where: string, problems: Problems): string[] {
  const list = (values ?? []).filter((value) => value.trim());
  if (list.length === 0) problems.push(`${where}: no paragraphs`);
  return list;
}

/** Converts a photo, or records why it cannot be used. `needsAlt` photos must carry a description. */
function photo(
  image: RawImage | null | undefined,
  where: string,
  problems: Problems,
  needsAlt = false,
): ImageSource {
  if (!image?.ref || !image.width || !image.height) {
    problems.push(`${where}: photo missing`);
    return { src: "", width: 1, height: 1 };
  }
  if (needsAlt && !image.alt?.trim()) problems.push(`${where}: photo has no description (alt text)`);
  return toImageSource({ ...image, ref: image.ref, width: image.width, height: image.height });
}

function findDuplicates(values: string[]): string[] {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

/** Photo count to the grid code the stylesheet uses when the layout is automatic. */
function automaticCode(count: number): string {
  if (count >= 6) return "3";
  return count === 3 ? "3" : `n${count}`;
}

/** The Studio layout choice as the grid code and lead index the page renders. A lead photo spans the grid above the rest. */
function gridFor(layout: string | null, count: number): { galleryLayout: string; galleryLead: number | null } {
  if (layout === "wide") return { galleryLayout: "wide", galleryLead: null };
  if (layout === "lead") return { galleryLayout: automaticCode(count - 1), galleryLead: 0 };
  return { galleryLayout: automaticCode(count), galleryLead: null };
}

function buildMaterial(raw: RawMaterial, problems: Problems): Material {
  const where = `material "${raw.name ?? raw._id}"`;
  return {
    name: text(raw.name, `${where} name`, problems),
    slug: text(raw.slug, `${where} slug`, problems),
    kind: text(raw.kind, `${where} kind`, problems),
    description: text(raw.description, `${where} description`, problems),
    summary: text(raw.summary, `${where} summary`, problems),
    image: photo(raw.image, where, problems, true),
    imageAlt: raw.image?.alt ?? "",
  };
}

function buildTimbers(raw: RawPiece, where: string, problems: Problems): TimberLink[] {
  const timbers = raw.availableTimbers ?? [];
  if (timbers.length === 0) problems.push(`${where}: no available timbers`);
  const links: TimberLink[] = [];
  for (const timber of timbers) {
    if (!timber?.slug || !timber.name) {
      problems.push(`${where}: availableTimbers has a reference to a timber that does not exist`);
    } else {
      links.push({ name: timber.name, slug: timber.slug });
    }
  }
  return links;
}

function buildPiece(raw: RawPiece, problems: Problems): Piece | null {
  const where = `piece "${raw.slug ?? raw.name ?? raw._id}"`;
  if (!raw.category || !isCategory(raw.category)) {
    problems.push(`${where}: unknown category "${raw.category}"`);
    return null;
  }
  const gallery = (raw.images ?? []).map((entry, index) => photo(entry.image, `${where} photo ${index + 1}`, problems));
  if (gallery.length === 0) problems.push(`${where}: no photos`);
  const [firstPhoto, ...otherPhotos] = gallery;
  const cardFirst = raw.cardCover ? photo(raw.cardCover, `${where} card photo`, problems) : firstPhoto;
  const availableTimbers = buildTimbers(raw, where, problems);
  const pricing = buildPricing(
    raw.pricing,
    availableTimbers.map((timber) => timber.slug),
    where,
    problems,
  );

  return {
    slug: text(raw.slug, `${where} slug`, problems),
    name: text(raw.name, `${where} name`, problems),
    category: raw.category,
    cardSubtitle: text(raw.cardSubtitle, `${where} cardSubtitle`, problems),
    subtitle: text(raw.subtitle, `${where} subtitle`, problems),
    cardPrice: pricing ? cardPriceText(pricing) : text(raw.cardPrice, `${where} cardPrice`, problems),
    pagePrice: pricing ? fromPriceText(pricing) : text(raw.pagePrice, `${where} pagePrice`, problems),
    priceNote: raw.priceNote || null,
    pricing,
    note: raw.note || null,
    description: text(raw.description, `${where} description`, problems)
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean),
    specs: (raw.specs ?? []).map((spec, index) => ({
      label: text(spec.label, `${where} spec ${index + 1} label`, problems),
      value: text(spec.value, `${where} spec ${index + 1} value`, problems),
    })),
    availableTimbers,
    cardImages: cardFirst ? [cardFirst, ...otherPhotos] : [],
    galleryImages: gallery,
    ...gridFor(raw.galleryLayout, gallery.length),
  };
}

function buildTile(category: Category, raw: RawCategory | undefined, problems: Problems): CategoryTile {
  const where = `siteSettings category "${category}"`;
  return {
    category,
    label: text(raw?.tileTitle, `${where} tile title`, problems),
    alt: raw?.tileImage?.alt ?? "",
    image: photo(raw?.tileImage, `${where} tile`, problems, true),
  };
}

function buildCta(category: Category, raw: RawCategory | undefined, problems: Problems): CategoryCta {
  const where = `siteSettings category "${category}"`;
  return {
    eyebrow: text(raw?.ctaEyebrow, `${where} CTA eyebrow`, problems),
    heading: text(raw?.ctaHeading, `${where} CTA heading`, problems),
    body: text(raw?.ctaBody, `${where} CTA body`, problems),
  };
}

function buildSite(raw: RawSite, materials: Material[], problems: Problems): SiteContent {
  const where = "siteSettings";
  if (raw.est === null || !Number.isInteger(raw.est)) problems.push(`${where}: est year missing`);
  return {
    brand: BRAND,
    tagline: text(raw.tagline, `${where} tagline`, problems),
    sub: text(raw.sub, `${where} sub`, problems),
    location: text(raw.location, `${where} location`, problems),
    est: raw.est ?? 0,
    email: text(raw.email, `${where} email`, problems),
    instagram: text(raw.instagram, `${where} instagram`, problems),
    pieceEnquiryNote: text(raw.pieceEnquiryNote, `${where} pieceEnquiryNote`, problems),
    // The hero is decorative (empty alt), so it carries no description.
    heroImage: photo(raw.heroImage, `${where} hero`, problems),
    categoryTiles: categories.map((category) => buildTile(category, raw.categories?.[category], problems)),
    enquireSection: {
      heading: text(raw.enquireSection?.heading, `${where} enquireSection heading`, problems),
      body: text(raw.enquireSection?.body, `${where} enquireSection body`, problems),
    },
    about: {
      photo: photo(raw.about?.photo, `${where} about`, problems, true),
      photoAlt: raw.about?.photo?.alt ?? "",
      heading: text(raw.about?.heading, `${where} about heading`, problems),
      paragraphs: paragraphs(raw.about?.paragraphs, `${where} about`, problems),
      signoff: text(raw.about?.signoff, `${where} about signoff`, problems),
    },
    materialsIntro: {
      heading: text(raw.materialsIntro?.heading, `${where} materialsIntro heading`, problems),
      paragraphs: paragraphs(raw.materialsIntro?.paragraphs, `${where} materialsIntro`, problems),
    },
    materials,
  };
}

function build(raw: RawContent): Content {
  const problems: Problems = [];
  if (!raw.site) throw new Error("Invalid content:\n - siteSettings document not found (publish it in the Studio)");

  const materials = raw.materials.map((material) => buildMaterial(material, problems));
  const pieces = raw.pieces
    .map((piece) => buildPiece(piece, problems))
    .filter((piece): piece is Piece => piece !== null);

  for (const slug of findDuplicates(materials.map((material) => material.slug))) {
    problems.push(`duplicate material slug "${slug}"`);
  }
  for (const key of findDuplicates(pieces.map((piece) => `${piece.category}/${piece.slug}`))) {
    problems.push(`duplicate piece slug "${key}"`);
  }

  const site = buildSite(raw.site, materials, problems);
  const categoryCtas = {
    dining: buildCta("dining", raw.site.categories?.dining, problems),
    living: buildCta("living", raw.site.categories?.living, problems),
    bathroom: buildCta("bathroom", raw.site.categories?.bathroom, problems),
  };

  if (problems.length > 0) throw new Error(`Invalid content:\n - ${problems.join("\n - ")}`);
  return { site, pieces, categoryCtas };
}

let contentPromise: Promise<Content> | undefined;

/** Fetched and validated once per build process. */
function loadContent(): Promise<Content> {
  contentPromise ??= fetchSanity<RawContent>(QUERY).then(build);
  return contentPromise;
}

export async function getSite(): Promise<SiteContent> {
  return (await loadContent()).site;
}

export async function getPieces(): Promise<Piece[]> {
  return (await loadContent()).pieces;
}

export async function getPiecesByCategory(category: Category): Promise<Piece[]> {
  return (await getPieces()).filter((piece) => piece.category === category);
}

export async function getPiece(category: Category, slug: string): Promise<Piece | undefined> {
  return (await getPieces()).find((piece) => piece.category === category && piece.slug === slug);
}

export async function getCategoryCta(category: Category): Promise<CategoryCta> {
  return (await loadContent()).categoryCtas[category];
}

export function materialAnchorId(slug: string): string {
  return `mat-${slug}`;
}

export function pieceHref(piece: Pick<Piece, "category" | "slug">): string {
  return `/${piece.category}/${piece.slug}`;
}
