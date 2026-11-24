# Typescript Screeps code

For planned work, see [docs/ROADMAP.md](../docs/ROADMAP.md).

## Overview

The empire is split into these pieces:

- **Headquarters** ([headquarters.ts](headquarters.ts)): A global singleton that creates a `Base`
  for each owned room with a spawn. Each tick it groups all creeps by `memory.baseRoomName`
  (wherever they are) and runs each base with its creeps. Creeps whose base is unknown are
  moved to the base in their current room, or else the first base.

- **Base** ([base/](base/)): A single owned room. A `Base` object lives across ticks but stores
  only its room name, and reads everything else fresh each tick (game objects and `Memory`
  references go stale between ticks). All of its decisions are pure functions in
  [base/base_tick.ts](base/base_tick.ts); `Base` only applies their results to Memory and the
  game.

- **Tasks** ([tasks/](tasks/)): A task is a single goal, such as harvesting a source, that owns
  some creeps and decides what they do. A task has two parts:
  - **Saved state**: a `TaskMemory` entry in `Memory.tasks[baseRoomName]` with a unique name
    (from `Memory.nextTaskId`), its type, and any type-specific fields like `sourceId`.
    [tasks/task_store.ts](tasks/task_store.ts) reads and writes these.
  - **Behavior**: a stateless `TaskDefinition` for its type, looked up in
    [tasks/registry.ts](tasks/registry.ts). All three functions are pure:
    - `getSpawnRequests(task, ctx)`: one request (priority and body pattern) per creep the task
      still needs.
    - `decide(task, ctx)`: intents for the task's creeps this tick, including `setCreepMemory`
      for state changes.
    - `isDone(task, ctx)`: whether the task is finished and should be removed.

  Since tasks are plain memory plus stateless definitions, nothing needs rebuilding after a
  global reset.

  **Creeps and tasks are linked one way**: `creep.memory.taskName` is the only saved link, and
  tasks never store their creeps. Each tick, [tasks/creep_assignment.ts](tasks/creep_assignment.ts)
  groups the base's creeps by `taskName` and gives each task its list, including creeps still
  spawning. Dead creeps simply drop out. **Orphans** (a `taskName` that matches no task, e.g.
  after a task finishes) fill the highest-priority open spawn request whose *minimal* body they
  have (so a 1-`WORK` harvester can become a hauler, but not a miner), taking that request's
  initial memory. Otherwise creeps with `WORK` and `CARRY` join the upgrade task, and the rest
  are recycled at a spawn.

  Every task gets a `TaskContext`: the world and home room snapshots, its creeps, the base's
  memory and other tasks, an economy summary ([tasks/economy.ts](tasks/economy.ts)) and room
  intel.

  Current task types:

  | Task | Creeps | What they do |
  |---|---|---|
  | `mine` (one per source) | harvesters (at most 2, never more than the source's open tiles), then 1 miner (`5×WORK + MOVE`) once affordable, replaced early | see "Mining" below |
  | `haul` (once a source has a container or a miner) | sized to those sources × path distance | collect from source containers and dropped energy; deliver |
  | `upgrade` | WORK parts sized to spare income (+ storage bonus), at least 1 | gather energy, upgrade the controller |
  | `build` (while there are sites) | 1–3, by remaining work | gather energy, build the most important site (build priority order), closest among equals; done when none are left |
  | `repair` | 1 | repair critical structures, then damaged ones, then the weakest wall/rampart below its RCL target; else upgrade |
  | `scout` (routine, from RCL 2) | one `[MOVE]`, only while a nearby room's intel is stale | visit rooms within 2 exits whose intel is missing or old, closest first |
  | `scout` (per scout directive) | one `[MOVE]` | go to the directive's room until it's been seen |
  | `remoteMine` (one per remote mine directive) | a miner per source, haulers, and (from 1300 capacity) a reserver | mine the remote room's sources and haul the energy home; see "Remote mining" below |
  | `claim` (one per claim directive) | a claimer, then 2 pioneers | claim the controller (clearing someone else's reservation first), then build the first spawn |
  | `squad` (one per attack, defend or escort directive) | melee, ranged and healers by mission and size | rally, move out together, fight; see "Military" below |

  "Gather energy" means: ruins, then storage, then the controller container, then other
  containers, then harvesting the source with the most free tiles. A source's tiles are taken by
  creeps next to it or heading to it; if every source is full, the creep waits rather than
  crowding in. "Deliver" means: spawns and extensions,
  then towers, then the controller container, then storage.

  **Mining** ([tasks/mine_task.ts](tasks/mine_task.ts)): each source has one `mine` task for its
  whole life, which adapts as the base grows:
  - Before a miner is affordable (< 550 energy capacity): harvesters that harvest and walk the
    energy back. Once the source's container exists (placed from RCL 2) and the base has a
    hauler, one harvester parks on the container and keeps harvesting: when it's full, the extra
    drops into the container under it.
  - Once a miner is affordable: one miner on the container tile (drop mining without one). When
    the miner is working, the task releases its harvesters, which are adopted as haulers.
  - On collapse (nobody at the source and not enough energy for a miner): one urgent harvester
    to recover with.

  **Remote mining** ([tasks/remote_mine_task.ts](tasks/remote_mine_task.ts)):
  - Unreserved: 3-`WORK` miners drop mine (sources give 5 energy/tick); haulers are sized from
    the measured path length to each source.
  - Reserved (a `[CLAIM, MOVE]×2` reserver from 1300 capacity, sent whenever the reservation is
    below 3000 ticks): sources give 10/tick, miners are `5W 1C 3M`, and each source gets a
    container that its miner builds and repairs.
  - Roads ([tasks/remote_roads.ts](tasks/remote_roads.ts)): none while the remote is new; swamp
    tiles once it has held for 3000 ticks with spare income; all tiles once it's also reserved.
    The route is planned once by the base survey. Haulers then carry a `WORK` part and build or
    repair road tiles as they walk.
  - Hostiles, or an Invader core in the room, pause the remote: no spawning, and creeps go home
    until it has been clear for a while. NPC invaders and cores also trigger an automatic
    `defend` directive (see "Military" below). A leftover reservation by someone else is cleared
    by the reserver with `attackController`.

  **Remote rooms** ([tasks/remote_selection.ts](tasks/remote_selection.ts)): once a miner works one of the base's sources, with
  ≥ 800 energy capacity (2 rooms from 1300), the empire planner picks adjacent rooms from intel
  that are unowned, not reserved by others, without source keepers and without recent hostiles,
  and creates automatic remote-mining directives for them. Manual remote directives count
  against the same limit.

- **Spawning** ([spawning/](spawning/)): `planSpawns` gives idle spawns the highest-priority
  requests from all tasks. A body is a fixed `base` (e.g. a miner's 5 `WORK` + `MOVE`) plus a
  repeated pattern, sized to the room's full energy capacity, or to the energy available now for
  urgent requests. If the top request isn't affordable yet, spawning waits rather than spending
  energy on lower-priority requests. Requests the room can never afford are skipped.

- **Room intel** ([intel/](intel/)): `Headquarters` records every visible room into
  `Memory.intel` at most every 25 ticks (sources, controller owner/reservation, keeper lairs,
  hostiles and when they were last seen), so decisions can use rooms without vision.

- **Defense** ([defense/](defense/)): towers attack healers first, then attackers; heal my damaged
  creeps; and, keeping 500 energy in reserve, repair damaged structures and then the weakest
  wall/rampart below its RCL target. Safe mode activates when dangerous hostiles reach a spawn or
  the controller and the towers can't cope.

- **Base survey** ([base/survey.ts](base/survey.ts)): measures things that need game APIs once and
  saves them in `BaseMemory`: path lengths from the spawn to each source and each remote source
  (for hauler counts and miner replacement timing), the controller container's tile, and a road
  route to each remote room.

- **Directives** ([directives/](directives/)): empire-level goals, such as "remote mine W1N2",
  "scout W5N5", "claim W2N3" or "attack W3N3", saved in `Memory.directives` under short ids (`d3`). They come
  from three places and all take the same path, directive → a task in the assigned base → intents:
  - **Automatic**: each statically mining base gets remote-mining directives for good adjacent
    rooms (see "Remote rooms" above), and a `defend` directive when NPC invaders show up in one.
  - **Console**: `cmd.remoteMine(room)`, `cmd.scout(room)`, `cmd.claim(room, { x, y })`,
    `cmd.attack(room, { size })`, `cmd.defend(room, { size })`, `cmd.escort(id, { size })`,
    `cmd.list()`, `cmd.cancel(id)` and `cmd.help()` ([directives/commands.ts](directives/commands.ts)).
    Each room command takes an optional `{ base }`; otherwise the closest suitable base takes it.
  - **Flags**: yellow = remote mine, white = scout, purple = claim (the first spawn goes on the
    flag). Removing the flag cancels the directive, and the flag is removed when it's done.

  Each tick, `planDirectives` ([directives/planning.ts](directives/planning.ts)) turns flags into
  directives, finishes directives whose goal is met or impossible, assigns pending ones to the
  closest base within 10 rooms (claims also need spare GCL and 650 energy capacity, military
  directives 550), picks claims' spawn positions from terrain, and creates the automatic
  remote-mining and defend directives. A directive you cancel isn't recreated automatically.
  Bases run one task per active directive assigned to them (`remoteMine`, a `scout` with a
  target room, `claim`, or a `squad`) and drop the task when the directive ends. Routine base work (mining, hauling, upgrading, building, repairing and the
  adjacent-room scout) stays automatic per base, without directives.

  **Claiming**: a claimer (`[CLAIM, MOVE]`) claims the controller; two pioneers then place and
  build the first spawn. When the spawn exists, `Headquarters` creates the new base, the directive
  is done, and the claim's creeps in that room are handed over to the new base.

- **Military** ([military/](military/)): attack, defend and escort directives each run a `squad`
  task ([military/squad_task.ts](military/squad_task.ts)).
  - **Composition** (`squadComposition`): attack squads are one healer per 3 members, the rest
    alternating melee and ranged (default size 4). Defend and escort squads are ranged plus a
    healer (default size 2; automatic defense sizes to the threat, 2–4).
  - **Movement**: members gather at the rally point next to the home spawn until the squad is
    complete, then move out together. The leader (fighters before healers) heads for the
    target; followers stay next to it; the leader waits for members more than 3 tiles behind,
    except on room-edge tiles. Below 40% total health the squad retreats to the rally point and
    re-engages at 90%. Replacements for lost members go straight to the squad.
  - **Engagement** ([military/combat.ts](military/combat.ts), pure): targets are healers first,
    then ranged, melee and other creeps (never Source Keepers), then structures (Invader cores
    and towers, spawns, extensions, the rest). Attack squads may hit any hostile structure,
    defend squads only Invader cores, escorts none. Melee closes in; ranged keeps range 3 and
    mass attacks when crowded; healers heal the most damaged member. Escorts engage hostiles
    within 6 tiles of the creeps they guard. Everyone fights back against hostiles within 3.
  - **Done**: attack once the room is seen with no hostile structures or combat creeps; defend
    once it has been clear for 100 ticks; escort when the escorted directive ends. Leftover squad
    creeps are recycled.
  - Automatic defense is only against NPCs (`Invader`); player hostiles need a manual
    `cmd.defend`, so the base doesn't start fights it can't win.

- **Visuals / HUD** ([visuals/](visuals/), design in [docs/VISUALS.md](../docs/VISUALS.md)):
  `cmd.visuals('W1N1')` draws panels in the room's top-left corner for 200 ticks: header (RCL,
  mining mode, energy, CPU), tasks (each task's creeps out of wanted, their states and lowest
  TTL), spawn queue (priority order, with what's spawning and what it's waiting for) and economy
  (estimates for now). `cmd.visuals(room, 'off' | 'all' | [panels])` changes it; `cmd.visuals()`
  lists rooms with it on. The base tick builds a plain `BaseReport`
  ([base/base_report.ts](base/base_report.ts)) only when visuals are on; pure functions turn it
  into panels and draw commands, and `visuals/render.ts` is the only code calling `RoomVisual`.

- **Base layout planning** ([pathfinding/](pathfinding/), design in
  [docs/BASE_LAYOUT.md](../docs/BASE_LAYOUT.md)): when a base is created, it plans every
  structure each RCL allows from the initial spawn, terrain, sources, controller and mineral: a
  3x3 core, a grid of 14 stamps (12 extension stamps, a tower stamp and a spawn stamp), a 10-lab
  stamp, roads and containers to the sources, controller and mineral, and links. The pure steps
  are `planLayoutFromTerrain` and the stamps in `pathfinding/stamps.ts`; `planBaseLayout` adds the
  PathFinder steps and runs the checks in `pathfinding/layout_checks.ts`. The layout is stored in
  `Memory.bases_v3[room].baseLayout` as `{ [level]: "x_y_structure"[] }`, with `layoutVersion`
  and `layoutWarnings`. A base with an older `layoutVersion` replans on its next tick
  ([base/layout.ts](base/layout.ts), one base per tick), keeping everything built.
  `cmd.layout(room)` prints the plan and shows it in the room.

## Snapshots and intents

Decision logic is kept separate from the game API so it can be unit tested with plain data:

```
Room ──► buildRoomSnapshot ──► RoomSnapshot ──► decide (pure) ──► Intent[] ──► executeIntents ──► Game API
```

- **Snapshots** ([snapshot/](snapshot/)): `buildRoomSnapshot(room)` copies a room's state for this
  tick (controller, sources, structures, construction sites, ruins, creeps present, hostile
  creeps) into plain, read-only objects. A `WorldSnapshot` ([snapshot/world.ts](snapshot/world.ts))
  gives access to every visible room (built on first request and cached for the tick) and lists
  all my creeps, in every room. [snapshot/queries.ts](snapshot/queries.ts) has helpers like
  `getRange` and `findClosestByRange`. Add fields to the snapshot as decision logic needs them.
- **Intents** ([intents/](intents/)): plain descriptions of actions (`harvest`, `move`, `spawn`,
  `recycle`, `towerAttack`, `createConstructionSite`, `setCreepMemory`, ...) that reference
  objects by ID or creep name. `executeIntents` is the only code that calls the game's action
  APIs or writes creep memory. `actOrApproach` returns the action if the creep is in range, and
  otherwise a move toward the target. Failed intents are logged as one summary line per base per
  tick (routine `ERR_TIRED`/`ERR_BUSY` are skipped).
- **Decisions** are pure functions from snapshots to intents: task definitions, `planSpawns`,
  `planConstruction` ([base/construction.ts](base/construction.ts)) and `decideTowerIntents`
  ([defense/tower_logic.ts](defense/tower_logic.ts)).

## Tick flow ([main.ts](main.ts))

On global reset (code upload or server restart):
- Memory is migrated or initialized (`MemoryUtil`). On a fresh respawn (one spawn, no creeps),
  memory is wiped first.
- The `Headquarters` singleton is created.

Each tick:
1. Re-initialize memory if the version changed. If the CPU bucket is full, generate a pixel.
2. Delete memory of dead creeps.
3. `setUpBases`: create a `Base` for any newly owned room with a spawn.
4. Build the `WorldSnapshot` and record intel for visible rooms that need it.
5. Plan directives (`planDirectives`), save the changes, remove finished flags and hand finished
   claims' creeps to their new base.
6. Group creeps by base and run each base's tick (after surveying anything missing from its
   memory):
   1. **Reconcile tasks** (`reconcileTasks`): remove finished or unknown tasks, then create the
      ones the base needs but doesn't have, switching mining modes and adding remote rooms (see
      `planTasks`).
   2. **Decide** (`decideBaseIntents`), collecting intents from each step:
      1. Assign orphaned creeps to tasks, or recycle them.
      2. Spawn creeps for the highest-priority open requests.
      3. Each task directs its creeps.
      4. Safe mode if the base is overrun; towers attack, heal and repair.
      5. Every 25 ticks, and right after a controller level-up, place construction sites for
         unbuilt structures from every unlocked layout level (except `NOT_YET_BUILT` types:
         links, labs, terminal and others nothing uses yet), in
         build priority order (spawn → extensions → towers → containers → storage → … → roads →
         walls/ramparts), with roads only from RCL 3. At most 5 sites at a time for each
         structure type and everything more important than it, so less important sites never
         block more important ones.
   3. **Execute** all intents with a single `executeIntents` call, and save the base's memory
      changes.

