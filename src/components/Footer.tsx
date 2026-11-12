import { getSite } from "@/lib/content";

function instagramHandle(url: string): string {
  const segment = new URL(url).pathname.split("/").filter(Boolean)[0];
  return segment ? `@${segment}` : url;
}

export async function Footer() {
  const site = await getSite();

  return (
    <footer className="cream site-footer">
      <div className="wrap footer-inner">
        <div className="footer-brand">
          <span>{site.brand}</span>
          <span className="rule-line" />
        </div>
        <div className="footer-links">
          <a
            className="ig"
            href={site.instagram}
            target="_blank"
            rel="noopener"
            aria-label={`${site.brand} on Instagram`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4.2" />
              <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
            </svg>
            <span>{instagramHandle(site.instagram)}</span>
          </a>
          <a className="ig" href={`mailto:${site.email}`} aria-label={`Email ${site.brand}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3.5 6.5 12 13l8.5-6.5" />
            </svg>
            <span>{site.email}</span>
          </a>
          <span className="est">Est. {site.est}</span>
        </div>
      </div>
    </footer>
  );
}
