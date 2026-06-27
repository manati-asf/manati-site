# Manati website — Astro + Decap CMS

A fast, secure, static rebuild of manati.co.za. No WordPress, no PHP, no database —
pages are pre-built and served as static files, which removes the class of risk
behind the recent compromise.

This is an early working scaffold: the homepage is fully built in the real Manati
brand, with the Insights section driven by a simple content management system.

## What's included

- **Homepage** (`src/pages/index.astro`) — hero with an interactive repayment
  calculator (sliders), three key benefits, how-it-works, for-institutions,
  a scrolling partner-logo ticker (16 real institution logos embedded), an
  Insights section, and a footer with real contact details + compliance block.
- **Brand** — the real Manati logo (vector, in colour in the header and reversed
  to white in the footer), the official palette (Citrine Yellow `#dec323`, Blue
  Charcoal `#231f20`) and the approved web fonts (Varela Round + Duru Sans).
- **Insights as content** (`src/content/insights/*.md`) — articles are markdown
  files. The homepage and individual article pages (`/insights/<slug>`) are
  generated from them automatically.
- **Decap CMS** (`public/admin/`) — a browser-based editor at `/admin` so the
  team can add/edit articles without touching code. It commits changes back to
  Git, which triggers a rebuild.

## Prerequisites

- Node.js 18.17+ (or 20+). Check with `node -v`.

## Run locally

```bash
npm install        # first time only (installs Astro)
npm run dev        # starts the dev server at http://localhost:4321
```

Build the production site:

```bash
npm run build      # outputs static files to ./dist
npm run preview    # preview the built site locally
```

> Note: the production build was **not** run inside the tool sandbox (the Astro
> install exceeds the environment's command time limit). Run `npm install`
> locally — it completes normally on a normal machine — then `npm run build`.

## Editing content (Decap CMS)

**Locally (no auth):** in one terminal run `npx decap-server`, and in another run
`npm run dev`. Open `http://localhost:4321/admin` to add/edit Insights articles.

**In production:** connect a Git backend. Recommended path:

1. Push this repo to GitHub.
2. Deploy on **Cloudflare Pages** or **Netlify** (build command `npm run build`,
   output directory `dist`).
3. Enable a Git-based auth for Decap (Netlify Identity + Git Gateway, or the
   GitHub backend) and update `public/admin/config.yml` accordingly.

## Deploy

Any static host works. Recommended: Cloudflare Pages or Netlify.

- Build command: `npm run build`
- Output directory: `dist`
- No server, no database to maintain or patch.

## Still to do (next iterations)

- Replace the calculator's placeholder **13.5% p.a.** with Manati's real rate
  (in the `<script>` in `src/pages/index.astro`), and confirm whether repayment
  begins after a study period.
- Confirm NCR / company registration numbers for the footer compliance line.
- Build out the remaining pages (About, How to Apply with the Landbot embed,
  For Institutions, Contact) — the homepage establishes the components and style.
- Swap partner logos for transparent/SVG versions if preferred, and add the full
  set from the `EI Logos` library.
- Add favicon (icon provided at `public/assets/manati-icon.png`), meta/OG images,
  sitemap and analytics.
- Phase 2: social cross-posting (Make/Zapier from the Insights RSS feed).
