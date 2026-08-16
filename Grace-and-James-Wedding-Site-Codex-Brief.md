# Codex implementation brief: Grace & James wedding website

## Mission

Implement an elegant, self-contained static wedding information site at:

`https://www.jimgumbley.com/wedding/`

The final HTML must be generated at build time from a versioned JSON manifest. The manifest is the editable source of truth for page order, HTML copy, and preview metadata. The reviewed social-preview SVG/PNG pair is the one derived visual-asset exception because WhatsApp needs a raster preview image with fixed artwork. The generated site must work as ordinary static files from the `/wedding/` subdirectory, without a backend, framework, CMS, client-side renderer, or third-party runtime.

This brief explicitly authorises the narrowly scoped source files, generated files, Make targets, CSS, and SVG assets listed below. It does not authorise a wider repository refactor.

## Source-of-truth order

Use these supplied sources only:

1. `Grace_and_James_Wedding_Info_Pack_Canva_Edit.pptx.pdf`
   - Authoritative source for guest-facing facts and copy.
   - Supplies the date, schedule, venue addresses, travel note, reception details, gift list, photo guestbook instructions, and closing message.
2. `Wedding Order of Service (3).pdf`
   - Authoritative visual reference.
   - Supplies the palette, botanical motif, typography character, borders, rules, whitespace, and formal tone.
3. The supplied repository digest in `Pasted text(20260816-133317).txt`
   - Authoritative starting context for repository conventions.
   - The live repository remains authoritative if it differs from the digest.

Do not search for, merge, or infer wedding content from third-party wedding pages or similarly named couples. Do not invent missing information.

## Hard boundaries

- Build a static information page, not an RSVP system.
- No forms, authentication, database, API, service worker, analytics, tracking, cookies, embedded map, social widget, carousel, or countdown.
- No JavaScript is required for version 1. All core content must be present in the generated HTML.
- No remote fonts, stock imagery, CDN assets, or third-party CSS.
- Do not reproduce the PDF as page images. Translate its visual language into responsive CSS and original SVG ornamentation.
- Do not include the Order of Service readings, hymn lyrics, or ceremony programme in version 1; the Wedding Information Pack defines the public site content.
- Do not publish the unfinished `[Name] — [phone number]` wedding-day contact placeholder.
- Do not recreate the unexplained empty image/card placeholder from page 4 of the information pack.
- Do not hand-edit generated `wedding/index.html`.

## Repository rules and initial workflow

The supplied digest says the repository is Make-driven and uses a source/output pattern (`blogsrc/` to `blog/`). Follow that architecture.

Before editing:

1. Read the repository's current `Makefile` first.
2. Read the current `AGENTS.md`.
3. Run `make digest` as the sanctioned repository orientation step.
4. Inspect the actual repository for any existing `wedding/` or `weddingsrc/` files and preserve user-owned or unrelated content.
5. Keep all build, check, and preview entry points behind `make` targets.

Apply YAGNI, DRY, and KISS. Fail clearly on invalid input; do not hide errors behind fallback content. Preserve the existing blog and root site behaviour.

## Required deliverables

Mirror the existing source/output architecture:

```text
weddingsrc/
  manifest.json
  manifest.schema.json
  generate.py
  page.html
  static/
    wedding.css
    assets/
      botanical-frame.svg
      botanical-divider.svg
      flower-favicon.svg
      favicon-32.png
      apple-touch-icon.png
      social-preview.svg
      social-preview.png

wedding/
  index.html
  manifest.json
  wedding.css
  assets/
    botanical-frame.svg
    botanical-divider.svg
    flower-favicon.svg
    favicon-32.png
    apple-touch-icon.png
    social-preview.svg
    social-preview.png
```

Rules:

- `weddingsrc/manifest.json` is the only editable source for page structure and copy.
- `weddingsrc/manifest.schema.json` documents and validates the manifest contract.
- `weddingsrc/page.html` is only the outer document shell. Section HTML comes from explicit, escaped renderer functions in `generate.py`.
- `weddingsrc/static/` contains authored local CSS, SVG assets, and the PNG compatibility exports derived from those SVG sources.
- `wedding/` is the complete deployable output folder.
- Copy the validated source manifest to `wedding/manifest.json` so the deployable folder contains the requested JSON manifest. The page must not fetch it at runtime.
- Add a short generated-file comment near the top of `wedding/index.html`, naming `weddingsrc/manifest.json` and `make wedding` as the editing/build path.
- Do not add a package manager or dependency solely for this feature. Prefer Python's standard library.
- Do not recursively delete an existing `wedding/` directory. Stage every controlled output on the same filesystem, validate the complete staged set, and use `os.replace` for each known destination only after staging succeeds.
- Validation or generation failure must leave the last valid generated site intact. Per-file replacement is not a multi-file transaction; an installation I/O failure must stop immediately with a precise error and may require a safe rerun.

## Make integration

Add or adapt the smallest set of targets consistent with the current Makefile:

```text
make wedding
make wedding-check
make preview
```

Target contract:

