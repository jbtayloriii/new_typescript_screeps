# Expanding to a new room — design

Status: implemented (steps 1–5 of "Suggested order"; step 6 is for later). See
"Implementation notes" at the end. Builds on the phase 4 `claim` directive (see [ROADMAP.md](ROADMAP.md) phase 8),
and on the pure layout planner from [BASE_LAYOUT.md](BASE_LAYOUT.md) (phase 7).

## Goals

- Order a new base from the console with just a room name: `cmd.claim('W2N3')`.
- Scout the room first, and refuse or hold rooms that can't work, with the reason visible in
  `cmd.list()`.
- Pick the first spawn's position automatically, so that the **whole** RCL 1–8 layout fits, not
  just the core, and the spawn is close to sources and controller by walking distance.
- Build the first spawn reliably. It costs 15,000 energy of build work and takes over a
  thousand ticks, so a failed attempt is expensive. Check before committing, keep the attempt
  supplied while it runs, and notice when it stalls.
- Stay pure and testable, like the rest of the directive code.

## What exists today (phase 4)

- `claim` directive: waits for spare GCL and a base with 650 energy capacity within 10 rooms.
- `chooseSpawnPosition` ([spawn_position.ts](../src/directives/spawn_position.ts)): the tile
  closest (by range) to sources and controller where the layout's 3×3 core fits. Runs once intel
  exists.
- `claim` task ([claim_task.ts](../src/tasks/claim_task.ts)): a `[CLAIM, MOVE]` claimer, then 2
  `WCM×5` pioneers that harvest in the new room, place the spawn site and build it.
- Done when `Headquarters` creates the base. The claim's creeps in the room are handed over.

Gaps:
1. **No scouting step.** The claimer is sent with whatever intel exists, possibly none.
2. **The spawn check only covers the core.** `getInitialBaseCenter` checks that the 3×3 core
   fits. The extension stamps can still run out of room, leaving a base that can never reach
   60 extensions.
3. **Distance is straight-line range**, which ignores walls and swamps. A source behind a wall
   looks close.
4. **Two pioneers are too few.** In an owned room each source gives 10 energy/tick. A `WCM×5`
   pioneer averages about 5 energy/tick of build work (25 ticks harvesting, 10 building, plus
   walking). Two pioneers take about 1,500 ticks for 15,000 energy, which is their whole
   lifetime with no travel time left. They're replaced only after they die.
5. **The claimer can die on the way.** CLAIM creeps live only 600 ticks. `[CLAIM, MOVE]` moves at
   1 tile/tick on plains but 5 ticks/tile on swamp, and `moveTo` doesn't avoid hostile rooms.
   10 rooms can be more than 600 ticks of walking.
6. **No safety or stall checks.** Hostiles in the room, a destroyed site (enemy creeps stepping
   on a construction site destroy it) or dead pioneers don't change anything. Nothing reports
   a claim that has stopped making progress.
7. **The new base is on its own immediately.** An RCL 1 room with one spawn, 300 energy capacity
   and no tower is fragile.

## Lifecycle

One `claim` directive, with a `phase` saved on it (directive status stays pending/active/done/
cancelled as now):

```
scouting ──► evaluating ──► claiming ──► building ──► incubating ──► done
   │              │             │            │             │
   └── hold/cancel with a reason at any step (shown in cmd.list) ──┘
```

| Phase | Runs in | What happens | Moves on when |
| --- | --- | --- | --- |
| `scouting` | claim task | A `[MOVE]` scout goes to the room (the same behavior as the scout directive). Skipped if intel is fresh (seen since the directive was created). | Intel `lastSeen ≥ createdAt` |
| `evaluating` | `planDirectives` | Viability checks, spawn position, and a saved evaluation summary. One tick of CPU, pure. | Checks pass (else hold or cancel) |
| `claiming` | claim task | Claimer walks the planned route and claims (clearing reservations as now). Up to 3 attempts. | Controller is mine |
| `building` | claim task | Pioneers place and build the spawn; replacements spawn early; stall watchdog. | Spawn exists, base created |
| `incubating` | parent base | Parent keeps sending a few helpers to the new base. | New base RCL 3 with a tower (or cancelled) |

The base must be assigned (the existing `assignBase`) before scouting, since the scout comes from
that base. Base readiness is checked again before `claiming`, because readiness can change
while the room is scouted.

## Choosing the spawn position

