import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InnerLayout } from "@/components/InnerLayout";
import { Photo } from "@/components/Photo";
import { PriceSelector } from "@/components/PriceSelector";
import {
  categoryTitles,
  getPiece,
  getPieces,
  getSite,
  isCategory,
  materialAnchorId,
  type Piece,
} from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

interface PiecePageProps {
  params: Promise<{ category: string; slug: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  const pieces = await getPieces();
  return pieces.map((piece) => ({ category: piece.category, slug: piece.slug }));
}

async function loadPiece(params: PiecePageProps["params"]): Promise<Piece | undefined> {
  const { category, slug } = await params;
  if (!isCategory(category)) return undefined;
  return getPiece(category, slug);
}

export async function generateMetadata({ params }: PiecePageProps): Promise<Metadata> {
  const piece = await loadPiece(params);
  if (!piece) return {};

  return pageMetadata({
    title: `${piece.name}, ${piece.subtitle}`,
    description: `${piece.description[0] ?? piece.subtitle} ${piece.pagePrice}.`,
    path: `/${piece.category}/${piece.slug}`,
  });
}

const GALLERY_COLUMNS: Record<string, number> = { "3": 3, n2: 2, n4: 4, n5: 5, wide: 1, n1: 1 };
const GALLERY_GAP = 14;
const GALLERY_MAX_WIDTH = 660;
const SINGLE_IMAGE_MAX_WIDTH = 420;

/**
 * Rendered width hint for a gallery image. The gallery column is about 45vw wide from 900px up
 * (about 660px once the page hits its 1440px cap) and nearly full width below that. A figure is
 * that width divided by the number of columns, less the gaps. A lead image spans every column.
 */
function gallerySizes(layout: string, isLead: boolean): string {
  const columns = isLead ? 1 : (GALLERY_COLUMNS[layout] ?? 3);
  const phoneColumns = layout === "n4" && !isLead ? 2 : columns;
  const limit = layout === "n1" ? SINGLE_IMAGE_MAX_WIDTH : Infinity;
  const fluid = (vw: number) => (layout === "n1" ? `min(${vw}vw, ${limit}px)` : `${vw}vw`);
  const capped = Math.min(limit, Math.round((GALLERY_MAX_WIDTH - (columns - 1) * GALLERY_GAP) / columns));

  return [
    `(max-width: 599px) ${fluid(Math.round(88 / phoneColumns))}`,
    `(max-width: 899px) ${fluid(Math.round(88 / columns))}`,
    `(max-width: 1440px) ${fluid(Number((45 / columns).toFixed(1)))}`,
    `${capped}px`,
  ].join(", ");
}

function timberAnchor(slug: string): string {
  return `/materials#${materialAnchorId(slug)}`;
}

export default async function PiecePage({ params }: PiecePageProps) {
  const [piece, site] = await Promise.all([loadPiece(params), getSite()]);
  if (!piece) notFound();

  const description = (
    <div className="pd-desc">
      {piece.description.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </div>
  );
  const galleryClass = ["pd-gal", piece.galleryLayout === "3" ? "" : piece.galleryLayout]
    .filter(Boolean)
    .join(" ");

  return (
    <InnerLayout>
    <section className="cream">
      <div className="wrap piece-wrap">
        <div className="pd">
          <div className={galleryClass}>
            {piece.galleryImages.map((image, index) => (
              <figure key={index} className={index === piece.galleryLead ? "lead" : undefined}>
                <Photo
                  image={image}
                  alt={`${piece.name}, ${piece.subtitle}, photo ${index + 1} of ${piece.galleryImages.length}`}
                  sizes={gallerySizes(piece.galleryLayout, index === piece.galleryLead)}
                  priority={index === 0}
                />
              </figure>
            ))}
          </div>
          <div className="pd-info">
            <Link className="pd-back" href={`/${piece.category}`}>
              &larr; All {categoryTitles[piece.category].toLowerCase()}
            </Link>
            <h1>{piece.name}</h1>
            <span className="pd-mat">{piece.subtitle}</span>
            {piece.pricing ? (
              <PriceSelector
                pieceSlug={piece.slug}
                pricing={piece.pricing}
                timbers={piece.availableTimbers}
                specs={piece.specs}
                priceNote={piece.priceNote}
                note={piece.note}
                enquiryNote={site.pieceEnquiryNote}
              >
                {description}
              </PriceSelector>
            ) : (
              <>
                <span className="pd-price">{piece.pagePrice}</span>
                {piece.priceNote && <span className="pd-set">{piece.priceNote}</span>}
                <div className="pd-avail">
                  <span>Available in</span>
                  <ul>
                    {piece.availableTimbers.map((timber) => (
                      <li key={timber.slug}>
                        <Link className="chip" href={timberAnchor(timber.slug)}>
                          {timber.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {piece.note && <div className="pd-note">{piece.note}</div>}
                </div>
                {description}
                <dl className="pd-specs">
                  {piece.specs.map((spec) => (
                    <div key={spec.label}>
                      <dt>{spec.label}</dt>
                      <dd>{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="pd-cta">
                  <Link className="dark-btn" href={`/enquire?piece=${piece.slug}`}>
                    Enquire about this piece
                  </Link>
                  <small>{site.pieceEnquiryNote}</small>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
    </InnerLayout>
  );
}