## Memory

Top-level `Memory` fields are typed in [global_types.d.ts](global_types.d.ts). Everything stored
in Memory must survive `JSON.stringify` (no `Map`, `Set` or class instances).

- `memoryVersion`: the last migration applied. To change the schema, append a migration with the
  next version number to `MIGRATIONS` in [memory/migrations.ts](memory/migrations.ts). Migrations
  run once each, in order, on global reset. Never edit one that has been deployed.
- `bases_v3[roomName]`: base layout (`baseLayout`, `layoutVersion`, `layoutWarnings`,
  `controllerContainer`) and construction planning state, plus survey results
  (`sourceDistances`, `remoteDistances`, `remoteRoutes`).
- `tasks[baseRoomName]`: the saved state of each of the base's tasks.
- `nextTaskId`: counter for unique task names.
- `creeps[name]`: `taskName` (its task), `baseRoomName` (its base), and task state: `state`
  (gathering/working), `targetId` (what it's currently working on), `role` (miner/hauler, for
  remote mining) and `targetRoom` (for scouts).
- `intel[roomName]`: what we know about rooms we've seen (see [intel/types.ts](intel/types.ts)),
  including Invader cores, hostile structures and who owns the hostile creeps.
- `visuals[roomName]`: rooms with the HUD on: `{ panels, until }`.
- `directives[id]`, `nextDirectiveId`: empire-level goals (see [directives/types.ts](directives/types.ts)).
  Done directives are deleted after 5000 ticks, cancelled ones after 50000.
