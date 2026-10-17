# TORSH icon library / v3.0

23 brand icons and 10 interface icons, supplied as editable SVGs. The public website uses inline SVG geometry from the same manifest as the standalone exports.

## Geometry and appearance

`manifest.json` is the single geometry source. Brand icons use a 64 × 64 coordinate system with a primary 2.2-unit rounded stroke. Small detail or accent strokes can differ for optical balance. Interface icons use a 24 × 24 grid and a 1.6-unit stroke.

Colours are controlled by `--icon-ink` and `--icon-accent` in the master stylesheet. On dark sections those tokens switch to white and a lighter blue. Inline SVGs are decorative where adjacent text supplies the meaning; buttons always retain a separate accessible name.

The style guide includes the complete gallery, key icons at 24/32/48/64 px, and a dark-surface check. Device icons are simplified category illustrations—not engineering drawings or evidence of performance.

## Reuse

For a standalone image in another project:

```html
<img src="assets/icons/endoscopy.svg" alt="Endoscopy" width="64" height="64">
```

Use empty alt text when the icon merely repeats an adjacent label. Standalone SVG files have their own palette and do not inherit CSS variables from the surrounding page.

For theme-aware usage in this site, use the builder's `icon()` helper or preserve the existing `torsh-icon` class and `data-torsh-icon` attribute on an inline SVG. `data-tone="accent"` selects an accent stroke; `data-tone="fill"` selects a filled accent. Other fills using `currentColor` inherit the ink colour.

## Updating the library

Edit `manifest.json`, then run:

```sh
python tools/build_site.py
python tools/sync_icons.py
python tools/check_site.py
python tools/export_preview.py
```

Rebuilding also keeps the internal gallery and labels aligned. `sprite.svg` is optional and is not required for website operation.

## Meaning and limits

The quality-review shield must not imply certification. The distribution icon is used for prospective partner enquiries, not as proof of existing global operations. The progress chart is retained only in the internal reusable library; it is not used to claim improved clinical outcomes. Packaging and document icons do not establish a released product, finished catalogue or regulatory approval.

See `docs/ICON-AUDIT.md` for the changes made during this revision.
