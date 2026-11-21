# Base visuals (HUD) — design

Status: step 1 built (header, tasks, spawn queue and estimated economy panels, `cmd.visuals`).
See "Suggested order" for what's next, and [ROADMAP.md](ROADMAP.md) phase 6.

## Goals

- See what a base is doing at a glance: its tasks and their creeps, what's spawning next and
  why, where energy is going, and what's wrong.
- Turn it on and off per room from the console, so it costs nothing when you're not looking.
- Stay testable: decide *what* to draw with pure functions, like the rest of the code, and keep the
  part that calls `RoomVisual` thin.

## What it looks like

A HUD of stacked panels in the top-left corner of the room, plus optional overlays drawn in the
room itself. Panels use room tile coordinates (the room is 50×50); the HUD should stay within
about x ≤ 20 so most of the room stays visible, on a semi-transparent background.

```
┌ W1N1 · RCL 3 (62%) · static · tick 81234 ───┐
│ Energy ███████████░░░░  550/800              │
│ CPU 4.1 (bucket 9800)                        │
├ Tasks ──────────────────────────────────────┤
│ mine   W1N1_mine_2   miner 1/1  ttl 812      │
│ mine   W1N1_mine_3   miner 1/1  ttl 95 ⟳     │
│ haul   W1N1_haul_4   3/3  G G W              │
│ upgrade              2 (4 WORK / budget 6)   │
│ build                1/2  · 4 sites          │
│ repair               1/1                     │
│ scout                0 · neighbors fresh     │
│ remote d3 → W1N2     miner 1/1  haul 1/2     │
├ Spawn queue ────────────────────────────────┤
│ ▶ haul    p90  CMx8  800  waiting 550/800    │
│   upgrade p50  WCMx2 400                     │
├ Economy (last 1500 ticks) ──────────────────┤
│ in  harvested 18.2/t  remote 4.1/t           │
│ out spawn 3.2/t  upgrade 6.0/t  build 2.1/t  │
│ storage +1.4/t (42k)                         │
├ Alerts ─────────────────────────────────────┤
│ ! intent failures: harvest:-6 x2             │
│ ! W1N2 paused: hostiles seen 120 ticks ago   │
└──────────────────────────────────────────────┘
```

## Panels

Each panel can be toggled separately. **The default set is header, tasks, spawn queue and
economy.**

1. **Header**: room, RCL and progress, mining mode (harvest/static), energy available out of
   capacity as a bar, CPU used and bucket, tick.
2. **Tasks**: one row per task, grouped by type. For each: creeps out of desired (desired comes
   from its open spawn requests), and either per-creep state (`G`athering/`W`orking) or role counts
   (miner/hauler for remote mining). Also the lowest `ticksToLive`, with a marker when a
   replacement is already queued. Directive tasks show their directive id and target room.
   Task-specific details:
   - upgrade: WORK parts out of the upgrade budget;
   - build: number of sites;
   - scout: its target, or "neighbors fresh".
3. **Spawn queue**: open spawn requests in priority order: task, priority, body (e.g. `WCMx3`)
   and cost. It also marks the request the spawns are waiting on and why, e.g. "waiting for
   550/800 energy" or "skipped: can never afford".
4. **Economy**: from the economy summary: estimated income, upkeep and upgrade budget. With stats
   recording (see below), measured energy flows per tick over a rolling window: harvested (home
   and remote), spent on spawning, upgrading, building and repairing, and net in/out of storage
   with its current level.
5. **Construction**: sites placed out of the per-room cap, remaining build progress, and the next
   few structures waiting for a site (from the layout and build priority).
6. **Defense**: hostiles (count and attack/ranged/heal parts), tower energy, safe mode (active,
   available or on cooldown), and the current wall/rampart repair target.
7. **Directives**: directives this base runs, plus pending ones nearby, each with status and
   reason (the same text as `cmd.list()`).
8. **Alerts**: things that need attention, newest first, kept for a while:
   - the base tick's intent-failure summaries;
   - a blocked spawn queue;
   - collapse recovery;
   - a source container missing, or a source without a hauler;
   - a paused remote room;
   - a claim waiting for GCL.

## Overlays in the room

Toggled separately from the HUD, since they draw over the room:

- **Creep labels**: a short task code above each creep (`M` mine, `H` haul, `U` upgrade, …) and its
  state, plus a faint line to its `targetId`. This makes it easy to spot stuck or crowding creeps.
- **Sources**: open-tile count, the container tile, and which creeps are using each source (the
  same "taken tiles" count `freeSpots` uses).
- **Layout preview**: the base layout's planned structures as faint ghosts, colored by the RCL that
  unlocks them. Useful for checking the layout planner. Show it on its own, since it's busy.
- **Remote and claim rooms**: room visuals can be drawn in rooms without vision, so a remote or
  claim room can show its directive, its creeps and the planned spawn position.
