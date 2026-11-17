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

All site content lives in Sanity (project `ka21otlh`, dataset `production`, public dataset, no token needed to read):

- **Site settings** (single document): hero photo and text, About, home page category tiles, per-category call-to-action text, Materials page intro, the enquiry section, contact details and the "Est." year.
- **Timbers** (`material` documents): name, kind, description, summary and photo, in the order they appear on /materials.
- **Pieces**: grouped by category in the Studio, ordered by drag and drop. Each piece references its available timbers; the order of that list is the order on the piece page.

`src/lib/content.ts` is the only file that reads content. It fetches everything once per build and **fails the build** on: missing site settings or required fields, duplicate piece or timber slugs, a piece that references a timber that no longer exists, pieces without photos or timbers, and timber, tile or About photos without a description (alt text). Builds read live Sanity data and must not rely on `.next/cache`: the query is sent with `next: { revalidate: 1 }`, so if the host restores a build cache the content still refreshes.

What stays in code: brand name, navigation, form labels and messages, legal and structural text, the category list and URLs, the logo (`public/images/logo.png`) and `public/og.jpg`.

> `public/og.jpg` (the link-preview image) is a fixed file. It does **not** follow a change of the hero photo in Sanity; replace the file by hand if the hero changes.

Photos are served from the Sanity CDN with `@sanity/image-url` (WebP, 800 and 1600 pixel variants, same `srcset` as before). Width and height come from the asset metadata, so there is no layout shift.

## Studio

The Studio lives in `studio/` (its own `package.json`).

```
cd studio
npm install
npm run dev        # http://localhost:3333
npm run deploy     # hosted Studio on sanity.studio
npm run typecheck
```

Draft changes stay private until **Publish**. The site only reads published documents.

### Roles and the free plan

The free plan has only the Administrator and Viewer roles. Charlie must be an **Administrator** to edit, which also lets him delete the project or dataset in the Sanity settings. Keep a backup: run `npx sanity dataset export production backup.tar.gz` from `studio/` regularly (for example monthly, and before any large edit) and store the file outside the repo.

### Publish triggers a rebuild

In Cloudflare Pages create a **deploy hook** (Settings, Builds & deployments, Deploy hooks). In Sanity (manage.sanity.io, API, Webhooks) create a webhook:

- URL: the deploy hook URL
- Dataset: `production`, trigger on create, update and delete
- Filter: `_type in ["siteSettings", "material", "piece"]`
- Projection: leave empty, HTTP method POST, drafts off

Each publish then rebuilds and deploys the static site (usually a minute or two).

### Import (one-off)

`scripts/import-content.mts` loaded the original content into Sanity. It creates documents with fixed ids and `createIfNotExists`, so re-running never overwrites Studio edits (`--replace` does).

```
node --experimental-strip-types scripts/import-content.mts          # dry run, writes nothing
SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/import-content.mts --write
```

Use a token with the Editor role and revoke it afterwards. Never commit it.

## Deploy (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `out`
- Headers (caching, nosniff, referrer policy, frame denial) come from `public/_headers`.

Build variables (Settings, Variables and Secrets, Production and Preview):

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `22` |
| `NEXT_PUBLIC_SITE_URL` | Public site address, for example `https://cmtimberhaus.com.au`. Required. The build stops with an error naming it when it is missing, invalid or an example.com/org/net host. |

That is the complete list. The Sanity project id (`ka21otlh`) and dataset (`production`) are fixed in `src/lib/sanity.ts`, so there are no `SANITY_*` variables, and the dataset is public so no token is needed. Do not add a Sanity token to Cloudflare.

Runtime secrets of the Pages Function (encrypted, not used by the build): `RESEND_API_KEY`, `ENQUIRY_TO`, `ENQUIRY_FROM`.

`functions/api/enquiry.ts` is served at `/api/enquiry`. Without the three Function variables it returns 500 and the form shows the email fallback.

## Custom domain

An apex domain on Pages needs Cloudflare nameservers. Before switching them at the registrar, copy every existing DNS record (especially MX and email TXT) into Cloudflare.

## Not done yet

- Sanity deploy webhook (steps above), hosted Studio deploy.
- Resend domain verification (sender must be on a verified domain).
- Cloudflare Turnstile (the form currently uses a honeypot field only).
- Final contact email, footer details (ABN, phone, service area), confirmed prices and About text.

## RSC prefetch workaround

Next 16 with `output: "export"` writes segment prefetch payloads into nested folders (`out/dining/__next.$d$category/__PAGE__.txt`), but the client router requests a flat, dot-joined name (`out/dining/__next.$d$category.__PAGE__.txt`). Without a fix every `<Link>` prefetch 404s and floods the console. Tracked upstream in [vercel/next.js#85374](https://github.com/vercel/next.js/issues/85374).

`scripts/flatten-rsc-segments.mts` runs as `postbuild` (so `npm run build` runs it) and copies each nested payload to its flat name. The nested originals stay in place. Verified against Next 16.4.6; this is still needed there.

To remove it: once an upstream release fixes the issue, delete the script and the `postbuild` entry, rebuild, serve `out/` and check the browser network panel for 404s on `__next.*.txt`.
