# Ultimate Tester design

The look of the Ultimate Tester Mac app, decided one question at a time. This file is the source for a design skill later, so every entry says what was chosen and why.

Status: all 11 questions locked on 2026-11-18.

## 1. Colour (locked)

One colour: black on white.

- Page `#ffffff`, primary `#000000`.
- Everything else is grey: secondary text `#666666`, lines `#eeeeee`, selected row `#f5f5f5`, code background `#f3f3f3`.
- Status colour is the one exception, and it lives only in status icons: passed `#1f8a4c` (outline tick), broke `#d1342f` (filled ✕), couldn't run `#999999` (dashed circle). No "passed" / "broke" words beside them; the icon shape and colour carry it, and each icon has an accessible label. Never colour text, rows, backgrounds or buttons by status.
- Screenshots of the app under test are the only colourful thing on screen, so the evidence stands out.

- **Dark (the default):** the same system inverted. Page `#0b0b0b`, surfaces `#151515`, selected row `#1f1f1f`, lines `#242424`, text `#f5f5f5`, secondary `#a3a3a3`; the strong colour is white (`#f5f5f5` buttons with black text). Status icons brighten to passed `#3fbf72`, broke `#f0605b`. Lifted things get a faint white ring instead of a grey shadow. Appearance is Dark, Light or Same as Mac in Settings, and a sun/moon button in the title bar switches dark and light in one click.

Rejected: tinted palettes (paper and yellow, dark Tess green, graphite and blue, clay and sage).

## 2. Typography (locked)

Newsreader for titles, Geist for everything else. No monospace anywhere.

| Use | Font | Size / weight |
| --- | --- | --- |
| Title | Newsreader | 34 semibold |
| Section heading | Newsreader | 20 semibold |
| Body | Geist | 15 regular |
| Row | Geist | 14 medium |
| Meta | Geist | 12.5, grey |

- Commit hashes and code names are Geist; code names get the `#f3f3f3` chip.
- Numbers use tabular figures.

## 3. Layout (locked)

Test screen is a split:

- Header across the top: status pill and meta, title, Tess's summary, Test again and Copy report on the right.
- Below: checks on the left (about 400px, grouped "From the change" and "Must never break"); the selected check's screenshot large on the right with "What Tess saw" under it.
- Test history is behind a History button in the title bar, not a permanent sidebar.

## 4. Shape (locked)

Round, matching the landing page's black pills.

- Buttons, text fields and status pills are full pills (`border-radius: 999px`).
- List rows 10px; cards and screenshots 16px; sheets and dialogs 18px.
- Borders are 1px `#d6d6d6` on secondary buttons and fields.
- The keyboard focus ring (2px black, 2px away) follows the shape of what it surrounds: round on pills, 10px on rows. Every clickable row carries its own radius, not only its container, so the ring never shows a square corner.
- Shadows only on things that sit above the page (screenshots, sheets, menus): `0 0 0 1px rgb(0 0 0/.06), 0 12px 32px rgb(0 0 0/.10)`; sheets a little deeper. Nothing else casts a shadow.

Rejected: sharp 4px, soft 8/12px, square print style.

## 5. Spacing and density (locked)

Comfortable: room to read, and a test's checks still fit beside the evidence.

- Spacing steps: 4, 8, 12, 16, 20, 28, 40. Space between groups is at least twice the space inside a group.
- List rows about 40px (10px vertical padding, 14px text). Buttons 32px tall.
- **8px between rows** in every content list (checks, history, Home), so filled rows (selected, hover) never touch. Menus are the exception: 2px between items.
- Panel padding 28px. Group label to first row 4px; group to group 20px (more than twice the row gap).
- Title 28px when it shares the header with actions; 34px on its own.

Rejected: compact (28px rows, cramped beside the serif title), airy (52px rows, long tests scroll).

## 6. Icons (locked)

Phosphor. Its round stroke ends match the pills and the serif.

- Regular weight by default; fill only for a state that needs weight.
- Passed `check-circle` (regular, green), broke `x-circle` (fill, red), couldn't run `circle-dashed` (regular, grey). These three are the only coloured icons.
- Others: home `house`, new `plus`, test again `arrow-clockwise`, copy `copy`, history `clock-counter-clockwise`, settings `gear-six`, URL `globe-simple`, screenshot `image`, delete `trash`, search `magnifying-glass`, live `eye`.
- 16px in buttons, 17px in rows, 22px alone. Colour from `currentColor`.

Rejected: Lucide, Heroicons, Tabler.

## 7. Signature element (locked)

Two marks, used together: Tess's orb and the proof mark.

**Tess's orb** gives the app a face.

- The only colour in the app: radial green `#effbf2 → #8fe0ad → #2e7a50 → #0b2416`.
- Sits in the title bar (14px) and beside anything Tess says (22px), labelled "Tess".
- Never used as decoration, a button colour or a status colour.

**The proof mark** shows what Tess found.

- A 2px black rounded box (10px radius) drawn around the exact text or element Tess checked, inside the screenshot.
- The rest of the screenshot fades back (white at 45%).
- A numbered black badge sits on the box's top-left corner and matches a numbered "What Tess saw" line under the screenshot.
- Needs the engine to save where on the page the proof was (element bounds alongside the screenshot). Until then, no mark rather than a guessed one.

## 8. Motion (locked)

Alive: calm and purposeful. Motion only explains what is happening: Tess is working, then here is what she found.

