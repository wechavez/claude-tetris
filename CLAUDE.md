# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Classic Tetris implemented in vanilla JavaScript (ES6+), HTML5 Canvas, and CSS. No dependencies, no build step, no package manager — just three files: `index.html`, `style.css`, `game.js`.

## Running the game

Open `index.html` directly, or serve it with any static server:

```bash
open index.html          # macOS, opens directly in browser
python3 -m http.server 8000   # or any static server, then visit localhost:8000
```

There is no build, lint, or test tooling in this repo — changes to `game.js`/`index.html`/`style.css` are live on page reload.

## Architecture

All game logic lives in `game.js` as a single file with module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — there are no classes or modules, just top-level functions operating on shared globals.

Key pieces:

- **Board model**: `board` is a `ROWS × COLS` matrix; each cell is `0` (empty) or a piece-type index `1–7` used to look up color in `COLORS`.
- **Pieces**: `PIECES` defines each tetromino as a square matrix. Rotation (`rotateCW`) is a transpose + row-reverse, not per-piece rotation tables.
- **Collision**: `collide(shape, ox, oy)` checks a shape against board bounds and settled cells; nearly every movement function (`tryRotate`, `softDrop`, `hardDrop`, keydown handlers) calls it before applying a move.
- **Wall kicks**: `tryRotate` attempts the rotated shape at x-offsets `[0, -1, 1, -2, 2]` and takes the first that doesn't collide.
- **Game loop**: `loop(ts)`, driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and advances the piece one row (or locks it) once `dropAccum >= dropInterval`.
- **Locking/scoring**: `lockPiece` → `merge` (bakes piece into `board`) → `clearLines` (bottom-up sweep, splices full rows, unshifts empty ones at top, scores via `LINE_SCORES[cleared] * level`) → `spawn` (promotes `next` to `current`, generates a new `next`, triggers `endGame` if the new piece already collides).
- **Level/speed**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Rendering**: `draw()` clears and redraws the full board each frame (grid, settled blocks, ghost piece via `ghostY()` at `globalAlpha 0.2`, current piece); `drawNext()` renders the preview canvas separately.
- **Input**: a single `keydown` listener dispatches on `e.code` (arrows, `KeyX` for rotate, `Space` for hard drop, `KeyP` for pause), guarded by `paused`/`gameOver`.

`index.html` just provides the DOM scaffold (`#board` and `#next-canvas` canvases, HUD spans, pause/game-over overlay) — all behavior is wired up imperatively from `game.js` via `getElementById`, not via inline handlers.

## Tunable constants (top of `game.js`)

`COLS`, `ROWS`, `BLOCK` (cell pixel size), `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `#board` canvas `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
