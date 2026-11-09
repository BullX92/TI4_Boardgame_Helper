# User-supplied table backdrop

The supplied JPEG is stored unchanged at `wwwroot/assets/ti4-agent/table-space-v1.jpg` (1672x941,237565bytes,SHA-256 `67c8836334f5f4f55c9c277bf25588c708271ede3781bc58207ad52360b385ce`). It is served locally with no external image/CDN dependency.

The `/table` surface owns an isolated, fixed, non-interactive decorative `::before` layer. `cover` preserves image aspect ratio and fills the actual viewport across rotations. A dark gradient and translucent header/footer surfaces retain contrast; existing dark action/order/card panels stay intact. The previous opaque whole-app active-turn gradient is removed; the active console still has its existing emphasized appearance. No game logic or layout dimensions change.

## Verification

- Added `scripts/verify_table_background.cjs`. Real RED against v9: expected the supplied image in the computed backdrop; no backdrop existed.
- GREEN on the background candidate:10 normal/active presentation cases across915x412,915x320,800x360,412x915 and2400x1080. Checks fixed viewport bounds, stacking isolation, pointer transparency, enabled-control hit testing, cover sizing, image decode and exact served asset hash. Active classes in this narrow test are presentation-only; it performs no session writes.
- Full disposable Pixel suite:302 cases, zero layout/runtime/network failures. Real3player action screenshot reviewed; image remains visible and controls/cards readable.
- Image/verification changes require rebuilding the application image; no production volume or existing session is used by the test fixture suite.

## Deployment model

GitHub Actions `.github/workflows/docker.yml` builds/publishes `ghcr.io/bullx92/ti4_boardgame_helper:latest` plus an immutable commit tag on main. It does not deploy to OMV.

OMV currently uses a locally built pinned image, `pull_policy: never`, and Watchtower label `false`. Deployments are deliberate verified rollouts with consistent database-volume backup, rollback, preserved volume and unchanged LAN gateway. Enabling automatic production deployment would be a separate explicit change, not part of this background update.