- Easing `cubic-bezier(0.2, 0, 0, 1)` everywhere; no bounce, no springs that overshoot.
- **Tess testing:** the orb breathes (scale 1 → 1.08, 2.2s loop) and sends out a mint ring (scale 0.8 → 1.5, fading). Stops the moment she finishes.
- **Result arriving:** checks rise in one by one (6px up, fade in, 350ms, 120ms apart).
- **Proof mark:** the screenshot fades back (400ms), the box draws its outline around the proof (700ms), then the numbered badge appears (300ms; scale 0.25 → 1).
- **Everyday interactions** (switching checks, menus, hover): 150ms opacity and colour only; nothing moves position.
- Buttons scale to 0.96 when pressed.
- Respect reduced motion: no loops, fades only.

Rejected: quiet (fades only), lively (bouncy springs).

## 9. Voice (locked)

Tess speaks in first person, as a tester on your team. Facts only.

- Summary and check notes: "I cancelled a solo plan and Plan settings said “ends on December 14, 2026”."
- Broke: say what she did and what she saw. "I signed in as a team member and the Plan tab said nothing about the end date."
- Couldn't run: what she couldn't check and what she needs. "I couldn't check the member view. I need a second account in the team."
- While testing: short, present tense. "Cancelling the plan. Settings should then show the end date."
- Empty and error states speak as Tess too: "I haven't tested anything here yet." / "I couldn't start the app: port 3007 is already in use."
- No opinions, praise or verdicts ("works", "looks good", "safe to push"), no exclamation marks, nothing bigger than the evidence.
- App chrome that isn't Tess (buttons, settings labels) stays plain, verb first, sentence case: "Test again", "Copy report".
- `prompt.md` must ask for first person in the summary, intro and check notes so the app and her reports match.

- **Read aloud (off by default):** a speaker button on the test screen and a Settings switch. Tess's live lines are spoken as she says them, and her summary when the test ends, in Kokoro's Heart voice (af_heart), run locally by the engine. Kokoro installs once, the first time the voice is turned on (about 500 MB in ~/.ultimate-tester/voice); until it's ready nothing is spoken, and the screen says "Voice not available" with the reason. There is no fallback voice. A new line replaces anything still waiting, so the voice never lags the test.

Rejected: reporter with no "I", log lines.

## 10. Imagery (locked)

Plain frame: the screenshot as a card, the URL above it.

- Card: 16px radius, lifted shadow (see Shape), full width of the evidence pane, whole page visible.
- Above the card: the check name (Newsreader 20) on the left, the page's URL path with a `globe-simple` icon on the right (Geist 12.5, grey).
- The proof mark (see Signature) draws on top when the engine knows where the proof is; otherwise the plain screenshot.
- **The URL comes from Tess's report, never guessed.** The verdict schema needs a `url` per check (the page she was on when she took the screenshot), and `prompt.md` must ask for it. A check with no screenshot (e.g. unit tests) shows no frame and no URL.

Rejected: browser-window frame, zoom on the proof.

## 11. Components (locked)

Built only from the answers above. No one-off variants.

- **Buttons:** pills, 32px tall, Geist 13 medium, 16px icon. Primary black (`#000`, hover `#2a2a2a`), at most one per view. Secondary white with `#d6d6d6` ring (hover `#f4f4f4`). Plain: text and icon only. All scale to 0.96 when pressed. Never disabled-looking; respond on click instead.
- **Status pills:** 22px pills, Geist 12 semibold. Black with white text when there's a result ("8 of 8 passed", "1 broke · 7 passed" with a red ✕). Outline while waiting or testing ("Testing · 3 of 8" with a 12px orb). Grey `#f3f3f3` / `#666` when stopped.
- **Fields:** 36px pills, `#d6d6d6` ring, grey placeholder. Focus: 1.5px black ring plus a 4px `rgb(0 0 0/.06)` halo, and no other outline (one ring, never two). Multi-line text areas use 12px corners instead of a pill.
- **Check rows:** 10px radius, 10px padding, status icon then name, no status word. 8px between rows. Selected `#f4f4f4`, hover `#fafafa`. Optional note line under the name in grey 12.5.
- **Tess block:** orb (22px) and "Tess" in grey, then her first-person text in Geist 15. Numbered "What I saw" lines use the black badge that matches the proof mark.
- **Empty state:** 16px card with a hairline, orb, one or two lines in Tess's voice, one primary button.
- **Confirm sheet:** replaces every browser popup. 18px radius, lifted shadow, Newsreader 17 question, one grey line, Cancel (secondary) and the action (primary) on the right.
- **Menu:** 14px radius, lifted shadow, 6px padding, 2px between items, 16px icons, shortcuts right-aligned in grey, hairline separators.
- **API checks:** a check made with requests shows them in the screenshot's place, in one lifted card. When a request proves a failure, the card opens with "Expected" beside "Came back · 201 Created" (red ring on Came back, filled ✕), one line per top-level field, and the fields that differ marked with a `#fde2e1` highlight and semibold text. This highlight is the one exception to "colour only in status icons": it marks the proof, never decoration. Tess's one-line note sits under the pair. Below, "How I got there · N requests" with Show/Hide unfolds the requests as numbered steps (black 20px badge, method in a `#f3f3f3` tag, path, Copy as curl), each with what was sent, the status in a black pill plus its word ("Created") and time in ms, and the body in a `#fafafa` box. A check with no failing request shows the steps open.
- **Working (anything slow):** two places at once. **In place**, where it was started: every step of the job named in order, done steps with a filled check, the current one with Tess's breathing orb, its seconds counting and the latest output line under it, the next ones numbered and grey, and Cancel on the right. A failure replaces the current step's orb with the red ✕ and the reason. **In the title bar**, one pill centred, in the strong colour (black, or white in dark): the orb, what is happening in a few words ("Starting post-maker to sign in as member"), the time, and Cancel; clicking it goes to where the job lives. Signing in, drafting and converting a plan, and running a test all use it. Never a grey line on its own.
- **Toast:** black pill, white text and icon, bottom centre, 2 seconds. Only for things that happened off screen ("Report copied").
