import { getPieces, getSite } from "@/lib/content";
import { EnquiryForm } from "./EnquiryForm";

interface EnquireSectionProps {
  headingLevel: "h1" | "h2";
}

export async function EnquireSection({ headingLevel: Heading }: EnquireSectionProps) {
  const [site, pieces] = await Promise.all([getSite(), getPieces()]);

  return (
    <section id="enquire" className="cream">
      <div className="wrap enquire-grid">
        <div className="enquire-intro">
          <span className="eyebrow">Enquire</span>
          <Heading>{site.enquireSection.heading}</Heading>
          <p>{site.enquireSection.body}</p>
          <span className="rule-line" />
        </div>
        <EnquiryForm
          pieces={pieces.map((piece) => ({ slug: piece.slug, name: piece.name }))}
          fallbackEmail={site.email}
        />
      </div>
    </section>
  );
}
