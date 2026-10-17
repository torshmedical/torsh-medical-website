# QA report — TORSH website v3.0

## Scope and method

Reviewed the rewritten company, portfolio, product-segment, research, contact and informational pages, and their icon implementations. Browser checks used **Chromium with the self-contained HTML preview loaded using `set_content`**. This exercises the generated HTML/CSS/JavaScript and hash-routed navigation, not a hosted production deployment. The multi-page source also received local path and structure checks.

## Recorded results

- **13 pages × 7 viewport widths = 91 layout checks.** Widths: 320, 390, 620, 768, 1024, 1440 and 1920 pixels.
- No page-level horizontal overflow or flagged out-of-viewport content in these checks.
- Exactly one main heading per page; no empty SVG instances or failed image loads in the rendered preview.
- **33 icon definitions** passed the SVG-canvas bounds check, including a primary-stroke allowance.
- Search filtering, no-results state, Escape, focus restoration and result-link navigation passed.
- Mobile menu expansion, navigation, automatic closing and Escape passed.
- Both unconfigured and configured contact states passed. The configured state was tested with a non-deliverable QA address; no email was opened or sent. The supplied configuration remains empty.
- Native FAQ expansion passed.
- No JavaScript runtime errors were recorded during the browser checks.
- The production homepage was also rendered with JavaScript disabled: the core copy, six cards and navigation remained available, and the unsupported search control was hidden.

## Source checks

`PASS: 13 pages; 490 local references; 33 icon definitions; 38 SVG files.`

The source checker covers local links, assets, fragment targets, headings, duplicate IDs, document language, image alt attributes, known icon IDs, SVG XML and unexpected font files.

## Visual review

Desktop and mobile screenshots were reviewed for readable hierarchy, spacing, icon meaning and clipping. Key icons were checked at 24, 32, 48 and 64 px; dark-surface variants were checked separately. The stent, basket, biomaterial network, access/suction and supporting research icons received specific attention. Screenshots in `previews/` come from the implemented HTML, not the earlier image mockup.

## Content review

The revision distinguishes five planned product categories from one investigational programme. It removes vague promotional filler and unsupported outcome positioning, uses consistent category names, and gives each device page a specific scope and set of priorities. The research copy distinguishes its proposed mechanism from demonstrated clinical benefit. No proprietary hydrogel name/formulation, invented contact address, unverified certification or named institutional endorsement is included.

## Limits and publication items

These are development checks, not a comprehensive accessibility audit, cross-browser certification, clinical validation or regulatory assessment. Safari, Firefox, assistive-technology combinations and a live hosting environment were not tested. Before publication, verify the public inbox and domain, review hosting-specific privacy information, and approve any later model-level specifications, claims and availability statements.

Full machine-readable results: `docs/qa-results.json`.
