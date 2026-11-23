# Room recording and replay — design

Status: design, nothing built yet. Related: [VISUALS.md](VISUALS.md) (live HUD) and
[ROADMAP.md](ROADMAP.md) phase 6 (observability).

## Goals

- Debug **after the fact**: something went wrong an hour ago, and I can pull up what happened.
- **Opt-in per room**, so it costs no CPU unless I turn it on.
- See **why**, not just what: each creep's task and state, the intents the bot chose, and which
  ones failed. The game's own replay can't show this.
- **Data first**: a plain-data recording that scripts (and Claude) can read and search. A visual
  viewer comes later, on top of the same data.
- Owned rooms only for now.
- Not tied to one server: official, private and offline (saved files) behind one interface.
- Later: turn a bad stretch into a regression test, since decisions are pure functions over
  snapshots.

## Decisions so far

| Question | Decision |
|---|---|
| Use case | After the fact, with a recorder I turn on per room. |
| Viewer | Build our own, but start with the data and text reports, not a UI. |
| Rooms | Owned rooms only. |
| Servers | Design so switching is easy (see "Servers"). |

## Where the data comes from

| Source | What it has | What it lacks |
|---|---|---|
| **Room history** (`GET /room-history/{shard}/{room}/{tick}.json` on the official server) | Every object in the room for every tick: positions, stores, hits, creep bodies, `actionLog` (harvest, attack, upgrade… with targets). The web client's replay mode uses it. `screeps-api` has `api.history(room, tick, shard)`. Chunks of 100 ticks on the official server (20 on private servers): the first tick is complete, later ticks are diffs. | Anything only the bot knows: tasks, creep memory, intents, return codes. No visuals or console. Limited retention. |
| **Flight recorder** (ours, in memory segments) | The bot's side: tasks, states, intents and their results, spawn queue, alerts, CPU. | Only covers ticks while it's on. Costs CPU and segment space. |

The two are joined by tick and creep name into one recording.

### History spike results (2026-11-21, W23S31 on shard0)

- **No auth needed.** `GET https://screeps.com/room-history/shard0/W23S31/{tick}.json` returns the
  same data with or without the token. Missing chunks are a plain 404.
- **Retention: about 35 000 ticks (about 36 hours) of continuous history.** Every 100-tick chunk was
  there back to 35 500 ticks, and none from 36 000 to 190 000. Some older chunks survive (8–13 days
  back, at scattered ticks), but don't rely on them.
- **The newest chunk is 1–2 chunks behind** the current tick (the chunk containing "now" 404s), so
  "the last 500 ticks" should end at the newest chunk that exists.
- **About 1 tick per 3.6 seconds** at the moment, so 1000 ticks ≈ 1 hour.
- **Chunk format**: `{ timestamp, room, base, ticks: { "<tick>": { "<objectId>": ... } } }`, with
  100 ticks per chunk. The first tick has every object in full. Later ticks hold only the fields
  that changed since the previous tick (`{"x":29}`, `{"store":{"energy":369}}`), merged into the
  object. A value of `null` for an object means it's gone (it died or left the room). A creep
  that comes back reappears with all its fields.
- **Creeps** have `name`, `x`, `y`, `body` (with hits per part), `store`, `hits`, `fatigue`,
  `spawning`, `ageTime` (the tick it dies, so ttl = `ageTime - tick`) and `actionLog` (`harvest`,
  `build`, `upgradeController`, `attack`, … each `null` or a target `{x, y}`). An action repeated
  on the same target doesn't show up in the diff, so the rebuilt state has to carry it forward.
- **Our creep names already encode the task** (`W23S31_haul_8_79224396_0` is task 8, `haul`), so
  history alone can group creeps by task. The flight recorder still records the task in case it
  ever changes after spawning.
- **Size**: 75–185 KB of JSON per 100-tick chunk for this room (~30 KB for the full first tick,
  ~1.3 KB per tick of diffs). The full 35 000-tick window is ~350 chunks, ~50 MB, so recordings
  belong in a git-ignored `data/recordings/`.
