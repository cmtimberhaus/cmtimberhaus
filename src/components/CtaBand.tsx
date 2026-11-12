import Link from "next/link";

interface CtaBandProps {
  eyebrow: string;
  heading: string;
  body: string;
}

export function CtaBand({ eyebrow, heading, body }: CtaBandProps) {
  return (
    <section className="cream">
      <div className="wrap band">
        <div className="band-text">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{heading}</h2>
          <p>{body}</p>
        </div>
        <Link className="dark-btn" href="/enquire">
          Enquire
        </Link>
      </div>
    </section>
  );
}