Extend `chooseSpawnPosition` rather than replace it. The core-fit check stays the first filter,
and since `Base.createBaseFromInitialSpawn` runs the same `getInitialBaseCenter`, the layout
built later always matches what was evaluated.

1. **Candidates**: as now, non-wall tiles at least 4 from the edges where the 3×3 core fits.
2. **Walking distance**: one flood fill over the terrain from each source and from the
   controller. Plains cost 1, swamps 2, since roads will cover the main paths later. These
   replace range. It's pure and needs no PathFinder: 3–4 fills over 2,500 tiles. Score = the
   sum of source distances + the controller distance.
3. **Exit penalty**: a flood fill from exit tiles. Candidates within 6 tiles of an exit get a
   penalty per tile, because towers and ramparts work better deep in the room.
4. **Whole-layout fit**: for the best 10 candidates by score, run the pure layout planner
   (`planLayoutFromTerrain` from [BASE_LAYOUT.md](BASE_LAYOUT.md): core, extensions, labs,
   extra spawns and towers) and count its shortfalls. RCL 8 needs 12 extension stamps (60
   extensions) and a lab spot. Candidates with no shortfalls beat any that have some. If none
   are complete, the fewest shortfalls wins and the evaluation shows a warning.
   - Source roads stay in the PathFinder part, which only runs for the real base.
5. **Override**: `x`/`y` from the command or flag still win. The evaluation reports how the
   given tile scores, and warns if the layout doesn't fit.

Saved on the directive as `evaluation`, so `cmd.list` and visuals can show it:

```ts
interface ClaimEvaluation {
    readonly spawnPos: { x: number, y: number };
    readonly sourceDistances: readonly number[];
    readonly controllerDistance: number;
    readonly extensionStamps: number;   // of 12
    readonly routeRooms: number;        // rooms from the base, along the planned route
    readonly warnings: readonly string[];
}
```

Later (optional): add the mineral to intel with a small weight (an extractor arrives at RCL 6).
Draw the chosen spawn, core and stamps in the target room with visuals.

## Checks before committing

### Room (after scouting): hard blockers cancel, soft ones hold

| Check | Result |
| --- | --- |
| No controller | cancel |
| Owned by another player | cancel |
| Different room status from the base (novice/respawn zone border) | cancel. Needs `Game.map.getRoomStatus` in the world snapshot. |
| No candidate spawn tile | cancel |
| No route that avoids player-owned rooms within claimer range | cancel |
| Player combat creeps or hostile structures seen recently | hold: "player hostiles, use `cmd.escort`" |
| Invader core | proceed: the automatic defend directive (already used for remotes) is extended to claim targets |
| Reserved by a player | proceed: the claimer clears it with `attackController`, as now |
| One source only, or layout short of 12 stamps | proceed with a warning |

### Base readiness: hold with a reason, `force: true` skips these

| Check | Why |
| --- | --- |
| Spare GCL | already checked |
| RCL ≥ 4, energy capacity ≥ 1300 | full-size pioneers (`WCM×5` = 1000) and a fast claimer (850) |
| Storage ≥ 10k energy | the claim costs about 6–7k energy of creeps, and the parent base mustn't starve |
| No hostiles in the base room | don't send energy away while defending |
| No other claim from this base in `claiming`/`building` | one expansion at a time |
| Planned route fits the claimer's lifetime (< 500 ticks) | CLAIM creeps live 600 ticks |

These thresholds are guesses to tune.

## Building the spawn

- **Claimer**: `[CLAIM, MOVE×5]` (850). That's enough MOVE for 1 tile/tick on swamp, so the
  500-tick route check is reliable. Count attempts on the directive. After 3 claimers die,
  cancel with "claimer died 3 times", most likely from hostiles on the route.
- **Route**: plan the room route once with `Game.map.findRoute`, using intel to avoid rooms
  owned by other players, and save it on the directive. Give the move intent an optional
  `route` so creeps move room by room along it. Remote mining and squads can use it later too.
- **Pioneers**: one per open tile at each source, at most 2 per source. That's usually 4,
  enough to use most of 20 energy/tick, for a spawn in about 800–1,000 ticks of work. A
  1-source room gets 2 pioneers.
- **Early replacement**: like miners, spawn a replacement when `ticksToLive` < spawn time + travel
  time. Travel time is measured from the first pioneer to arrive and saved on the task.
