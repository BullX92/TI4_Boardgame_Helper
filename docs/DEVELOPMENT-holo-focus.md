# Larger center identity and adaptive Holo preview

## Requested presentation

- Enlarge the central player/round header by 50%, including text and faction art, not just empty padding.
- Give the current and next player substantially more of the existing left Holo column. Keep a compact third-player preview.
- Preserve game state, the three zones, Tools, primary actions, the selected Holo settings and the animation deadline.

## Implementation

`PrototypeTableHeader.razor.css` applies `--header-scale:1.5` to the in-game identity header. Portraits grow from 26×30 to 39×45 CSS pixels; player text from 13 to 19.5px and initiative from 10 to 15px. Standard header height is about 85–87px (previously 57.5px); fixed borders account for the small rounding difference. Secondary room/connection information stacks below 850px landscape to avoid wrapping the round/phase line.

`prototype-initiative-wheel.js` allocates narrow/tall stages from their actual dimensions. It reserves name rows and gaps first, caps the third portrait at 24px, and distributes remaining art height between current/next at the selected depth. Portraits are individually sized; the whole column is not scaled. Width caps, short-stage fallback, passed-player filtering and the existing horizontal layout remain. Vertical labels use stable 16px rows and decorative plinths stay inside portraits.

At 915×320, the measured art heights are 100 / 72 / 24px, versus the previous approximately 76 / 40 / 25px. At 915×412 they grow to about 153 / 111 / 24px. One or two remaining players use the freed space. The 1800ms animation keeps its original completion deadline after ResizeObserver updates.

For landscape widths 600–799px, the existing two-column fallback now reserves the remaining viewport height for the order preview, rather than appending a fixed-height preview beneath the enlarged controls. Primary controls and enlarged identity retain priority. Portrait/desktop layouts are otherwise unchanged.

## Executed verification

Candidate verification uses a separately built local image, isolated loopback port 18094 and a separate test volume. No production-session mutations during verification. The deployed image/revision is recorded in the OMV rollout audit.

- `verify_wheel_fill.cjs`: original source RED (`active art must exceed 90px, got 76`), adaptive source GREEN. Includes one/two/three players, containment, label separation, short/wide stages and passed players.
- `verify_wheel_resize.cjs`: unchanged original animation deadline and duplicate-update behavior pass.
- A review found that a tiny square stage could select vertical layout without room for its fixed name rows. Vertical mode now also requires `height >= visibleCount * 16`; otherwise it retains the existing horizontal fallback. Seven new below/equal-boundary cases cover this, including the original 40×40/three-player failure (RED before the guard, GREEN after it).
- `verify_center_header.cjs`: enlarged art/fonts and bounded header verified at 915×412, 915×320, 800×360, 740×360, 667×375, 640×360 and 412×915; Wake Lock lifecycle and HTTP fallback remain valid.
- `verify_pixel_landscape.cjs`: 302 cases, no layout/runtime/network failures. Visible Holo art containment is now checked in addition to labels.
- Existing Chromium suite: 25 layouts, no errors; dialogs/focus, parallel secondaries, Undo and multi-client turn handoff pass.
- `verify_wheel_resize_browser.cjs`: actual Chromium animation survives resize without restarting.
- `verify_table_background.cjs`: all 10 presentation/hit-test checks pass, original asset hash unchanged.

The first enlarged-header candidate wrapped its phase at 800px; the secondary metadata stack fixes this. An additional existing 740×360 regression exposed the fixed-height fallback overflowing; the remaining-height fallback fixes it. The final candidate passes both checks.

Deployment continues through the LAN-only gateway on port 8093 with the existing persistent volume. GitHub publishing does not automatically update OMV. Roll out only the verified image, back up the existing database volume while the web service is stopped, and read back FS5EQ plus the live revision afterward.