- **World map**: `Game.map.visual` lines from each base to its remote, scout and claim targets, so
  the whole empire shows on the map.

## Turning it on and off

Console commands, next to the directive commands:

```
cmd.visuals('W1N1')                          toggle the default panels for a room
cmd.visuals('W1N1', 'off')
cmd.visuals('W1N1', ['tasks', 'spawn', 'creeps'])   choose panels/overlays
cmd.visuals('W1N1', 'all')
cmd.visuals()                                list rooms with visuals on
```

Settings are saved in `Memory.visuals[roomName] = { panels: [...], until: tick }`, so they survive
global resets. Visuals cost CPU while on (building the report and panels, every `RoomVisual` call,
and serializing them at the end of the tick), so **they switch off automatically 200 ticks after
being turned on**. Turning them on again restarts the 200 ticks. Console commands are the only
toggle (no flags).

## How it fits the code

Use the same split as intents: pure functions decide, and a thin layer touches the game.

```
base tick ──► BaseReport (plain data) ──► buildHud(report, settings) ──► DrawCommand[] ──► render(RoomVisual)
```

1. **`BaseReport`**: the base tick already computes almost everything the HUD shows: tasks and
   their creeps, open spawn requests, the economy summary and construction. `decideBaseIntents`
   returns it alongside the intents, so nothing is computed twice. `Base` then adds what's only
   known after executing: intent results and failures. Only built when visuals are on for the room.
2. **View models**: pure functions such as `tasksPanel(report)` return rows of text (with colors and
   truncation). They're tested with `aRoom()` like any decision.
3. **Layout**: a pure helper stacks panels from the top-left, measures rows (monospace font, so
   width ≈ characters × font size × a constant) and produces `DrawCommand`s: plain
   `{ kind: 'text' | 'rect' | 'line' | 'circle', ... }`.
4. **Renderer**: the only code that calls `RoomVisual` / `Game.map.visual`, translating each command.
   It needs one small adapter test.

This replaces the existing prototype in `src/visuals/` (a hard-coded right-hand pane drawing
example text, not called from anywhere). Its `Pane` idea (header plus lines) becomes the pure
panel layout.

## Stats for the economy panel

The economy panel's measured flows need numbers recorded over time. Roadmap phase 6 lists this
too, so build it once for both:

- Per base, per tick, from data the tick already has:
  - **harvested**: successful harvest intents × 2 per WORK part (capped by the source's energy);
  - **spawning**: the cost of successful spawn intents;
  - **upgrading**: the change in controller progress;
  - **building**: the change in construction site progress, plus finished sites;
  - **storage**: the change in storage energy.
- Saved as a few rolling buckets in `Memory.stats[roomName]`, e.g. 15 buckets of 100 ticks. That
  gives "last 100" and "last 1500" averages and stays small.
- CPU per phase of the tick (intel, directives, each base, visuals) with `Game.cpu.getUsed()`
  markers. This also answers the earlier question about snapshot cost with real numbers.

Stats recording can run with visuals off, so the numbers are already there when you turn the HUD
on.

## CPU and limits

- Build the report, the panels and the draw commands only for rooms with visuals on. With visuals
  off there is no cost.
- Visuals switch off by themselves after 200 ticks (see above).
- Room visuals are cleared every tick. To save CPU, build the panels every N ticks (e.g. 5) and
  replay the cached result in between with `RoomVisual.export()` / `import()`, kept in the global
  heap. Creep overlays move, so redraw them every tick or leave them out.
- The game limits visuals to 500 KB of data per room per tick. A HUD is far under that, but the
  layout preview plus many creep labels should still be checked.
- Measure the cost with the CPU stats above; expect a few tenths of a CPU per room with visuals on.

## Suggested order

1. ✅ `BaseReport` from the base tick ([base/base_report.ts](../src/base/base_report.ts)); header,
   tasks and spawn queue panels, plus the economy panel showing estimates
   ([visuals/panels.ts](../src/visuals/panels.ts)); layout and renderer; `cmd.visuals` on/off with
   the 200-tick auto-off. The old `src/visuals/` prototype is deleted. The spawn queue's statuses
   come from `planSpawnQueue` ([spawning/plan_spawns.ts](../src/spawning/plan_spawns.ts)).
2. Stats recording (shared with phase 6), then the economy panel. Until stats exist, the
   economy panel shows the economy summary's estimates (income, upkeep, upgrade budget).
3. Alerts panel and creep labels.
4. Construction, defense and directives panels.
5. Layout preview, source overlays, remote/claim room overlays, map visuals.
6. Caching with `export()`/`import()` once CPU numbers say it's worth it.

## Decisions

- **Auto-off:** visuals switch off 200 ticks after being turned on, since they cost CPU while on.
- **Default panels:** header, tasks, spawn queue and economy.
- **Empire-wide summary panel:** not yet. Per room for now.
- **Toggle:** console commands only, no flag toggle.
