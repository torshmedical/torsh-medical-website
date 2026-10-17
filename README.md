# TORSH Medical Technologies Website v4.0

This is a static, responsive TORSH website built around the Graphite + Electric Blue identity. It includes seven urology product-family pages, three procedure-led solution pages and a six-article Insights library.

## Open the site

Open `index.html` in a browser or serve the folder with any static web server. The site has no framework or runtime dependency.

## Edit design in one place

All public colours, typography, spacing, layout, cards, article styling and responsive rules are in:

`assets/css/master.css`

The core design tokens are at the top of that file. Changing a token such as `--color-electric`, `--font-display`, `--radius-md` or `--container` updates the design system across the website.

## Edit content in one place

All public copy and structured page data are in:

`content/site-content.json`

The file contains company copy, navigation, seven product families, three procedure pages, six Insights articles, contact content and publishing status fields. Product families default to `status: category_only` and `availability: false`.

After editing the content source, rebuild with the bundled or local Python runtime:

```sh
python tools/build_site.py
python tools/sync_icons.py
python tools/check_site.py
```

`tools/refresh_from_brief.py` can re-import the supplied DOCX brief when required. It is a controlled content migration utility, not a normal build step.

## Public structure

- Home
- About
- Urology Products
- Seven category-level product pages
- Three procedure-led solution pages
- Insights hub
- Six educational insight articles
- Contact
- Privacy and website information
- Accessible search and custom 404 page

The investigational innovation page remains outside public navigation because the brief places it behind founder, IP and regulatory approval.

## Editorial and regulatory boundaries

- Product-family pages are educational category overviews, not model data sheets.
- The site does not claim inventory, manufacturing role, certifications, approvals, sterile status or clinical superiority.
- Specifications and availability must be verified for each model before publication.
- Insights are marked for clinical editorial review and link to the current EAU Urolithiasis guideline.
- Contact configuration remains inactive until a verified public inbox is added to `assets/js/site-config.js`.
- The enquiry experience does not fake submission or store data.

## Brand assets

The supplied palette, typography and wordmark iteration boards are retained under `assets/images/brand-*.jpg` and displayed only in the internal `style-guide.html`. They informed the design but are not used as public product imagery.

## Deployment

The generated public website is in `dist/`. Configure the personal Git host to publish that directory, while keeping the editable source, content files and build tools in the repository.

This repository intentionally contains no ChatGPT Sites project identity or hosting configuration. Exclude `style-guide.html`, `content/`, `docs/`, `tools/`, the brand reference boards and this README from the public deployment unless internal references are intentionally required.
