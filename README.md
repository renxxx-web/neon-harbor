[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/renxxx-web/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/renxxx-web/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# NEON HARBOR

An original open-world crime game in a rain-soaked neon port city — built with
three.js, no build step, no network loads. You are **Ren Kade**, a getaway
driver working for the fixer **Mama Ivo**. The city hunts you back: as your
wanted level rises, its electronic billboards drop the fake ads and switch to
your **WANTED poster**, bounty climbing with every crime. And the rain never
stops.

## The city

- An 8×8-block neon downtown with lit windows, fake-brand signage
  (Volt Cola, Kestrel Motors, Hotel Mirage…), streetlights and wet streets.
- A working harbour: container yards, gantry cranes, two docked ships, a
  lighthouse — and a bridge east to a second shore district.
- A safehouse garage where the story starts and progress saves, a precinct,
  a hospital, the Volt Tower.

## What you do

- **On foot:** WASD + mouse-look (pointer lock), sprint, jump, punch, and —
  once Mama Ivo arms you — a pistol.
- **In cars:** steal anything with E (mind the alarm), arcade driving with
  drift and handbrake, chase camera, speed-sensitive FOV, working headlights,
  engine audio, and a 3-station synth radio (R).
- **Wanted system:** 0–5 stars, a BUSTED meter, patrols and interceptors,
  roadblocks at 4–5 stars, pressure that decays when you break line of sight.
  Busted costs a fine at the precinct; wasted costs a fee at the hospital.
- **Story:** an intro plus eight missions with phone dialogue — meet the
  fixer, repo a Kestrel GT, a timed ghost run, lose a 3-star chase, a harbour
  circuit, a bridge toll run, a two-stage container heist, and a 5-star
  finale. Then free roam.
- **Side work:** street races against a ghost timer and repeatable courier
  runs, marked on the minimap.
- **Save:** progress persists in localStorage — Continue from the title screen.

## Controls

| Key | Action |
| --- | --- |
| W A S D | move / drive |
| Mouse | look (click the game to lock the pointer) |
| Shift | sprint |
| Space | jump / handbrake |
| E | enter / steal car, interact |
| F | punch |
| Click | shoot (once armed) |
| R | radio station |
| P | pause |
| M | mute |

## Run it locally

```sh
node serve.ts
```

then open http://localhost:8080 in a desktop browser. Everything is static
files under `game/`; three.js is vendored at `game/vendor/three.module.min.js`.
All sound is synthesised live with WebAudio — no audio files.

## Handing it in

`node main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library
(`vendor/makefun-game.ts`, the kit's copy, unchanged). Outside the grader's
container, `MAKEFUN_OUTPUT_DIR` stands in for `/output`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