- `make wedding`
  - Validate `weddingsrc/manifest.json`.
  - Generate semantic `wedding/index.html`.
  - Copy the public manifest, CSS, SVGs, and required PNG exports into their output paths.
  - Exit non-zero with a precise error when validation or generation fails.
- `make wedding-check`
  - Invoke an explicit `generate.py --check` mode for manifest, generated-HTML, local-link, image-dimension, SVG-safety, and deterministic-build checks. Do not add a second checker module unless the current repository architecture clearly calls for one.
  - Must not require internet access.
- The normal full-site build must include `wedding` without breaking or duplicating the existing blog build.
- `make preview` must build the current site and serve the repository root so `/wedding/` resolves locally.
- If a clean target is truly necessary, remove only the exact generated wedding files owned by this build. Never remove `weddingsrc/` or unknown files.

## Generator requirements

Use one small standard-library Python generator. It should:

1. Decode the manifest as UTF-8 JSON.
2. Validate it before writing anything.
3. Render every section in array order through an allowlisted renderer selected by `type`.
4. Escape every text value with `html.escape` or its equivalent.
5. Render links only after scheme/path validation.
6. Insert the rendered sections into the fixed page shell.
7. Write deterministic UTF-8 output with stable indentation and newlines.
8. Copy known static assets without transforming user content.
9. Atomically replace each known output only after the complete build succeeds.

Do not accept raw HTML or Markdown in the manifest. The initial content does not need rich-text parsing. If future content needs emphasis, add a small allowlisted segment model instead of admitting arbitrary HTML.

Supported section types for version 1:

| Type | Purpose | Required content |
| --- | --- | --- |
| `hero` | Couple, date, and primary venue | `eyebrow`, `title`, `date`, `venue` |
| `timeline` | Ordered schedule | `heading`, non-empty `items` |
| `venues` | Ceremony and reception addresses | `heading`, two or more `items`, `note` |
| `cards` | Short practical detail cards | `heading`, non-empty `items` |
| `callout` | Gift or photography content | `heading`, non-empty `body`; optional `eyebrow`, `link`, `tagline`, `variant` |
| `closing` | Final statement | `heading` |

An optional `navLabel` on any non-hero section adds it to the fragment navigation. Navigation order is derived from section order; do not maintain a second navigation list.

If a genuinely new layout is needed later, add a new explicit type to the schema, validator, renderer, CSS, and tests in the same change. Unknown types must fail rather than render generically.

Use JSON Schema Draft 2020-12 for `manifest.schema.json`, with `additionalProperties: false` on every closed object and explicit schemas for all nested arrays/items. The schema is documentation and editor support; the standard-library validation in `generate.py` is authoritative because Python's standard library does not execute JSON Schema. Do not add a JSON Schema package solely for this site.

## Manifest validation contract

Reject the build with a JSON-path-style error for any of these conditions:

- Unsupported or missing `schemaVersion`.
- Missing required top-level keys.
- Unknown keys where the schema marks an object closed.
- Empty required strings or arrays.
- A section without an ID, duplicate section IDs, or any duplicate ID in the final document.
- IDs outside `^[a-z][a-z0-9-]*$`.
- A manifest section using the shell-reserved ID `main-content`.
- Anything other than exactly one `hero` as the first section and exactly one `closing` as the last section. Intervening content sections may be reordered.
- Unknown section types.
- A `callout.variant` outside the version-1 allowlist `gift` or `photo`.
- Invalid or timezone-naive ISO date/time strings.
- A timeline item whose instant, normalised with `zoneinfo.ZoneInfo(event.timezone)`, falls outside the event's local calendar date.
- Timeline items that are not in chronological order, or a hero date that differs from `event.date`.
- A navigation label on a section without an ID.
- Raw HTML-like content in ordinary text fields.
- Any public link scheme other than `https` in version 1.
- An HTTPS URL without `//` and a non-empty host, or with credentials, control characters, or a protocol-relative form.
- `javascript:`, `data:`, `mailto:`, or `tel:` links. A future public contact requires an intentional schema/privacy change.
- Local asset paths that are absolute, contain `..`, or do not exist.
- Missing CSS, SVG, or PNG output assets.

Treat everything in the static output as public. The manifest must contain no secret or unpublished information.

## Seed manifest

Use this as the initial `weddingsrc/manifest.json`. Keep it valid JSON; do not add comments to the file.

