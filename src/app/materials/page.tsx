import Link from "next/link";
import type { Metadata } from "next";
import { InnerLayout } from "@/components/InnerLayout";
import { Photo } from "@/components/Photo";
import { getSite, materialAnchorId } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Materials",
  description:
    "The solid hardwoods we build with: Blackwood, Blackbutt, Messmate, Recycled Messmate, American Oak, Walnut and Australian Chestnut.",
  path: "/materials",
});

export default async function MaterialsPage() {
  const site = await getSite();

  return (
    <InnerLayout>
    <section className="cream">
      <div className="wrap inner">
        <Link className="pd-back cat-back" href="/">
          &larr; Back
        </Link>
        <div className="mt-intro">
          <span className="eyebrow">Materials</span>
          <h1>{site.materialsIntro.heading}</h1>
          {site.materialsIntro.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <div className="mt-grid">
          {site.materials.map((material) => (
            <div key={material.slug} className="mt-row" id={materialAnchorId(material.slug)}>
              <div className="mt-ph has">
                <Photo image={material.image} alt={material.imageAlt} sizes="170px" />
              </div>
              <div className="mt-tx">
                <small>{material.kind}</small>
                <h2>{material.name}</h2>
                <p>{material.description}</p>
                <p className="k">{material.summary}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-cta">
          <p>Can&rsquo;t decide? Tell us about your space and we&rsquo;ll help you choose the right timber.</p>
          <Link className="dark-btn" href="/enquire">
            Ask about timber
          </Link>
        </div>
      </div>
    </section>
    </InnerLayout>
  );
}