- Two chunks are saved as test data in `data/testing/history/W23S31/`.
- **It already found a bug**: the scout `W23S31_scout_5` sat on exit tile (0, 37) going back and
  forth between W23S31 and the room to the west every tick, for at least 200 ticks. Earlier
  it did the same on (36, 49) for a while. "Bouncing on an exit tile" is now the first detector. Not used: screen-recording the web
client (a video can't be searched), and a live WebSocket recorder (has to be running beforehand;
maybe later, for console logs).

## In the game: the flight recorder

### Turning it on and off

```
cmd.record('W1N1')            start recording W1N1 (until turned off)
cmd.record('W1N1', 5000)      record for 5000 ticks, then switch off
cmd.record('W1N1', 'off')
cmd.record()                  list rooms being recorded, their segments and the ticks they cover
```

Settings live in `Memory.recording[roomName] = { since, until?, segments: [...] }`, like
`Memory.visuals`. While it's off for a room, nothing runs for that room.

### What a tick record holds

One compact record per tick per recorded room, built by a pure `buildTickRecord(report, results)`
from the `BaseReport` and the executed intents, so nothing is computed twice:

- **tick**, and CPU used by this base this tick;
- **creeps**: for each creep of the base (including ones away from home): name, task, state, and the
  intent it got with its target and return code. Positions, stores and bodies are left out, since
  history has them;
- **spawn queue**: the head request, its status ("waiting 550/800", "skipped"), and what spawned;
- **alerts**: intent-failure summaries and anything else the HUD's alerts panel would show;
- **economy**: the economy summary's estimates.

Short keys and a schema version number, since the size budget is about 1 KB per tick (see below).

### Storage: a ring of segments per room

- Each recorded room gets a fixed number of segments from a reserved range (e.g. segments 50–89),
  chosen when recording starts. One segment holds one block of 100 ticks, aligned with history's
  100-tick chunks, so a segment matches a history chunk.
- When the ring is full, the oldest block is overwritten. With 10 segments per room that's the last
  1000 ticks (about an hour). History goes back ~35 000 ticks, so segments, not history, limit
  how far back the bot's side goes. Further back, a recording has the game state only.
- Records for the current block are kept in the global heap and flushed to the segment every
  20 ticks and at the end of the block. A global reset loses at most 20 ticks.
- An index in Memory (`Memory.recording[room].segments`: which segment holds which block) tells the
  download script where to look, without reading every segment.

## On my machine: recording and reports

### Servers

All server access goes through two small interfaces, so the rest of the code doesn't care which
server it's talking to:

```ts
interface HistorySource {
    chunkSize: number;                                   // 100 official, 20 private
    getChunk(room: string, tick: number): Promise<HistoryChunk>;
}
interface RecorderSource {
    getIndex(room: string): Promise<RecorderIndex>;      // from Memory.recording
    getBlock(segment: number): Promise<TickRecord[]>;
}
```

- **Official** and **private** servers: both via `screeps-api`, which already picks the right history
  URL and chunk size. The server comes from a named entry in `screeps.json` (`main`, or a new
  `private` entry), e.g. `npm run record -- --server main W1N1 81200 81800`.
- **Files**: reads a saved recording folder. Used for tests and for reprocessing without
  downloading again.
- The simulation runs in the browser and has no history API, so it isn't supported.

### Commands

```
npm run record -- W1N1 81200 81800      download history + recorder blocks, build the recording
npm run record -- W1N1 last 500         the last 500 ticks
npm run analyze -- data/recordings/W1N1_81200-81800
```

### The recording

A folder per recording. Raw downloads are kept so everything else can be rebuilt as the format
changes:

```
data/recordings/W1N1_81200-81800/
  meta.json        room, shard, server, range, terrain, schema version, bot git sha if known
  raw/history/     history chunks as downloaded
  raw/recorder/    recorder blocks as downloaded
  ticks.jsonl      one line per tick: the full room state (rebuilt from history diffs)
                   merged with that tick's bot record
  creeps.jsonl     one line per creep per tick: pos, store, hits, actions, task, state,
                   intent, result. Easy to grep for one creep.
  timeline.csv     one row per tick: energy available/capacity, storage, controller progress,
                   creeps per task, CPU. For graphs.
  events.jsonl     notable moments: spawns, deaths, construction finished, intent failures,
                   and detector findings
  report.md        the detector summary, with ticks and creeps to look at
```