```json
{
  "schemaVersion": 1,
  "site": {
    "language": "en-GB",
    "title": "Grace & James",
    "documentTitle": "Grace & James | 26 September 2026",
    "description": "Wedding day information for Grace and James, including timings, venues, travel and reception details.",
    "canonicalUrl": "https://www.jimgumbley.com/wedding/",
    "robots": "noindex,nofollow,noarchive",
    "themeColor": "#F8F4E8",
    "socialPreview": {
      "title": "Grace & James | 26 September 2026",
      "description": "Wedding information for Grace and James · Saturday, 26 September 2026",
      "imageUrl": "https://www.jimgumbley.com/wedding/assets/social-preview.png",
      "imageAlt": "Grace and James wedding information for 26 September 2026, framed with peach flowers and sage leaves",
      "imageType": "image/png",
      "imageWidth": 1200,
      "imageHeight": 630
    }
  },
  "event": {
    "date": "2026-09-26",
    "dateDisplay": "Saturday, 26 September 2026",
    "timezone": "Europe/London",
    "ceremonyVenue": "Great Malvern Priory"
  },
  "sections": [
    {
      "id": "welcome",
      "type": "hero",
      "eyebrow": "Wedding Information",
      "title": "Grace & James",
      "date": {
        "display": "Saturday, 26 September 2026",
        "datetime": "2026-09-26"
      },
      "venue": {
        "label": "Ceremony",
        "name": "Great Malvern Priory"
      }
    },
    {
      "id": "schedule",
      "type": "timeline",
      "navLabel": "Key timings",
      "heading": "Key timings",
      "items": [
        {
          "time": "11:15",
          "datetime": "2026-09-26T11:15:00+01:00",
          "text": "Guests arrive at Great Malvern Priory"
        },
        {
          "time": "11:40",
          "datetime": "2026-09-26T11:40:00+01:00",
          "text": "Guests to be seated"
        },
        {
          "time": "12:00",
          "datetime": "2026-09-26T12:00:00+01:00",
          "text": "Wedding ceremony begins"
        },
        {
          "time": "1:00",
          "datetime": "2026-09-26T13:00:00+01:00",
          "text": "Ceremony concludes"
        },
        {
          "time": "2:00",
          "datetime": "2026-09-26T14:00:00+01:00",
          "text": "Welcome drinks and canapés at the hall"
        },
        {
          "time": "3:00",
          "datetime": "2026-09-26T15:00:00+01:00",
          "text": "Reception and buffet begin"
        }
      ],
      "note": "Please make your way directly to the reception venue after the service."
    },
    {
      "id": "venues",
      "type": "venues",
      "navLabel": "Venues",
      "heading": "Venues & travel",
      "intro": "Addresses, directions and parking notes",
      "items": [
        {
          "label": "Ceremony",
          "name": "Great Malvern Priory",
          "addressLines": [
            "Church Street",
            "Malvern",
            "Worcestershire",
            "WR14 2AY"
          ],
          "timingNote": "Guests seated by 11:40 am"
        },
        {
          "label": "Reception",
          "name": "Leigh & Bransford Memorial Hall",
          "addressLines": [
            "Sherridge Road",
            "Leigh Sinton",
            "Worcestershire",
            "WR13 5DE"
          ],
          "timingNote": "Drinks from 2:00 pm"
        }
      ],
      "note": "Please allow time for travel and parking between venues. Guests should travel directly to the hall after the service."
    },
    {
      "id": "reception",
      "type": "cards",
      "navLabel": "Reception",
      "heading": "Reception details",
      "intro": "Food, seating, and practical notes",
      "items": [
        {
          "heading": "Food",
          "body": [
            "Welcome drinks and canapés will be served from 2:00 pm. A buffet meal will begin from 3:00 pm."
          ]
        },
        {
          "heading": "Seating",
          "body": [
            "Seating at the reception will be informal. Please choose any available table, except tables marked Reserved"
          ]
        },
        {
          "heading": "Children",
          "body": [
            "Children are warmly invited. Parents are kindly asked to supervise them throughout the day."
          ]
        }
      ]
    },
    {
      "id": "gifts",
      "type": "callout",
      "variant": "gift",
      "navLabel": "Gifts",
      "heading": "Gifts & final notes",
      "eyebrow": "Wedding gifts",
      "body": [
        "Your presence at our wedding is the greatest gift to us. For those who have kindly asked, we have created a wedding gift list."
      ],
      "link": {
        "label": "View our wedding gift list",
        "href": "https://www.weddingshop.com/buy/view/332579"
      }
    },
    {
      "id": "photo-guestbook",
      "type": "callout",
      "variant": "photo",
      "navLabel": "Photography",
      "heading": "Photography",
      "body": [
        "We would love you to help us capture the day through your eyes!",
        "During the reception, visit our Photo Guestbook table, take an instant photo of yourselves, or anything you would like for us to remember. Stick it into our wedding scrapbook and leave us a message, piece of advice or a memory.",
        "Funny, beautiful, unexpected — we want them all. 🤍"
      ],
      "tagline": "Snap it • Stick it • Sign it"
    },
    {
      "id": "closing",
      "type": "closing",
      "heading": "We cannot wait to celebrate with you."
    }
  ],
  "footer": {
    "text": "Grace & James · 26 September 2026"
  }
}
```

The timeline display values intentionally preserve the information pack's `11:15`, `11:40`, `12:00`, `1:00`, `2:00`, and `3:00` wording; the timezone-aware `datetime` values remove machine ambiguity. The photo guestbook paragraph above makes one minimal editorial repair to the source: it ends the broken phrase after `remember` and starts `Stick it into...` as a new sentence. The seating sentence deliberately retains the source's missing final full stop. Do not make further copy changes without a manifest edit.

