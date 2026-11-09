# Fullscreen control in Tools

## UI and behavior

The player Tools menu now includes **Vollbild** / **Vollbild verlassen**. This is native browser fullscreen, not CSS zoom or a larger page inside normal browser chrome. It uses the document root so all game zones and the Tools trigger remain available. No automatic entry, orientation lock, kiosk mode, HTTPS conversion or Wake Lock change is attempted.

The native tap listener is attached when Tools first opens, before the fullscreen button can be used. It invokes `requestFullscreen({navigationUI:'hide'})` directly within the tap, before the first await, preserving transient user activation rather than routing the request through asynchronous Blazor imports. Once the browser confirms success, Tools closes. Failures keep Tools open with an accessible, retryable message.

Button label and `aria-pressed` follow `document.fullscreenElement` through `fullscreenchange`, including external exits. Capability/policy checks disable unsupported entry instead of showing fake success. Pending requests block duplicate taps; disposal removes listeners and ignores late settlement. The native dialog still owns focus return and Escape dismissal. Panel focus restoration uses selected navigation classes, not the fullscreen toggle's independent pressed state.

Tools spacing is compact while retaining 44px minimum targets. Its heading/close button stays sticky when a short viewport requires internal navigation scrolling.

Fullscreen is independent of Wake Lock. The former works in Chromium on the tested insecure HTTP origin; the latter still requires a secure context. Operating-system gestures, browser policies and actual device behavior remain browser-controlled.

## Executed verification

- `node scripts/verify_fullscreen.cjs`: original source RED (`Supported HTTP fullscreen must be enabled`), updated module GREEN, 6/6 tests. Includes gesture timing, enter/exit, external changes, repeated open, unsupported capability, rejected/thrown requests, duplicate taps and cleanup during a pending request.
- `verify_fullscreen_browser.cjs`: real Chromium fullscreen on `http://ti4-fullscreen.test:18094`, resolved locally to the isolated candidate. `isSecureContext` is explicitly false; the main flow does **not** mock fullscreen APIs. Native entry/exit/re-entry and external API exit pass.
- Fullscreen layouts: 915×320, 915×412, 800×360, 640×360, 412×915. Screen/orientation changes use CDP device metrics while native fullscreen stays active. Playwright window resizing was rejected for an actual fullscreen window; the harness was corrected rather than weakening the fullscreen assertion.
- Unsupported capability and rejection/retry use separately labelled mocks; retry invokes the real native API. These are not claims of hardware testing on a Pixel.
- Fullscreen target measured 159×44 CSS px and passed center hit-testing. No page/runtime/network errors, no browser-initiated session mutations, and full fixture state unchanged.
- Existing regression suites: 302 Pixel cases, 25 legacy layouts plus dialogs/parallel secondaries/Undo/handoff interactions, 7 enlarged-header viewports, 10 background cases and real browser wheel-resize animation all pass.
- Existing Wake Lock tests: 9/9 pass. Adaptive wheel and animation-deadline unit regressions pass.

All fixtures use loopback candidate port 18094 and a separate test volume. No production players are selected or game actions exercised during live smoke checks. Production rollout remains guarded by the previous Compose hash, a consistent whole-volume backup, exact-volume reuse and post-restart FS5EQ state comparison. The LAN-only gateway is unchanged.