`ticks.jsonl` is the source of truth; the other files are views of it, built by pure functions.

### Detectors

Pure functions over the ticks, each adding findings to `events.jsonl` and `report.md`:

- a creep bouncing on an exit tile: in and out of the room on alternate ticks (found in the spike);
- a creep stepping between two tiles (A, B, A, B): remote haulers in W24S31 all switched
  containers together every tick when both ran low (found 2026-11-22, fixed in `collectEnergy`);
- a creep hasn't moved for N ticks while it has an intent to move;
- a creep is idle (no intent) for N ticks;
- the same intent failed repeatedly (creep, intent, return code);
- spawns idle while the queue has requests, and for how long;
- energy dropped on the ground and not picked up;
- a source with energy left when it regenerates;
- a hauler moving back and forth with nothing in its store.

`report.md` plus a few lines of `creeps.jsonl` around each finding is a good size to give to Claude
with "why is this hauler stuck?".

## How it fits the code

- In game: `src/recording/` with `buildTickRecord` (pure, tested with `aRoom()` like the HUD
  panels), the ring and flush logic (pure functions over the index), and a thin layer that touches
  `RawMemory.segments`. `cmd.record` sits next to `cmd.visuals`.
- `BaseReport` is built when visuals **or** recording is on for the room.
- Off the game: TypeScript under `scripts/recording/`, run with the same compiler so it can import the
  recorder's types and the snapshot types from `src/`. Reconstructing ticks from history diffs,
  merging, the views and the detectors are pure and tested with saved chunks.

## Later

- **Replay viewer**: a local HTML page with the map, a tick slider and a creep inspector, reading
  `ticks.jsonl`. Could reuse the HUD panels from `src/visuals/` to show the bot's view next to the
  map.
- **Offline re-run**: turn a history tick into a `RoomSnapshot` (the shape
  [build_snapshot.ts](../src/snapshot/build_snapshot.ts) produces), run the decision code on it and
  compare with what the bot did. Save ticks that reproduce a bug as test fixtures, like
  `data/testing/`.
- **Console logs** via a WebSocket recorder, or `Logger` output into the tick record.
- Remote and claim rooms.

## Open questions

1. ~~Official history retention, and does it need auth?~~ About 35 000 ticks; no auth. See "History
   spike results".
2. **How many segments per room?** History covers ~36 hours, so more segments always help. 10 per room
   (~1 hour) to start, or more for a single base?
3. **Default duration for `cmd.record('W1N1')`:** until turned off, or a long auto-off (e.g.
   10 000 ticks) so it can't be forgotten? CPU cost decides this; measure it first.
4. **Segment budget:** is ~1 KB per tick enough for a base with 15–20 creeps (W23S31 has 16)? If
   not: fewer fields, only creeps whose intent changed, or two segments per block.
5. **Writing segments:** confirm a segment can be written on a tick when it isn't one of the 10
   active segments, or whether the recorder has to request it a tick ahead.
6. **What else in the tick record?** E.g. the spawn queue in full, construction sites placed, the
   directive status.

## Suggested order

1. ✅ Spike: fetch a few history chunks for an owned room. Check the format, retention and auth, and
   save them as test data.
2. `HistorySource` (official + files), tick reconstruction from diffs, and `npm run record` for
   history only → `ticks.jsonl`, `creeps.jsonl`, `timeline.csv`.
3. First detectors (stuck, idle, spawns idle) and `report.md`.
4. Flight recorder in game: `cmd.record`, tick records, segment ring. Measure its CPU.
5. `RecorderSource`, merging into the recording, and the detectors that need the bot's side
   (repeated intent failures, idle).
6. Private server profile.
7. Later items as needed.