## Known editorial omission

The information pack contains an unfinished wedding-day contact:

`[Name] — [phone number]`

Omit the entire contact section from the initial manifest and generated site. Do not render a blank card, placeholder, fake name, or fake number. When an approved public contact is supplied later, add it as an ordinary `cards` or `callout` section in the manifest and review the privacy implications before publishing.

## Page composition

Build one long, calm page in this order:

1. Skip link.
2. Hero with the complete floral frame, small `Wedding Information` eyebrow, `Grace & James` H1, date, and `Ceremony · Great Malvern Priory`.
3. Compact fragment navigation derived from `navLabel` values.
4. Key-timings timeline.
5. Venue and travel cards.
6. Reception detail cards.
7. Wedding gift callout and button-like link.
8. Photo Guestbook callout.
9. Closing statement.
10. Quiet footer line.

Use exactly one H1. Every later section receives an H2; card headings are H3. The page must remain useful and correctly ordered with CSS disabled.

## Visual direction from the Order of Service

The reference is an A5 portrait booklet with a restrained, formal garden character:

- Warm ivory paper rather than stark white.
- Fine antique-gold rectangular rules and centred divider lines.
- Peach, cream, coral, and burnt-orange roses.
- Muted eucalyptus/sage foliage.
- Floral weight concentrated in corners and along edges, leaving generous central whitespace.
- Centred, symmetrical display typography with small-cap labels and generous letter spacing.
- Garamond-led serif copy with occasional restrained italic/script moments.
- Dark warm brown instead of pure black.
- Minimal depth: borders and spacing do the work, not heavy shadows.

The embedded booklet fonts identify the intended character: Copperplate Gothic for formal small-cap display, Garamond and Garamond Italic for most copy, Didact Gothic for restrained sans-serif labels, and Alex Brush for the closing script treatment. Do not ship or extract those embedded fonts. Use the local/system stacks below unless an already licensed, redistributable local webfont exists in the repository.

### CSS colour tokens

Start with these colours sampled from the Order of Service. Keep the gold shades decorative where they do not meet body-text contrast.

```css
:root {
  --colour-paper: #f8f4e8;
  --colour-paper-deep: #f2ecdd;
  --colour-ink: #5c3a1d;
  --colour-body: #795637;
  --colour-accent: #c3874a;
  --colour-gold: #c49e48;
  --colour-gold-light: #d3bb7b;
  --colour-peach: #e99c64;
  --colour-blush: #f6b58c;
  --colour-coral: #db6126;
  --colour-rust: #b6532b;
  --colour-control: #a94d27;
  --colour-sage: #a9ac90;
  --colour-sage-pale: #bcc2a8;
  --colour-leaf: #676e53;

  --font-display: Garamond, "EB Garamond", "Cormorant Garamond", Georgia, serif;
  --font-body: Garamond, "EB Garamond", Georgia, "Times New Roman", serif;
  --font-label: Copperplate, "Copperplate Gothic Light", "Avenir Next", "Trebuchet MS", sans-serif;

  --content-width: 72rem;
  --copy-measure: 66ch;
  --rule: 1px solid var(--colour-gold);
  --small-radius: 0.5rem;
  --frame-inset: clamp(0.65rem, 2vw, 1.5rem);
  --frame-clearance-block: clamp(5.5rem, 11vw, 8.5rem);
  --frame-clearance-inline: clamp(3.25rem, 7vw, 6rem);
}
```

Usage:

- Page background: `--colour-paper`, with an extremely subtle CSS-only radial wash using `--colour-paper-deep` if desired.
- Main copy: `--colour-body`; headings and high-emphasis copy: `--colour-ink`.
- Lines, frames, and tiny decorative details: `--colour-gold` and `--colour-gold-light`.
- Links, filled time badges, and visible focus accents: `--colour-control` or `--colour-ink`. Keep `--colour-rust` decorative because it sits too close to the 4.5:1 boundary on ivory.
- Leaves: `--colour-sage`, `--colour-sage-pale`, and `--colour-leaf`.
- Flowers: `--colour-peach`, `--colour-blush`, `--colour-coral`, and `--colour-rust`.
- The source copper `--colour-accent` and the golds are decorative/large-type colours; do not use them for essential small text.
- Never use gold for ordinary small text on the ivory background.

### Typography

- H1: display serif, centred, regular weight, approximately `clamp(2.75rem, 8vw, 5.75rem)`, tight but not compressed line height.
- H2: display serif, centred or aligned to the section composition, approximately `clamp(2rem, 5vw, 3.25rem)`.
- Body: minimum `1rem`, preferably `1.0625rem` to `1.125rem`, line-height around `1.65`.
- Labels: small caps or uppercase, `0.72rem` to `0.82rem`, generous `0.12em` to `0.18em` tracking.
- Use italic Garamond for the final statement if a licensed script webfont is not already available. Do not rely on generic cursive for essential copy.
- Keep paragraph measure at or below `66ch`.
- Do not use script type for navigation, addresses, schedule entries, or body copy.
- A Georgia serif fallback plus carefully tracked uppercase labels is explicitly acceptable on devices that do not have Garamond or Copperplate. Consistent hierarchy, spacing, colour, and readability matter more than forcing an unlicensed font.

