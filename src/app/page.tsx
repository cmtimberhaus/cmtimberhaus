import Link from "next/link";
import type { Metadata } from "next";
import { EnquireSection } from "@/components/EnquireSection";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Photo } from "@/components/Photo";
import { getSite } from "@/lib/content";
import { baseOpenGraph, jsonLd } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...baseOpenGraph, url: "/" },
};

export default async function HomePage() {
  const site = await getSite();

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.brand,
    url: getSiteUrl(),
    email: site.email,
    sameAs: [site.instagram],
    areaServed: site.location,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(organization) }}
      />
      <Header variant="fixed" />
      <main id="main" tabIndex={-1}>
        <section className="hero">
          <Photo name={site.heroImage} alt="" className="cover" sizes="100vw" priority />
          <div className="hero-shade" />
          <div className="hero-top" />
          <div className="hero-main">
            <div className="hero-copy">
              <span className="hero-brand">{site.brand}</span>
              <h1>{site.tagline}</h1>
              <p className="hero-sub">{site.sub}</p>
              <div className="hero-cta-wrap">
                <a className="hero-cta" href="#categories">
                  Explore Our Work
                </a>
              </div>
            </div>
          </div>
          <div className="hero-foot">
            <div className="hero-foot-left">
              <span className="line" />
              <span className="hero-loc">{site.location}</span>
            </div>
            <div className="scroll-cue" aria-hidden="true">
              <span className="label">Scroll</span>
              <span className="line" />
            </div>
          </div>
        </section>
        <section id="categories" className="tiles">
          {site.categoryTiles.map((tile, index) => (
            <Link key={tile.category} className="tile" href={`/${tile.category}`}>
              <Photo
                name={tile.image}
                alt={tile.label}
                sizes="34vw"
                className={tile.category === "bathroom" ? "cover cover-zoom" : "cover"}
              />
              <div className="shade" />
              <div className="lab">
                <span className="n">{String(index + 1).padStart(2, "0")}</span>
                <span className="r" />
                <span className="t">{tile.label}</span>
              </div>
            </Link>
          ))}
        </section>
        <EnquireSection headingLevel="h2" />
      </main>
      <Footer />
    </>
  );
}
