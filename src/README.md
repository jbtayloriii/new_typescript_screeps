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
  after a task finishes) fill the highest-priority open spawn request their body can handle,
  otherwise join the upgrade task, otherwise are recycled at a spawn.

  Current task types (all use the gather → work loop in [tasks/behaviors.ts](tasks/behaviors.ts):
  gather energy until full, then work until empty):

  | Task | Creeps | Gathers from | Work |
  |---|---|---|---|
  | `harvest` (one per source) | 2, first one urgent | its source | deliver to spawns/extensions, then towers, then storage; upgrade if all are full |
  | `upgrade` | 3 | ruins, storage, containers, then sources | upgrade the controller |
  | `build` (while there are sites) | 1 | same | build the closest site; done when none are left |
  | `repair` | 1 | same | repair critical (≤100 hits), then damaged (≤10k hits) structures; else upgrade |

- **Spawning** ([spawning/](spawning/)): `planSpawns` gives idle spawns the highest-priority
  requests from all tasks. Bodies repeat the request's pattern, sized to the room's full energy
  capacity, or to the energy available now for urgent requests. If the top request isn't
  affordable yet, spawning waits rather than spending energy on lower-priority requests.

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
4. Build the `WorldSnapshot`, group creeps by base, and run each base's tick:
   1. **Reconcile tasks** (`reconcileTasks`): remove finished or unknown tasks, then create the
      ones the base needs but doesn't have (a harvest task per source, upgrade, build while
      there are construction sites, repair).
   2. **Decide** (`decideBaseIntents`), collecting intents from each step:
      1. Assign orphaned creeps to tasks, or recycle them.
      2. Spawn creeps for the highest-priority open requests.
      3. Each task directs its creeps.
      4. Each tower attacks the closest hostile, otherwise repairs the closest structure missing
         at least 1k hits and under 10k hits.
      5. Every 100 ticks, and right after a controller level-up, place construction sites for
         every unlocked layout level that isn't already built or placed.
   3. **Execute** all intents with a single `executeIntents` call, and save the base's memory
      changes.

## Memory

Top-level `Memory` fields are typed in [global_types.d.ts](global_types.d.ts). Everything stored
in Memory must survive `JSON.stringify` (no `Map`, `Set` or class instances).

- `memoryVersion`: the last migration applied. To change the schema, append a migration with the
  next version number to `MIGRATIONS` in [memory/migrations.ts](memory/migrations.ts). Migrations
  run once each, in order, on global reset. Never edit one that has been deployed.
- `bases_v3[roomName]`: base layout and construction planning state.
- `tasks[baseRoomName]`: the saved state of each of the base's tasks.
- `nextTaskId`: counter for unique task names.
- `creeps[name]`: `taskName` (its task), `baseRoomName` (its base), and task state: `state`
  (gathering/working) and `targetId` (what it's currently working on).
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
  `energy(amount, capacity)` builds stores, and `worldOf(rooms)`
  ([testing/builders/world.ts](testing/builders/world.ts)) wraps rooms in a `WorldSnapshot`.
- `createTestMemory()` / `installTestMemory()` ([testing/memory.ts](testing/memory.ts)): a fresh,
  migrated `Memory` object.
- `screeps-jest` mocks (`mockInstanceOf`, `mockGlobal`, `mockStructure`) for testing adapters
  that touch game objects, like `buildRoomSnapshot` and `executeIntents`. Mocks throw on unmocked
  property access by default.

Prefer testing decisions against snapshots. Only adapters should need game object mocks.

- `npm test`: run tests
- `npm run check`: typecheck and test
- `npm run dryrun`: build `dist/main.js` without uploading
