# Banner Prototype Generator

A small local web app that inspects a live marketplace homepage and prepares a prefilled CodePen for banner prototyping.

## What it automates

- Fetches the live homepage HTML from a marketplace URL.
- Extracts the header area and the most likely hero/banner carousel block.
- Collapses the hero down to a single slide for prototyping.
- Detects the primary live stylesheet.
- Detects Google Font links already present on the page.
- Adds local prototype CSS and JS helpers:
  - disables header/menu interactions
  - hides carousel controls
  - turns autoplay off in `data-slick`
- Builds a CodePen payload and opens it through CodePen's prefill endpoint.

## Why this is a small app instead of a normal Pen

A normal CodePen Pen can create the final prototype, but it cannot reliably fetch and parse arbitrary live storefront HTML in the browser because of CORS. The extraction step needs to happen server-side, so the easiest v1 is a tiny Node app that does both:

- server-side extraction
- client-side editing and preview
- CodePen prefill handoff

If you want this hosted later, the safest fit is a lightweight Node host. A CodePen Project could host the front end, but it would still need a separate server endpoint for extraction.

## Run locally

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Recommended workflow

1. Paste the marketplace homepage URL.
2. Review the extracted HTML, external CSS URLs, and preview.
3. Adjust anything that needs cleanup.
4. Click `Open In CodePen`.
5. Save the new Pen to the designer's own account.
6. Swap banner copy, image URLs, and CTA destinations as needed for each slide concept.

## Files

- [server.js](/Users/tapps/Library/CloudStorage/Dropbox/work/c2/FE/_dev/banner-templates/server.js)
  Express server and extraction endpoint.
- [lib/extractor.js](/Users/tapps/Library/CloudStorage/Dropbox/work/c2/FE/_dev/banner-templates/lib/extractor.js)
  Fetching, DOM heuristics, cleanup, and CodePen payload generation.
- [public/index.html](/Users/tapps/Library/CloudStorage/Dropbox/work/c2/FE/_dev/banner-templates/public/index.html)
  App shell.
- [public/app.js](/Users/tapps/Library/CloudStorage/Dropbox/work/c2/FE/_dev/banner-templates/public/app.js)
  UI behavior, payload editing, preview rendering.
- [public/styles.css](/Users/tapps/Library/CloudStorage/Dropbox/work/c2/FE/_dev/banner-templates/public/styles.css)
  App styling.
- [docs/designer-workflow.md](/Users/tapps/Library/CloudStorage/Dropbox/work/c2/FE/_dev/banner-templates/docs/designer-workflow.md)
  End-user instructions.

## Known limitations

- Extraction is heuristic. Some storefronts will need selector tuning.
- Sites with bot protection or unusual homepage builders may block extraction.
- Some themes may need an alternate stylesheet URL instead of the top detected one.
- If a site uses a nonstandard hero structure, the app may grab the wrong carousel and need manual correction.
- The app currently assumes the first meaningful hero/banner on the homepage is the right target.

## Good next improvements

- Add saved presets per client or theme family.
- Add a "force selector" advanced field for difficult sites.
- Add export/import of extraction results as JSON.
- Add a one-click "duplicate this prototype slide" starter inside the generated HTML.