### Layout and responsive behaviour

- Use a centred content wrapper no wider than `72rem`.
- The stylesheet and `botanical-frame.svg` must visibly produce the complete booklet treatment: a thin gold rectangular border plus flowers and foliage in all four corners. This is a required page feature, not an optional embellishment.
- Use the complete framed treatment on the hero and closing panel. Repeat a lighter framed treatment around major content groups only when it remains calm and readable.
- The SVG draws the frame line beneath the corner flowers so blooms naturally interrupt and overlap the gold rule, as in the booklet.
- CSS must reserve enough edge clearance that the border and corner flowers never cover text. Keep the frame decorative with `pointer-events: none` and place real content above it in the stacking order.
- Use thin gold rules and ample vertical rhythm to separate sections.
- Timeline times may use compact terracotta pills with ivory text; the event text remains plain HTML beside them.
- Venue and reception cards use fine gold borders, warm-paper fills, little or no box shadow, and modest corner rounding.
- At laptop widths, keep the framed page centred with comfortable outer margins. Use two columns for venue cards and up to three columns for reception details; do not stretch prose across the entire display.
- At narrow viewports, use one column and keep the reading order identical to the manifest. Navigation may wrap into two or more centred rows.
- Use responsive layout, not device detection. Treat approximately `45rem`/`720px` as the main single-column transition, adjusting only when the content needs it.
- At 320 CSS pixels, there must be no horizontal scrolling, clipped border, or text overlaid by flowers.
- On phones, keep the full border visible but make the four corner clusters smaller and less dense. Crop only the outermost decorative leaves when unavoidable; do not remove all corner flowers.
- Account for modern phone safe areas with `env(safe-area-inset-*)` and use `svh`/`dvh` carefully rather than relying only on legacy `100vh`.
- Links and navigation must work with touch and must not depend on hover. Navigation and button-like links must have a minimum 44 by 44 CSS-pixel hit area. Ordinary inline prose links are exempt from the box size but must be underlined or otherwise distinguished by more than colour. All links need a visible focus outline.
- Do not create a full-bleed photo hero. The visual identity comes from typography, whitespace, rules, and botanical SVG.
- Avoid automatic animation. Hover/focus state changes may be immediate or very short. Respect `prefers-reduced-motion` even if a transition is used.

Use an implementation equivalent to this relationship so the border and corner flowers are owned by CSS/SVG rather than content markup:

```css
.ornate-panel {
  position: relative;
  isolation: isolate;
  padding-block: var(--frame-clearance-block);
  padding-inline: var(--frame-clearance-inline);
}

.ornate-panel::before {
  content: "";
  position: absolute;
  inset: var(--frame-inset);
  z-index: 0;
  pointer-events: none;
  border: 1px solid var(--colour-gold); /* fallback beneath the SVG */
  background: url("./assets/botanical-frame.svg") center / 100% 100% no-repeat;
}

.ornate-panel > * {
  position: relative;
  z-index: 1;
}

@media (max-width: 45rem) {
  :root {
    --frame-clearance-block: 5rem;
    --frame-clearance-inline: max(3.25rem, 16vw);
  }
}
```

The exact selectors may follow the repository style, but the behaviour is mandatory. The SVG itself contains the frame and flowers; the CSS sizes it, provides clearance, and preserves the panel's content layer. Combine the inline padding with the relevant left/right safe-area inset when it is larger.

### Phone and laptop target layouts

Verify responsive composition rather than targeting specific user agents:

- Phones: 320, 360, 375, 390, 412, and 430 CSS pixels wide in portrait, plus short-landscape checks at 667 x 320 and 844 x 390. These cover common modern iPhone and Android layouts without using device detection.
- Tablets/small laptops: 768 and 1024 CSS pixels wide.
- Laptops: 1280 x 720, 1366 x 768, and 1440 x 900 CSS pixels.
- Large desktop: 1920 x 1080 as a max-width check, not as a reason to enlarge the text measure.

On a laptop, the hero should feel like a centred digital booklet cover, the complete border and all four floral corners should read clearly, and the main information should use the available width without becoming sparse. On a phone, it should feel like the same design recomposed vertically rather than a scaled-down desktop page.

### Avoid generic wedding-template styling

Do not introduce:

- Stark white cards on a grey background.
- Pure black text.
- Purple/pink gradients.
- Large drop shadows or glassmorphism.
- Oversized stock photography.
- Gold body text.
- Excessive script lettering.
- A generic SaaS-style card grid.
- Decorative density that competes with the information.

## SVG asset requirements

Author four original SVG sources inspired by the booklet rather than tracing or embedding a PDF page, plus compatibility PNG exports where specified:

### `botanical-frame.svg`

