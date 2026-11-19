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
- **Pieces**: grouped by category in the Studio, ordered by drag and drop. Each piece references its available timbers; the order of that list is the order on the piece page. Pieces can also carry a price table (see "Prices by timber and size").

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

## Prices by timber and size

A piece can carry a price table (the **Prices by timber and size** field in the Studio). The piece page then shows a Timber choice, a size choice when the piece has sizes, and the exact price of the selected combination. The category cards show "From" plus the lowest price in the table. A piece without a table (today only The Quin) keeps the plain **Price on the card** and **Price on the piece page** fields and renders as before.

When a table exists, the two text price fields are no longer read and the Studio hides them: the table is the only source of truth. **Price note** is still shown under the price (for example "Including installation"), unless the piece has a bundle (pair or set of 8), in which case the page shows "Or $X for a pair, saving $Y" worked out from the table and the Studio hides the price note.

Fields of the table:

| Field | Meaning |
| --- | --- |
| Size name | "Size (mm)" or "Length". Leave empty when only the timber changes the price (one row, no size). |
| Timber shown first | The timber selected when the page opens. Must be one of the piece's Available timbers. |
| Words after the price on the piece page | For example "each" or "a pair". Optional. |
| Words after the price on the card | For example "installed" or "a pair". Optional. |
| Bundle price | "Pair" or "Set of 8" and the number of pieces. When set, every price also needs a bundle price. |
| Sizes | One row per size (or one row without a size). Each row has a price for every available timber, and exactly one row is the **Starting size**. |

### How Charlie edits a price

1. Studio, Pieces, open the piece, **Prices by timber and size**.
2. Open the size row, open the timber, change **Price (whole dollars)**. Whole dollars only, above 0.
3. Publish. The site rebuilds (see "Publish triggers a rebuild") and the card and the page follow.

The Studio refuses to publish when a timber is priced twice in a row, a row misses one of the available timbers, a size is repeated, or there is not exactly one starting size that has a price for the first timber. If a timber is added to or removed from **Available timbers**, update the rows too; the build stops with a message naming the piece and the missing price rather than showing a wrong one.

### Enquiry links

The piece page button opens `/enquire?piece=<slug>&timber=<timber slug>&size=<size>`, also without JavaScript (the choices are a plain GET form). The enquiry form ignores values the piece does not offer, and prefills "Hi, I'm interested in The Yorkshire in Recycled Messmate, 2000 x 1000 mm (guide price $4,300)." The timber, size and guide price are sent with the enquiry and appear as "Timber:", "Size:" and "Guide price:" lines in the email. The guide price is what the visitor saw, it is informational only, and the server never prices anything from it.

### Loading the tables (`scripts/import-pricing.mts`)

`content/pricing.json` holds the 347 prices checked against the original site. The script copies them into the pieces.

```
node --experimental-strip-types scripts/import-pricing.mts          # dry run (default): reads, validates, prints, writes nothing
```

The dry run lists, per piece, what would be set, the card text before and after, and any piece it would skip. It validates every combination (all timbers in every row, one starting size, whole amounts, bundle prices) and exits with an error if anything is wrong.

To write (needs a token with the Editor role, revoke it afterwards, never commit it):

```
SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/import-pricing.mts --apply --yes
```

- `--apply` without `--yes` refuses to run. The token is read from the environment, and only for `--apply`.
- Each piece is patched with `setIfMissing` on `pricing` and the revision that was read (`ifRevisionId`): a table that already exists is left alone, and a piece edited in the Studio in the meantime makes the transaction fail instead of being overwritten. There is no replace mode.
- A piece with an unpublished draft (`drafts.piece-...`) is skipped and reported. Publish or discard the draft in the Studio, then run the script again.
- After applying, the next build (or a publish) shows the new prices. Take a dataset export first (see "Roles and the free plan").

### Opening on the cheapest option (`scripts/set-cheapest-defaults.mts`)

A piece page opens on the smallest size (the first row) and on the first timber, in the order of **Available timbers**, that has the lowest price in that row. `content/pricing.json` follows this rule, and `tests/set-cheapest-defaults.test.mjs` fails if it stops doing so. The card price (the table minimum) is therefore always the price the page opens on.

```
node --experimental-strip-types scripts/set-cheapest-defaults.mts          # dry run (default): current and new default per piece, writes nothing
SANITY_WRITE_TOKEN=... node --experimental-strip-types scripts/set-cheapest-defaults.mts --apply --yes
```

`--apply` patches only `pricing.defaultTimber` and the **Starting size** flags, in one transaction with `ifRevisionId` per piece. Pieces with an unpublished draft, without a live price table, or whose live prices differ from `content/pricing.json` are skipped and reported. `scripts/extract-pricing.mts` still derives the defaults from the original site, so do not re-run it over `content/pricing.json` without running this script afterwards.

### Checking the price selector

```
NEXT_PUBLIC_SITE_URL=http://localhost:4173 npm run build        # live content, no price tables yet: site unchanged
node --experimental-strip-types --test tests/pricing.test.mjs   # price functions and table validation
node --experimental-strip-types --test tests/set-cheapest-defaults.test.mjs   # cheapest-default rule
node --experimental-strip-types tests/enquiry.test.mjs          # enquiry function, Resend replaced by a recorder

NODE_OPTIONS="--import ./tests/pricing-fixture.mjs" NEXT_PUBLIC_SITE_URL=http://localhost:4173 npm run build
node tests/pricing.e2e.mjs <out folder of a build without tables>   # clicks every timber and size, needs Playwright
```

Delete `.next` before and after a fixture build (`rm -rf .next`): Next caches the Sanity response there, and a cached fixture response would otherwise be replayed by the next normal build.

`tests/pricing-fixture.mjs` is test-only: it reads the live content and merges `content/pricing.json` into the pieces in memory. It never writes to Sanity and is not part of the site.

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
