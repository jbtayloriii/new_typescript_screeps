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
  | `harvest` (one per source, bootstrap) | 2, first one urgent | harvest their source, deliver energy; upgrade if everything is full |
  | `mine` (one per source, static) | 1 miner (`5×WORK + MOVE`), replaced early before it dies | stand on the source's container tile and harvest; drop mine without a container, and place its site right away |
  | `haul` | sized to mine count × path distance | collect from mine containers and dropped energy; deliver |
  | `upgrade` | WORK parts sized to spare income (+ storage bonus), at least 1 | gather energy, upgrade the controller |
  | `build` (while there are sites) | 1–3, by remaining work | gather energy, build the closest site; done when none are left |
  | `repair` | 1 | repair critical structures, then damaged ones, then the weakest wall/rampart below its RCL target; else upgrade |
  | `scout` (routine, from RCL 2) | one `[MOVE]`, only while a neighbor's intel is stale | visit the adjacent room with the oldest intel |
  | `scout` (per scout directive) | one `[MOVE]` | go to the directive's room until it's been seen |
  | `remoteMine` (one per remote mine directive) | a 3-`WORK` miner per source, haulers | drop mine the remote room's sources, haul the energy home; retreat while hostiles are around |
  | `claim` (one per claim directive) | a claimer, then 2 pioneers | claim the controller, then build the first spawn |

  "Gather energy" means: ruins, then storage, then the controller container, then other
  containers, then harvesting the least crowded source. "Deliver" means: spawns and extensions,
  then towers, then the controller container, then storage.

  **Mining modes** (`chooseMiningMode` in [tasks/task_planning.ts](tasks/task_planning.ts)): a
  base starts with `harvest` tasks and switches each source to a `mine` task (plus one `haul`
  task) once it can afford a full miner (550 energy). Leftover harvesters are adopted as haulers.
  It only goes back to `harvest` on collapse: no living miner and not enough energy for one.
  Containers aren't part of the decision, so losing one never flips modes.

  **Remote rooms** ([tasks/remote_selection.ts](tasks/remote_selection.ts)): in static mode with
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
  saves them in `BaseMemory`: path lengths from the spawn to each source (for hauler counts and
  miner replacement timing) and the controller container's tile.

- **Directives** ([directives/](directives/)): empire-level goals, such as "remote mine W1N2",
  "scout W5N5" or "claim W2N3", saved in `Memory.directives` under short ids (`d3`). They come
  from three places and all take the same path, directive → a task in the assigned base → intents:
  - **Automatic**: each statically mining base gets remote-mining directives for good adjacent
    rooms (see "Remote rooms" above).
  - **Console**: `cmd.remoteMine(room)`, `cmd.scout(room)`, `cmd.claim(room, { x, y })`,
    `cmd.list()`, `cmd.cancel(id)` and `cmd.help()` ([directives/commands.ts](directives/commands.ts)).
    Each takes an optional `{ base }`; otherwise the closest suitable base takes it.
  - **Flags**: yellow = remote mine, white = scout, purple = claim (the first spawn goes on the
    flag). Removing the flag cancels the directive, and the flag is removed when it's done.

  Each tick, `planDirectives` ([directives/planning.ts](directives/planning.ts)) turns flags into
  directives, finishes directives whose goal is met or impossible, assigns pending ones to the
  closest base within 10 rooms (claims also need spare GCL and 650 energy capacity), picks claims'
  spawn positions from terrain, and creates the automatic remote-mining directives. A directive
  you cancel isn't recreated automatically. Bases run one task per active directive assigned to
  them (`remoteMine`, a `scout` with a target room, or `claim`) and drop the task when the
  directive ends. Routine base work (mining, hauling, upgrading, building, repairing and the
  adjacent-room scout) stays automatic per base, without directives.

  **Claiming**: a claimer (`[CLAIM, MOVE]`) claims the controller; two pioneers then place and
  build the first spawn. When the spawn exists, `Headquarters` creates the new base, the directive
  is done, and the claim's creeps in that room are handed over to the new base.

- **Base layout planning** ([pathfinding/](pathfinding/)): When a base is first created, it
  computes a full layout for controller levels 1–8 from the initial spawn position, terrain and
  sources: a 3x3 core, star-shaped extension stamps, and roads/containers to sources. The layout
  is stored in `Memory.bases_v3[room].baseLayout` as `{ [level]: "x_y_structure"[] }`.

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
         unbuilt structures from every unlocked layout level (plus the controller container), in
         build priority order (spawn → extensions → towers → containers → storage → … → roads →
         walls/ramparts), at most 5 sites per room at a time.
   3. **Execute** all intents with a single `executeIntents` call, and save the base's memory
      changes.

## Memory

Top-level `Memory` fields are typed in [global_types.d.ts](global_types.d.ts). Everything stored
in Memory must survive `JSON.stringify` (no `Map`, `Set` or class instances).

- `memoryVersion`: the last migration applied. To change the schema, append a migration with the
  next version number to `MIGRATIONS` in [memory/migrations.ts](memory/migrations.ts). Migrations
  run once each, in order, on global reset. Never edit one that has been deployed.
- `bases_v3[roomName]`: base layout and construction planning state, plus survey results
  (`sourceDistances`, `controllerContainer`).
- `tasks[baseRoomName]`: the saved state of each of the base's tasks.
- `nextTaskId`: counter for unique task names.
- `creeps[name]`: `taskName` (its task), `baseRoomName` (its base), and task state: `state`
  (gathering/working), `targetId` (what it's currently working on), `role` (miner/hauler, for
  remote mining) and `targetRoom` (for scouts).
- `intel[roomName]`: what we know about rooms we've seen (see [intel/types.ts](intel/types.ts)).
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
