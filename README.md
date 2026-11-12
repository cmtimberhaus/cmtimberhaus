# CM Timberhaus

Static Next.js 16 site (App Router, `output: "export"`) with one Cloudflare Pages Function for the enquiry form.

## Develop

```
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_SITE_URL (http://localhost:4173 for local preview)
npm run dev
npm run typecheck
npm run build                # writes ./out
```

Node 22 or newer (`engines`, `.node-version`). `NEXT_PUBLIC_SITE_URL` is required at build time (canonical URLs, sitemap, Open Graph). The build fails if it is missing or points at an example.com/org/net host.

`npm run preview` serves `out/` on port 4173 (serve is pinned in the script).

## Content

- `content/pieces.json`: all pieces. Order within a category is the `order` field.
- `content/site.json`: brand text, contact details, About and Materials text, the enquiry reply-time note on piece pages.
- `content/images.json`: dimensions per image. Images live in `public/images/<name>-800.webp` and `-1600.webp`.
- `src/lib/content.ts` is the only file that reads content. It validates it at build time (duplicate slugs, unknown categories, missing image files, timbers without a material) and fails the build on any problem. It is async so it can be switched to Sanity without touching pages.

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `out`
- Headers (caching, nosniff, referrer policy, frame denial) come from `public/_headers`.
- Environment variable (build): `NEXT_PUBLIC_SITE_URL`
- Environment variables (Functions): `RESEND_API_KEY`, `ENQUIRY_TO`, `ENQUIRY_FROM`

`functions/api/enquiry.ts` is served at `/api/enquiry`. Without the three Function variables it returns 500 and the form shows the email fallback.

## Custom domain

An apex domain on Pages needs Cloudflare nameservers. Before switching them at the registrar, copy every existing DNS record (especially MX and email TXT) into Cloudflare.

## Not done yet

- Sanity schema, import of `content/pieces.json`, deploy webhook.
- Resend domain verification (sender must be on a verified domain).
- Cloudflare Turnstile (the form currently uses a honeypot field only).
- Final contact email, footer details (ABN, phone, service area), confirmed prices and About text.

## RSC prefetch workaround

Next 16 with `output: "export"` writes segment prefetch payloads into nested folders (`out/dining/__next.$d$category/__PAGE__.txt`), but the client router requests a flat, dot-joined name (`out/dining/__next.$d$category.__PAGE__.txt`). Without a fix every `<Link>` prefetch 404s and floods the console. Tracked upstream in [vercel/next.js#85374](https://github.com/vercel/next.js/issues/85374).

`scripts/flatten-rsc-segments.mts` runs as `postbuild` (so `npm run build` runs it) and copies each nested payload to its flat name. The nested originals stay in place. Verified against Next 16.4.6; this is still needed there.

To remove it: once an upstream release fixes the issue, delete the script and the `postbuild` entry, rebuild, serve `out/` and check the browser network panel for 404s on `__next.*.txt`.