- **Site placement**: as now, right after the claim. A destroyed site is placed again, and
  the watchdog notices the lost progress.
- **Hostiles in the room**: pioneers stop working and keep away from them. NPC invaders get an
  automatic defend directive, as remote rooms do. Player hostiles put the directive on hold,
  with the reason shown in `cmd.list`.
- **Controller downgrade**: claiming is one-time (unlike reserving), but an owned controller
  still counts down to downgrade, and the room is lost if it runs out at RCL 1. Pioneers only
  upgrade when nothing is left to build, so they upgrade first whenever `ticksToDowngrade` <
  5,000. Normally the spawn is built long before that, but a stalled claim would otherwise lose
  the room.
- **Watchdog**: track the spawn site's progress on the directive. Log an alert and set the
  reason if it hasn't increased for 1,500 ticks, or the spawn isn't built 6,000 ticks after
  the claim. **Never unclaim automatically.** Unclaiming throws away the GCL slot and the work
  done. The user decides with `cmd.cancel`.

## Incubating the new base

When the spawn is built, the base is created and the claim's creeps are handed over, as now. The
directive then stays active in `incubating`. The parent base keeps 2 helper pioneers going to
the new base, and they're handed over when they arrive. The new base builds them into its
economy (extensions, upgrading). Done at RCL 3 with a tower built, or cancelled by hand.

## Console

- `cmd.claim(room, { base?, x?, y?, force? })`: as now, plus `force` to skip the base readiness
  checks (never the hard blockers).
- `cmd.evaluate(room)`: a dry run. It prints the evaluation (spawn tile, distances, stamps,
  route, blockers and warnings) without creating a directive, or "no intel, run
  `cmd.scout(room)` first".
- `cmd.list()`: claims show their phase and progress, e.g.
  `d7 claim W2N3 [active] from W1N1 building · spawn 42% · pioneers 4/4`.

## How it fits the code

| Where | Change |
| --- | --- |
| `directives/types.ts` | `phase`, `evaluation`, `route`, `claimAttempts`, `claimedAt`, `spawnProgress` on `Directive` |
| `directives/spawn_position.ts` | walking-distance flood fills, exit penalty, whole-layout fit; returns a `ClaimEvaluation` |
| `pathfinding/base_layout_utils.ts` | none: uses `planLayoutFromTerrain` from phase 7 |
| `directives/claim_evaluation.ts` (new) | pure room viability checks and base readiness |
| `directives/planning.ts` | phase transitions, readiness in `assignBase`, auto-defend for claim targets, incubation done check |
| `tasks/claim_task.ts` | scout phase, claimer body and attempts, pioneer count, early replacement, hostile handling |
| `snapshot/world.ts` | `getRoomStatus`, and a route finder over intel |
| `intents/` | optional `route` on move intents |
| `directives/commands.ts` | `force`, `cmd.evaluate`, phase in `formatDirective` |
| `memory/migrations.ts` | existing claims get a phase: `building` if the controller is mine, else `claiming` |

## Suggested order

1. **Spawn position v2** and `cmd.evaluate`. Pure, testable on its own, and useful right away for
   picking rooms by hand.
2. **Phases, scouting and room checks**, with the migration for existing claims.
3. **Base readiness**, claimer body, route and attempts.
4. **Building**: pioneer count, early replacement, hostile handling, watchdog.
5. **Incubation.**
6. Later: mineral weight, layout preview visuals, CPU check (needs phase 6 stats), and automatic
   expansion (an empire planner that runs `evaluate` on scouted rooms and creates `auto`
   claims).

## Decisions

- Extend the existing `claim` directive instead of adding a new `expand` type: the flags,
  commands, handoff and migration are already there.
- Fully automatic by default. `cmd.evaluate` is the way to look before committing, rather than an
  approve step.
- Never unclaim automatically.
- Base readiness thresholds as above (RCL 4, 1300 capacity, 10k storage) to start; tune later.
- Claims stay manual (`cmd.claim` or a purple flag) for this phase. Automatic expansion comes
  later, built on `cmd.evaluate`.

## Implementation notes

Steps 1–3 landed. Where the code differs from the design above:

- **Code:** spawn position v2 in [spawn_position.ts](../src/directives/spawn_position.ts)
  (`evaluateSpawnPosition`, with `chooseSpawnPosition` kept as a wrapper); room checks and base
  readiness in [claim_evaluation.ts](../src/directives/claim_evaluation.ts); phases and
  `assessClaim` (shared by the planner and `cmd.evaluate`) in
  [claim_phases.ts](../src/directives/claim_phases.ts); `getRoomStatus` and `findRoute` on the
  world snapshot; an optional `route` on move intents.
