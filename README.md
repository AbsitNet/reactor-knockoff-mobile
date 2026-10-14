# Reactor Knockoff (mobile)

Fork of [Reactor Knockoff](https://github.com/cwmonkey/reactor-knockoff) (based on Reactor Incremental) with an interface and controls adapted for phones and tablets. The game logic is unchanged; saves are compatible with the original.

**Play:** https://absitnet.github.io/reactor-knockoff-mobile/

## Touch controls

The toolbar above the parts list (shown on touch screens) replaces the mouse and keyboard:

| Button | What it does | Desktop equivalent |
| --- | --- | --- |
| **Build** | tap / drag over the reactor to place the selected part | left click / drag |
| **Sell** | tap / drag to sell parts | right click / drag |
| **Scroll** | drag scrolls the reactor, a tap still builds | — |
| **1 tile / All same / Row / Column / Checkered** | placement pattern | Shift / Ctrl / Alt / Ctrl+Alt+Shift + click |
| **Step 1–9** | row/column spacing | holding number keys 2–9 |
| **− Fit +** | reactor zoom | — |
| **Parts ▾** | hide/show the parts list | — |

* Double tap on a tile works like a double click: it fills/sells all matching tiles.
* Tap a part to select it (tap again to deselect); its description appears at the bottom, close it with **×**.
* Upgrades: the first tap shows the description, a second tap (or **Buy** / **Buy max**) buys it.
* The game can be added to the home screen and runs fullscreen.

## Running locally

It is a static site, no build step: open `index.html` or serve the folder, e.g. `npx http-server .`

## Publishing on GitHub Pages

1. Repository **Settings → Pages**.
2. **Source:** *Deploy from a branch*, branch `master`, folder `/ (root)` → **Save**.
3. After a minute the game is available at `https://<user>.github.io/reactor-knockoff-mobile/`.

The `.nojekyll` file tells Pages to serve the files as they are.