- Contains the complete thin rectangular gold border and all four floral corner compositions in one coordinated asset.
- Each corner has a distinct, naturally asymmetric composition of peach/coral rose forms, buds, sprigs, and sage leaves. Do not make the four corners obvious mirrors or identical copies.
- Draw the gold frame first and place the flowers above it so the botanical clusters interrupt the rule.
- Use a muted gold line around `#c49e48` with a restrained `#d3bb7b` highlight; use `vector-effect="non-scaling-stroke"` where appropriate.
- May use a small number of local SVG gradients for a soft painted feel.
- Layer a few semi-transparent petal/leaf shapes to evoke watercolour without a large filter stack.
- Use a deliberate nested-viewport strategy: the outer SVG may use `preserveAspectRatio="none"` so the rectangular rule fits the panel, while each corner lives in its own nested, approximately square `<svg>` viewport with an appropriate `preserveAspectRatio` alignment. The frame may stretch; flower heads and leaves must not.
- Visually test the asset on both the tallest phone panel and the widest laptop panel. Reject stretched/oval flowers, letterboxed rules, detached corners, or inconsistent line weight.
- The stylesheet supplies a plain gold `border` fallback for forced-colour or failed-image conditions; the normal design uses the SVG border and flowers together.

### `botanical-divider.svg`

- A restrained horizontal gold rule with a small central leaf/flower detail.
- Must scale cleanly without raster content.

### `flower-favicon.svg`

- A legible single flower mark: one coral/peach bloom with one or two dark-sage leaves.
- Square `viewBox`, transparent outer canvas, no lettering, and recognisable at 16 and 32 CSS pixels.
- Reference it as the primary SVG favicon.
- Export a `favicon-32.png` fallback and an `apple-touch-icon.png` at 180 x 180. Give the Apple touch icon an ivory background so the flower reads cleanly on iOS home screens.

### `social-preview.svg`

- A 1200 x 630 master for link previews, using the same ivory paper, complete gold frame, and four floral corners.
- Keep `Grace & James` and `Saturday, 26 September 2026` large and centred within a generous safe area. Do not imply that both venues are the Priory.
- Avoid small copy near the edges because WhatsApp crops previews differently across devices.
- Export an optimised, opaque `social-preview.png` at exactly 1200 x 630. Open Graph/WhatsApp must reference the PNG, not the SVG, because SVG social preview support is unreliable.
- This preview master and its PNG export are an explicit derived-asset exception to the manifest-only/no-SVG-text rule. The visible names/date must match `site.socialPreview` when authored. Treat the manifest as canonical; whenever those fields change, update and re-export both preview files in the same reviewed change.
- Do not add a runtime or production dependency solely to regenerate this image. It is acceptable to commit the reviewed SVG master and PNG export as static assets; the ordinary `make wedding` build copies them deterministically.

For all SVG sources:

- Set an explicit `viewBox`. The frame, divider, and favicon omit fixed text; only the explicitly approved social-preview master may contain its reviewed names/date text.
- No scripts, animation, embedded raster images, event attributes, `foreignObject`, remote references, tracking metadata, or external stylesheets.
- Essential page wording remains HTML. The social-preview exception is metadata artwork, not a substitute for HTML content.
- When included as decoration, expose no accessible name and use `aria-hidden="true"` or an empty `alt`, as appropriate to the embedding method.
- Keep ornamental SVG out of the keyboard/focus order.

## HTML document requirements

Generate a complete HTML5 document containing:

