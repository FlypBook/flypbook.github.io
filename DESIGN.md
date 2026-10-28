# FlypBook design: "Pocket Paperback"

FlypBook should feel like a shelf of cheap, brilliant paperbacks, not like a tech product.
Every screen is either **the story** (dark, full-bleed, the words are the hero) or **a page** (cream paper, ink).

## What we studied, and what we took
- **Apple Music lyrics:** the words *are* the interface. Unread words dim, read words full, one active word.
  No outlines, no meme text. Big, heavy, tight type.
- **Old paperback covers (the tri-band cover):** a flat band of printed ink color per genre, a title in a serif.
  Color carries meaning (genre), never decoration. Our story intro is a little paperback cover.
- **Letterboxd / Spotify / Duolingo:** one owned color, used flat and confidently. Saturated, not glowing.
- **Are.na / Teenage Engineering:** plain words over icons where possible, honest copy, no ornaments.
- **Partiful / Wattpad:** a voice. Short, human labels ("Write", "Fresh"), sentence case.
- **Things / Arc:** generous spacing, few lines, soft controls that look physical (segmented "switches").

## Things we never do (the "AI look")
- Purple-to-blue gradients, glows, glassy blur panels, neon outlines.
- Tailwind's default violet/indigo (#8b5cf6, #6366f1). Our purple is our own: **Grape #5B2FB3**, **Lilac #BBA6F2**.
- Tiny uppercase labels with wide letter spacing everywhere. Labels are sentence case.
- The same big radius on everything; a colored stripe on one side of a rounded card; pulsing "live" dots.
- Inter / Fraunces / Space Grotesk defaults. We use **Archivo** (one family, many widths) and **Young Serif**.
- Emoji in the interface, decorative icons that mean nothing.

## Tokens
| Token | Value | Use |
|---|---|---|
| Night | #111013 | story background, dock |
| Paper | #F4EEE3 | sheets ("pages") |
| Paper deep | #E9E1D2 | fields, inactive switches |
| Rule | #D9CFBF | hairlines on paper |
| Ink | #18151B | text on paper, primary buttons |
| Faded ink | #6B6259 | secondary text on paper |
| Grape | #5B2FB3 | brand fill (Write button, selected) |
| Lilac | #BBA6F2 | brand on dark (active tab, links) |
| Tomato | #F0532E | likes, unread, errors-that-matter |
| Butter | #F5D35C | the read-along highlight default |

Genre inks (the band on each cover) live in `web/app.js` (`GENRE_INK`).

**Type:** Young Serif for the literary voice (wordmark, story titles, sheet titles, page numbers, quiz
questions). Archivo for everything else: 600-800 for UI, condensed (wdth 75) black for punchy labels.
**Radius scale:** 6 (chips, fields), 12 (buttons, cards), 18 (sheet top), round (avatars, the Write button).
**Motion:** quick and physical: 180-320ms, ease-out `cubic-bezier(.2,.9,.25,1)`. The intro cover turns like a page.

## Light and dark (Settings > Appearance: Auto / Light / Dark)
Stories always play on night (they sit on video). The theme changes the *pages* (sheets), the dock and the
launch screen: light = cream paper and ink, dark = #1C1A20 paper and cream ink. All of it runs on the tokens in
`:root` / `:root[data-theme="dark"]` in `web/styles.css`; never hard-code a light-only color in a sheet.
Things that are printed objects (the story cover, the genre bands, butter labels) use the fixed `--cover-*`
colors so they look the same in both themes. A tiny script in `index.html` sets the theme before first paint.

## Launch screen
A small grape-bound book riffles three pages (the "flyp"), the wordmark is revealed left to right, then the
tagline and status fade up. Leaving, the book zooms toward you and the screen fades into the feed.
