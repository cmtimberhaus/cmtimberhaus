import Link from "next/link";
import type { Metadata } from "next";
import { InnerLayout } from "@/components/InnerLayout";
import { Photo } from "@/components/Photo";
import { getSite } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "About Charlie & Mia",
  description:
    "CM Timberhaus is Charlie and Mia, a husband and wife team building solid timber furniture by hand in Torquay.",
  path: "/about",
});

export default async function AboutPage() {
  const { about } = await getSite();

  return (
    <InnerLayout>
    <section className="cream">
      <div className="wrap inner">
        <Link className="pd-back cat-back" href="/">
          &larr; Back
        </Link>
        <div className="ab">
          <div className="ab-photo has">
            <Photo image={about.photo} alt={about.photoAlt} sizes="(max-width: 859px) 260px, 300px" priority />
          </div>
          <div className="ab-text">
            <span className="eyebrow">About</span>
            <h1>{about.heading}</h1>
            {about.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <span className="ab-sign">{about.signoff}</span>
            <div className="ab-cta">
              <Link className="dark-btn" href="/enquire">
                Start your piece
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
    </InnerLayout>
  );
}
