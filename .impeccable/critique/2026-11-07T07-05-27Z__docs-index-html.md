---
target: docs/index.html
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 2
target_identity: "file:/home/claude/winsta/docs/index.html"
target_fingerprint: "sha256:2a037fbc7551f841a5388f5681751c8e42d6a699c004fde9e63200a5693656bc"
target_path: /home/claude/winsta/docs/index.html
timestamp: 2026-11-07T07-05-27Z
slug: docs-index-html
---
⚠️ DEGRADED: single-context (subagents were not explicitly requested by the user; Assessment A was completed before detector output was read)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live stats have loading and fallback states; the download button gives no hint of file type or size before click (the size only appears in the meta line). |
| 2 | Match System / Real World | 2 | winget, MSI, SHA-256, manifest, AppData appear without explanation for a general Windows user. |
| 3 | User Control and Freedom | 3 | Language and theme toggles persist; tabs keyboard-navigable. |
| 4 | Consistency and Standards | 3 | "Support on Saweria" is never translated; the hero tool labels switch between ID/EN codes. |
| 5 | Error Prevention | 2 | The SmartScreen warning and the winget requirement live 4 screens below the download button. |
| 6 | Recognition Rather Than Recall | 3 | Four of five features are hidden behind tabs on a persuasion page. |
| 7 | Flexibility and Efficiency | n/a | Landing page (Persuade). |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and tidy, but the hero headline dominates and the brand blue is almost absent. |
| 9 | Error Recovery | 3 | Stats fall back to "See on GitHub"; nothing guides a user whose download is blocked. |
| 10 | Help and Documentation | n/a | Landing page (Persuade); FAQ exists. |
| **Total** | | **22/32** | **Good (69%, borderline Acceptable)** |

## Design Specificity Verdict

**LLM assessment**: Content is specific (real Winsta captures, D:\Apps in the hero, real live numbers), but the visual system is category-interchangeable: Geist on near-white, ink pill buttons, floating pill nav, left-text/right-screenshot hero, stat row, tab switcher. Swap the screenshots and this is any 2025 developer-tool page. The brand blue from the Winsta icon appears only in focus rings and link hovers, so the page does not look like Winsta's own app.

**Deterministic scan**: Static scan: 1 finding, `flat-type-hierarchy` (false positive: sizes come from tokens in an imported stylesheet the static engine does not resolve). Rendered scan (localhost): `oversized-h1` (80px, 40 characters, 32% of the viewport, three lines) and `overused-font` (Geist is 100% of text). Both agree with the review.

## Priority Issues

1. **[P1] Download anxiety is unhandled at the moment of download** — SmartScreen "Windows protected your PC" and the winget requirement are only in the Install section. Fix: one reassurance line under the download button (free, open source, SmartScreen note with a link to #install), and show file type and size on or beside the button. Command: /impeccable clarify.
2. **[P1] The hero headline overpowers the product** — 80px over three lines (32vh) pushes the D:\Apps capture into a supporting role and makes the first screen read as typography, not product. Fix: step the h1 down to about 60px on two lines, enlarge the capture. Command: /impeccable typeset, /impeccable layout.
3. **[P2] Brand blue is missing; the page looks generic** — Winsta's own blue (icon, app accent) is under 1% of the page. Fix: use the brand blue for the primary action and active tab, a blue-tinted band, and the stat figures; keep ink for text. Command: /impeccable colorize.
4. **[P2] Features hidden in tabs, screenshots unreadable** — on a Persuade page four of five feature proofs need a click, and full-window captures shrink to ~780px where their text is illegible. Fix: crop captures to the relevant region and show at least the first two features without a click (or show all five as scrollable rows with crops). Command: /impeccable layout.
5. **[P2] Jargon for general users** — winget, MSI, SHA-256, manifest, AppData. Fix: plain-language first, the term second ("checks the file's fingerprint (SHA-256)"). Command: /impeccable clarify.

## Persona Red Flags

**Jordan (First-Timer)**: Clicks "Download for Windows", gets an .msi with no warning, then a red SmartScreen screen; the explanation is four screens down the page. "winget install … Coming soon" next to the button invites copying a command that does not work yet.

**Riley (Stress Tester)**: Tiny live numbers (single or double digits) set at display size read as low traction; with JS off the figures show "…" placeholders.

**Casey (Mobile)**: Full-window screenshots in tabs are unreadable at 390px; the hero h1 fills the first screen and pushes the product below the fold.

## Minor Observations

- "Support on Saweria" is not localized.
- Light screenshots glare on the dark theme.
- The close section repeats the discover screenshot already used as og:image; a cropped update banner would add a new fact.
- Footer sign-off "Savoreux, 2026" is good; nav tool label "ID" means "switch to Indonesian" but reads like a state.

## Questions to Consider

- What if the hero showed the before/after of C: vs D: free space instead of a form?
- Does a first-time user need to see the winget command at all before it exists?
- What would this page look like if it used Winsta's own app UI style (its blue, its cards) as the brand?
