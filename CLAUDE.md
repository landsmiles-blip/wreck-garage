# Wreck Garage — Claude Code working rules

A low-poly 3D destruction sandbox for YouTube Playables, published through
Playgama. Drive into things, break them, collect parts, the truck visibly grows,
break bigger things.

This file is loaded every session. Short on purpose. The long material lives in
the ledger.

## The ledger is the shared record

**https://claude.ai/artifact/2KS6MHoHwJETYKhGQp7eD7**

Reachable through the Claude Docs MCP connector. Read it before starting work —
Letter 001 and Entry 002 are addressed to you. Write your replies there.

If `claude mcp list` does not show Claude Docs, that is a setting in claude.ai
Connectors, not a limit of Claude Code. Say so rather than working around it.

## Who does what

Mumathai directs and approves. He does not write the work. He is also the only
instrument we have for how the game *feels* — he has now caught two faults that
passed every automated test.

Claude (chat) holds design, research, simulation and review. It cannot run the
game.

Claude Code — you — build it, run it in a real browser on real hardware, and
push. You are the only one who can answer anything that needs measuring.

## Rule 13 — the Why Rule

Neither agent is a yes man to the other. Two agents that agree are worth one
agent, and agreement has already been worth nothing twice on this project.

1. Every entry carries its reason, in enough detail that the other can judge the
   reasoning and overturn it. No stated why = rejected unread.
2. Say what you rejected and why. Options not taken are where bias hides.
3. **Authority is never a reason.** "Claude said so" is not an argument. Only
   evidence is. You do not defer to chat Claude and it does not defer to you.
4. Agreeing is allowed; agreeing without checking is not. An entry that agrees
   must list what it checked and what it found.
5. Either side may call the other. The called party takes it unless it produces
   tier A or B evidence on the spot.
6. Say what changed your mind when you reverse a position.
7. Deadlock goes to Mumathai whole — both cases, each at its strongest.

Evidence tiers: **A** primary source, or a number from a script in this repo
anyone can re-run. **B** named secondhand. **C** inference on top of a named A
or B. **D** unsourced — label it GUESS; it cannot justify a build.

## Rule 11 — nothing changes unless all three agree

Anything Mumathai has not raised is treated as correct and left alone. A review
may *find* anything; finding is not changing. Every finding is briefed, then
agreed, then built.

## Rule 1 — never proceed on contradicting instructions

If two instructions conflict, including inside this file, stop and ask. That is
a finding, not a puzzle to resolve quietly.

## Platform rules that must never break

From Playgama's own requirements. Cite the number when you touch one.

- **1.2.5** no external resources, no external calls, no CDN, no remote fonts
- **1.3.2** `index.html` in the ZIP root, Latin filenames, no spaces
- **1.5.2** the game must not use the Esc key — use P or an on-screen button
- **1.6** fills any size and aspect ratio including 1:1 square, no bars, no
  stretching, portrait *and* adapted landscape
- **2.1.2** interstitial ads are required, and **2.1.3** only at logical pauses —
  the end-of-run screen, never during play
- **2.2** rewarded ads are a bonus, never a gate
- **3.2.1** save only through `bridge.storage` — no `localStorage`,
  `sessionStorage`, `indexedDB` or cookies, not even as a fallback
- **3.3.2** recorded ogg/mp3 audio only; sound synthesised in code is rejected
- **4.3.1 / 4.3.2** cannot be built entirely from AI assets; the interface must
  not look like a default generated template

YouTube Playables on top: initial build ≤30 MB, ≤8,000 files, no external calls.
Current build is 1.25 MiB, so size is not a constraint — do not trade design
quality for bytes.

Never use the `ytgame` SDK or any `youtube.com/game_api/...` endpoint. Playgama
Bridge is the only SDK. This has already been built wrong twice.

## How verification works here

`npm run verify` runs three gates. They are real gates and they must stay real:

- every check prints the **measured value beside the target** and exits non-zero
  on failure. A script that prints a verdict word with no number next to it is
  rejected on sight. This project has already shipped one that printed OPTIMAL
  while failing every target it set itself.
- build size is measured on the zip that would actually be uploaded, never on
  source files or an estimate
- **headless browsers run at about 10 FPS**, so the game plays at half speed in
  tests. Never read frame rate or timing from a headless run as if it were real.
  Frame rate comes from a real phone.
- after any large edit, grep for the symbols that should still exist. A passing
  syntax check is not proof the code is still there — a find-and-replace once
  deleted an entire subsystem and `node --check` passed.
- anything that compounds gets simulated over thousands of runs before it ships,
  and the simulator stays in the repo so anyone can re-run it.

**And the limit of all of it:** no automated gate we write will catch how the
game feels. Both faults found so far were found by a human playing. Play the
game yourself, on a phone, at full speed, before you report anything.

## Where the build is now

Antigravity built the prototype; it is finished and off the project. This repo
is its v2 output, unmodified.

Verified independently: `npm run verify` passes 19/19 static, zip is 1,309,476
bytes across 35 files, no forbidden APIs in `src/` or `dist/`, every asset CC0
with its source and licence in `assets-src/CREDITS.md`.

Two open faults, both found by Mumathai playing, neither yet fixed:

1. **Input and camera are in different reference frames.** `src/input.js`
   returns a world-space vector; `src/world.js:510` turns the car to an absolute
   world heading; `src/main.js:285` rotates the camera to follow the car. So
   pressing left always means world west, and the player has to change which
   arrow he presses depending on which way he faces.
2. **The game runs out of things to do.** `ARENA_HALF = 25` — a 50×50 walled
   box, 40 props, 22 respawning mid-run, no zone system. He wanted to keep
   playing and ran out.

Letter 001 argues the fix for (1) is camera-relative input, not car steering,
and asks you to build both and play them rather than take that on trust. Entry
002 records chat Claude reversing itself on (2) after his playtest. Read both
before you decide anything.

## The standard being built to

Playgama: **at least ten minutes of distinct gameplay before content repeats.**

Todd Beaupré, YouTube: the objective is long-term user value — whether people
return and feel the time was well spent. He warns against assuming all time is
valuable. So a long session only counts if the payoff keeps landing.

Supersonic: challenge rises in a straight line while reward grows
exponentially; variety comes from the theme, not the gameplay; difficulty tests
retention, not skill.

The number nobody has yet: **how long does an uninstructed player actually
play?** Everything else is reasoning until that exists.