- `<!doctype html>`.
- The generated-file comment immediately after the doctype, never before it.
- `<html lang="en-GB">`.
- UTF-8 charset and `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
- Manifest-driven `<title>`, description, canonical URL, robots policy, and theme colour.
- A restrictive referrer policy such as `no-referrer`.
- A local stylesheet reference such as `./wedding.css`.
- SVG favicon, PNG favicon fallback, and 180 x 180 Apple touch icon links.
- A skip link targeting `<main id="main-content" tabindex="-1">` so keyboard focus moves reliably to the main content.
- Semantic `header`, labelled `nav`, `main`, `section`, and `footer` landmarks.
- Real `<time datetime="...">` elements for the date and each schedule time.
- Real `<address>` elements for venue addresses.
- An ordinary HTTPS link for the gift list; no embedded iframe.
- No inline event handlers, runtime manifest fetch, loading state, or client-side template.

Use only relative local asset URLs such as `./wedding.css` and `./assets/botanical-frame.svg`. Do not use root-relative `/assets/...` paths and do not add a `<base>` element. The site must work when served from `/wedding/` and when previewed from the repository root.

The canonical URL includes the trailing slash. Confirm the deployed directory-index behaviour makes a request to `/wedding` resolve or redirect cleanly to `/wedding/`; do not add client-side routing for this.

If a CSP is supplied in a meta tag, keep it compatible with the no-JavaScript, local-asset design. A suitable starting policy is:

```text
default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'
```

Do not claim `frame-ancestors` protection from a meta-delivered CSP; that directive requires an HTTP response header.

## WhatsApp and link-preview metadata

WhatsApp reads server-delivered Open Graph markup; it does not wait for JavaScript. Generate these tags directly in the initial `<head>`. Map `og:url` from `site.canonicalUrl`, `og:site_name` from `site.title`, `og:locale` from `site.language` (`en-GB` to `en_GB`), and the title, description, image, type, dimensions, and alt text from `site.socialPreview`:

```html
<meta property="og:type" content="website">
<meta property="og:locale" content="en_GB">
<meta property="og:site_name" content="Grace &amp; James">
<meta property="og:title" content="Grace &amp; James | 26 September 2026">
<meta property="og:description" content="Wedding information for Grace and James · Saturday, 26 September 2026">
<meta property="og:url" content="https://www.jimgumbley.com/wedding/">
<meta property="og:image" content="https://www.jimgumbley.com/wedding/assets/social-preview.png">
<meta property="og:image:secure_url" content="https://www.jimgumbley.com/wedding/assets/social-preview.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Grace and James wedding information for 26 September 2026, framed with peach flowers and sage leaves">
<meta name="twitter:card" content="summary_large_image">
```

Requirements:

- Open Graph `og:url` and image URLs are absolute HTTPS URLs; ordinary page assets remain relative.
- `social-preview.png` is 1200 x 630, optimised, opaque, and directly retrievable with an `image/png` content type.
- Keep the preview PNG comfortably lightweight, targeting no more than 500 KiB.
- The preview has large readable names/date, the gold border, and visible flowers in all four corners. It must still read well when WhatsApp presents a small crop.
- Do not use the SVG master as `og:image`.
- Do not depend on JavaScript, a redirect chain, authentication, cookies, or browser-only headers for the preview.
- Keep the title concise and the description factual. Do not include the registry URL or a future phone number in preview metadata.

`make wedding-check` performs offline checks only: unique/exact head metadata, absolute HTTPS Open Graph URLs, PNG signature, dimensions, opacity, and file-size limit. After deployment, separately verify that the canonical page returns `200` with `text/html`, the exact preview URL returns `200` with `image/png`, neither requires authentication or a redirect chain, and no deployed `robots.txt` rule blocks `/wedding/` or its preview image. The `noindex` meta policy may remain.

Include favicon markup in the initial `<head>`:

```html
<link rel="icon" href="./assets/flower-favicon.svg" type="image/svg+xml">
<link rel="icon" href="./assets/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="./assets/apple-touch-icon.png" sizes="180x180">
```

The flower must be recognisable in browser tabs/bookmarks on laptops and modern Android browsers. The separate Apple touch icon must remain clear when an iPhone user saves the page to the home screen. A web-app manifest or installable PWA is not required.

## Accessibility requirements

Target WCAG 2.2 AA behaviour:

- Normal text contrast at least 4.5:1.
- Large text and meaningful graphical elements at least 3:1.
- Visible keyboard focus with more than colour alone.
- Logical tab order and no keyboard trap.
- A working skip link.
- One H1 and a correct heading hierarchy.
- No information conveyed solely by colour, position, or ornament.
- Decorative SVG ignored by assistive technology.
- Links named by purpose, not raw URL alone.
- Touch targets with comfortable spacing.
- Reflow without horizontal scrolling at 320 CSS pixels.
- Usable at 200% zoom.
- Sensible print output containing the date, schedule, venue addresses, travel note, and external link text.
- Reading order remains correct with CSS and JavaScript unavailable.
- Reduced-motion preference is respected.

## Privacy and publication policy

The page is a public static resource even when excluded from search indexes.

- Default to `noindex,nofollow,noarchive`, as shown in the manifest. This does not provide access control.
- Do not include the unfinished contact placeholder.
- Do not add phone numbers, email addresses, home addresses, payment details, private RSVP data, or other guest-only information unless the owner deliberately approves it for public publication.
- No trackers, cookies, analytics, remote fonts, social widgets, or map embeds.
- The gift list is an ordinary external link only. Venue addresses come from the supplied information pack; do not invent additional directions or map links.
- Do not put anything in the public manifest that is not also appropriate to expose in the HTML.
- External links do not need forced new tabs. If `target="_blank"` is used, add `rel="noopener noreferrer"`.

## Print styling

Include a small `@media print` layer:

- Hide navigation and purely decorative large ornaments.
- Use dark text on a light background without wasting ink.
- Keep each venue card and practical detail together where possible.
- Show useful external URLs after link labels if the printed page would otherwise lose them.
- Avoid splitting individual schedule entries across pages.
- Retain the couple, date, timings, addresses, travel note, reception details, and gift-list address.

## Checks to implement behind `make wedding-check`

At minimum, check:

1. Manifest JSON parses as UTF-8.
2. Manifest conforms to the documented `manifest.schema.json` contract as enforced by the authoritative standard-library validator.
3. All section/document IDs are valid and globally unique; reserved shell IDs do not collide.
4. All HTTPS links have valid hosts and all local asset paths are safe.
5. Every local referenced file exists in the output.
6. Every section is rendered in manifest order.
7. Generated HTML has one H1, a `<main>` target, and no unresolved template markers.
8. All fragment links resolve to unique IDs.
9. Every resource-bearing HTML attribute and every CSS `url()`/`@import` resolves beneath `/wedding/`; none is root-relative, contains `..`, or escapes the output folder.
10. The HTML contains no unfinished bracketed placeholder, especially the contact placeholder.
11. The output contains no remote font, script, iframe, analytics, or tracking reference.
12. XML-aware SVG checks allow the SVG namespace and local fragment references but reject `script`, `foreignObject`, `image`, event attributes, external/data `href`, CSS imports, and external `url()` values.
13. The HTML links the SVG flower favicon, 32 px PNG fallback, and Apple touch icon, and all three files exist.
14. Required Open Graph tags are present in the initial HTML with absolute HTTPS canonical/image URLs and the declared 1200 x 630 PNG dimensions.
15. `social-preview.png` is an opaque 1200 x 630 PNG no larger than 500 KiB; `favicon-32.png` is 32 x 32; `apple-touch-icon.png` is opaque and 180 x 180; the SVG favicon has a square `viewBox`.
16. `wedding/manifest.json` is byte-for-byte identical to the validated source manifest.
17. Running the unchanged build twice produces byte-identical controlled output.
18. A deliberately invalid manifest makes the check fail non-zero with a useful field path, without replacing the last valid site.
19. The generated HTML does not link `wedding/manifest.json` as `rel="manifest"`; it is a content manifest, not a Web App Manifest.
20. The repository's existing `make html` build succeeds before and after the wedding change, and the existing preview target still serves the root site and `/wedding/`.

Use temporary test inputs; never mutate the real manifest during a negative test.

## Visual verification

Review the built page through the repository preview at approximately:

- 320 CSS px wide.
- 360, 375, 390, 412, and 430 CSS px phone widths.
- 667 x 320 and 844 x 390 short phone-landscape viewports.
- 768 CSS px wide.
- 1280 x 720, 1366 x 768, and 1440 x 900 laptop viewports.
- 1920 x 1080 as a max-width check.
- 200% browser zoom.
- Print preview.
- Reduced-motion mode.

The page passes visual review when all of these are true:

- It is immediately recognisable as a digital companion to the Order of Service.
- The ivory, antique-gold, peach/coral, sage, and warm-brown palette is evident.
- A complete thin gold border and four distinct floral corner clusters visibly frame the hero and closing panel without obscuring content.
- Garamond-like typography, thin rules, small-cap labels, and whitespace create the formal tone.
- Schedule and venue information is faster to scan than it was in the PDF.
- There is no clipping, overlap, tiny copy, unreadable contrast, or horizontal scroll.
- The mobile version feels composed, not merely compressed.
- The laptop version uses space elegantly without long text lines or an undersized central column.
- The flower favicon is legible in a browser tab, and the 1200 x 630 preview remains readable at small preview size.
- No third-party network request occurs during initial page load.

For every tested viewport, assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. Below the content breakpoint, assert one-column source order. At laptop widths, assert the intended two-column venue and three-column reception layouts. Use manual visual review, not a brittle geometry script, to confirm that text does not overlap the frame or flowers.

## Acceptance criteria

The implementation is complete only when:

1. `make wedding` succeeds from the repository root and creates the full deployable `wedding/` output.
2. `make wedding-check` succeeds without network access.
3. `/wedding/` loads when the repository root is served by `make preview`.
4. The page works with JavaScript disabled because it requires no JavaScript.
5. Changing copy or reordering the intervening content sections in `weddingsrc/manifest.json` and rebuilding changes the generated HTML accordingly; the required hero remains first and closing remains last.
6. Generated HTML is never the editable source of truth.
7. All factual public copy matches the seed manifest and therefore the Wedding Information Pack.
8. The unfinished wedding-day contact is absent.
9. CSS and the original `botanical-frame.svg`, not a rasterised PDF, create the complete gold border and four floral corners.
10. All local URLs work beneath `/wedding/`.
11. The generated output is deterministic, and validation/generation failure preserves the last valid version.
12. Existing root-site and blog generation still work.
13. The layout passes the listed iPhone/Android-style phone widths, short landscape view, tablet widths, and common laptop viewports.
14. WhatsApp-compatible Open Graph metadata and the 1200 x 630 PNG preview are present in the initial HTML.
15. The flower SVG favicon, PNG fallback, and Apple touch icon are present and linked.
16. Accessibility, privacy, mobile, laptop, print, and visual checks above pass.
17. The controlled output contains no unapproved personal information or external runtime dependency.

## Definition of done

Deliver the source manifest, schema, generator, shell template, CSS, original SVG frame/divider/favicon/social-preview sources, PNG compatibility exports, generated `/wedding/` folder, Make integration, and checks. The result should feel like the Order of Service translated into a calm, responsive guest guide: warm ivory paper, a complete fine-gold frame, four peach-and-sage floral corners, formal serif typography, generous whitespace, precise practical information, excellent phone/laptop presentation, and a polished WhatsApp link preview.
