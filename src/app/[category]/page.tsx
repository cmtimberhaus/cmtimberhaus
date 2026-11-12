import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CtaBand } from "@/components/CtaBand";
import { InnerLayout } from "@/components/InnerLayout";
import { PieceCard } from "@/components/PieceCard";
import {
  categories,
  categoryTitles,
  getCategoryCta,
  getPiecesByCategory,
  isCategory,
} from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return categories.map((category) => ({ category }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isCategory(category)) return {};

  const pieces = await getPiecesByCategory(category);
  const names = pieces.slice(0, 4).map((piece) => piece.name);
  const more = pieces.length > names.length ? " and more" : "";
  return pageMetadata({
    title: categoryTitles[category],
    description: `${categoryTitles[category]} furniture handmade to order in Torquay: ${names.join(", ")}${more}. Prices in AUD.`,
    path: `/${category}`,
  });
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;
  if (!isCategory(category)) notFound();

  const [pieces, cta] = await Promise.all([
    getPiecesByCategory(category),
    getCategoryCta(category),
  ]);

  return (
    <InnerLayout>
      <section className="cream">
        <div className="wrap pagehead">
          <Link className="pd-back cat-back" href="/">
            &larr; Back
          </Link>
          <div className="pagehead-row">
            <h1>{categoryTitles[category]}</h1>
            <span className="caption">Prices in AUD &middot; Made to order</span>
          </div>
          <div className="cards">
            {pieces.map((piece) => (
              <PieceCard key={piece.slug} piece={piece} />
            ))}
          </div>
        </div>
      </section>
      <CtaBand eyebrow={cta.eyebrow} heading={cta.heading} body={cta.body} />
    </InnerLayout>
  );
}