- `log`: buffered log lines for `Logger`.

## Testing

Tests use Jest with `screeps-jest`, which provides Screeps globals and constants.
[testing/pathfinding/](testing/pathfinding/) contains a TypeScript port of the native Screeps
PathFinder, so pathfinding-dependent code (like base layout planning) can be tested against real
room terrain from [pathfinding/testdata/](pathfinding/testdata/).

Test helpers:
- `aRoom()` ([testing/builders/room_snapshot_builder.ts](testing/builders/room_snapshot_builder.ts)):
  builds a `RoomSnapshot` with defaults, so a test only sets what it cares about, e.g.
  `aRoom().withRcl(3).withTower(25, 25).withHostile(30, 30).build()`. Use it to test decisions.
  `energy(amount, capacity)` builds stores, and `worldOf(rooms, { exits })`
  ([testing/builders/world.ts](testing/builders/world.ts)) wraps rooms in a `WorldSnapshot`.
  `aTaskContext(home, ...)` and `aBaseMemory(...)` ([testing/builders/context.ts](testing/builders/context.ts))
  build task contexts with defaults.
- `createTestMemory()` / `installTestMemory()` ([testing/memory.ts](testing/memory.ts)): a fresh,
  migrated `Memory` object.
- `screeps-jest` mocks (`mockInstanceOf`, `mockGlobal`, `mockStructure`) for testing adapters
  that touch game objects, like `buildRoomSnapshot` and `executeIntents`. Mocks throw on unmocked
  property access by default.

Prefer testing decisions against snapshots. Only adapters should need game object mocks.

- `npm test`: run tests
- `npm run check`: typecheck and test
- `npm run dryrun`: build `dist/main.js` without uploading
