# Vibe Games

A collection of small, self-contained browser games. Everything is static: plain HTML/CSS/JS, no build system, no package manager, no test framework. Where 3D is needed, three.js is loaded from a CDN.

## Layout

- `index.html` — hub page with one card per game. Adding a game = create its directory + add a card here.
- One directory per game, each fully self-contained (HTML/CSS/JS/assets inside). Do not share code between games.
- `flappy_bird_3d/`, `flappy_bird_fps/` — single-file games (everything in `index.html`).
- `der_die_das/` — the German article shooter; bigger game with data files and Python tools. **Read `der_die_das/AGENTS.md` before working in that directory.**
- `gladiator/` — first-person turn-based arena combat (multi-file: data/audio/scene/combat/game). **Read `gladiator/AGENTS.md` before working in that directory.**

## Running a game

Open the game's `index.html` in a browser, or serve the repo statically:

```sh
python3 -m http.server
```

Internet is required (three.js and fonts come from CDNs).

## Conventions

- No dependencies and no build step — keep it that way.
- Each game persists its own save to localStorage under a unique key.
- A game may carry a `TODO.md` (backlog, tick items off as they land) and a `tools/` directory (maintenance scripts) — see `der_die_das/` as the reference.