- **No memory migration.** A claim without a phase is treated as `scouting`, and phases that
  are already satisfied fall through in one tick. A claim already in flight (fresh intel,
  controller mine) lands in `building` on its first tick.
- **Claims are assigned without a capacity minimum**, since scouting only needs a `[MOVE]`
  creep. Base readiness is checked in `evaluating`, so a claim made early scouts and evaluates
  the room, then waits with a reason like "waiting: base RCL 2 < 4".
- **The scout stays in the room** after scouting, for vision. It isn't replaced.
- **Route:** `Game.map.findRoute` avoiding rooms whose intel says another player owns them.
  Creeps with a route head for the exit to the next room on it, then use plain `moveTo` inside
  the target room. Pioneers use the route too.
- **Route length** is estimated at 50 ticks per room for the 500-tick check.
- **Claimer attempts** are counted by the planner from claimers with `targetRoom` set to the claim's
  room (`claimAttempts`, `lastClaimer` on the directive).
- **Claim targets get automatic defense** against NPC invaders (and Invader cores) once
  `claiming`, like remotes.
- **Cost:** one spawn evaluation takes about 26 ms (W23S31) to 40 ms (open terrain) in Node, once
  per claim and per `cmd.evaluate`. W23S31's evaluation picks 24,9; Cyborger built its spawn
  at 22,9.
- **Also fixed:** `myUsername` now comes from an owned controller, so claim and remote checks
  still work in a base whose spawn has died.

Step 4 (building) landed too:

- **Pioneers**: `pioneersWanted` counts open tiles next to each source from terrain (so it works
  without vision), at most 2 per source, at least 2 in all.
- **Early replacement**: a pioneer is replaced once its `ticksToLive` is below its spawn time
  plus the travel time. The planner measures travel time as the age of the first pioneer seen in
  the room (`pioneerTravelTicks` on the directive); until then it's estimated at 50 ticks per
  room of the route.
- **Hostiles**: `claimRoomThreats` (combat creeps or an Invader core in view, or seen in the
  last 300 ticks). While the room is threatened, nothing new spawns for the claim, and the
  claimer and pioneers wait in the middle of the home room (as remote miners do) rather than
  dodging tile by tile. The reason shows in `cmd.list` ("use cmd.escort" for players). NPC
  invaders get the automatic defend directive.
- **Downgrade**: pioneers upgrade instead of building while `ticksToDowngrade` < 5,000.
- **Watchdog**: the planner tracks the spawn site's progress (`spawnProgress`,
  `spawnProgressAt`). With no progress for 1,500 ticks, or no spawn 6,000 ticks after the claim,
  it sets a "stalled" reason and logs one alert to `Memory.log` (`stalledAt` keeps it to one).
  Progress clears it. It never unclaims.
- **Spawn priority**: claimers 58 and pioneers 55 (were 30 and 25), above extra upgraders and
  remote mining, which a healthy RCL 4 base can keep requesting indefinitely.
- `cmd.list` shows the spawn's progress, e.g. `building spawn 24,9 42%`.

Step 5 (incubation) landed:

- When the spawn is built and the room becomes a base, the claim moves to `incubating` instead
  of ending. The parent's pioneers and claimer in the room are handed over then, and each helper
  after that as it arrives.
- **"Keeps 2 helpers going" means 2 alive, not 2 in transit**: a steady stream of 2 at a time
  would pile up about 20 pioneers over an incubation. Every claim pioneer is spawned with
  `helperFor: <directive id>`, which survives the handover (unlike `role` and `targetRoom`), so
  the parent counts the helpers already working in the new base. Replaced early like pioneers.
- Done at RCL 3 with a tower ("incubated: RCL 3 with a tower"). If the room stops being a base
  while incubating, the claim ends with "new base lost". An incubating claim doesn't block the
  parent from starting another claim (only `claiming` and `building` do).
- `cmd.list` shows "incubating: RCL 2 of 3, then a tower".

Not done: the parent doesn't defend the incubating base. Its own home defense covers players
(with a 300-capacity spawn), and nothing covers NPC invaders before its first tower (see
[TODO.md](TODO.md)).
