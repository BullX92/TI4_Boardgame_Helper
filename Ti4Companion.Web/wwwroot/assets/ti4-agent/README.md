# TI4-Agent UI assets

Copied from the user's existing `TI4_AI_Assisstend_Copilot/frontend/public` assets for the Table Companion prototype, as requested.

- `favicon.svg`: original blue/gold hexagon mark.
- `factions/`: all 31 original faction portraits plus `unknown.png` fallback, copied without modification.
- `manifest.json`: source-relative paths and SHA-256 checksums for the copied faction assets.
- `theme.css`: shared colors, font stack and starfield adapted from `frontend/tailwind.config.js` and `frontend/src/index.css`. Stars are dimmed for readability on a small screen.
- `demo.css`: layout of the three-device preview using the same tokens.

Visual reference inspected: https://ti4-agent.com (login screen). No login or production data change was needed. Assets are served locally; the prototype does not request images from the live service.

Twilight Imperium game artwork remains the property of its respective rights holders. The original Companion license and third-party notices remain in the repository root.
