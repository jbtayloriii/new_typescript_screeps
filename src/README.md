# Typescript Screeps code

For planned work, see [docs/ROADMAP.md](../docs/ROADMAP.md).

## Overview

The empire is split into these pieces:

- **Headquarters** ([headquarters.ts](headquarters.ts)): A global singleton that creates a `Base`
  for each owned room with a spawn, and fans each phase of the tick out to every base.

- **Base** ([base/base.ts](base/base.ts)): A single owned room. It places construction sites from
  the base layout, decides which tasks the room needs, spawns creeps for those tasks, runs its
  tasks, and runs its towers. A `Base` object lives across ticks but stores only its room name;
  it looks up the `Room` and its `BaseMemory` fresh every tick (game objects and `Memory`
  references go stale between ticks).

- **Tasks** ([tasks/](tasks/)): A task is a single goal, such as harvesting a
  source, upgrading the controller, or building construction sites. It owns the creeps assigned
  to it and decides what they do. A task is made of:
  - **Serializable state** in `Memory.tasks[roomName]`: a unique name (from
    `Memory.nextTaskId`), its type, the room, and any task-specific fields. Tasks never keep
    game objects across ticks. They store IDs and look up the objects each tick.
  - **`getSpawnRequests()`**: the creeps the task still needs, each with a body, an initial
    memory and a spawn priority.
  - **`run()`**: runs a small state machine for each of its creeps (e.g. harvest until full,
    then deliver). Shared creep behaviors live in [creeps/actions/](creeps/actions/).
  - **`isDone()`**: whether the task is finished and can be removed.

  `TaskFactory` creates tasks and rebuilds them from Memory after a global reset. `TaskHandler`
  holds each room's task list and gives every task fresh references to its creeps each tick.
  Each creep stores the name of its task in `memory.taskName`.

  Current task types:
  - `BasicHarvestTask`: harvests energy and delivers it to spawns and extensions.
  - `BasicUpgradeTask`: gets energy and upgrades the controller.
  - `BasicBuildTask`: gets energy and builds construction sites in the room.
  - `BasicRepairTask`: gets energy and repairs damaged structures.

- **Base layout planning** ([pathfinding/](pathfinding/)): When a base is first created, it
  computes a full layout for controller levels 1–8 from the initial spawn position, terrain and
  sources: a 3x3 core, star-shaped extension stamps, and roads/containers to sources. The layout
  is stored in `Memory.bases_v3[room].baseLayout` as `{ [level]: "x_y_structure"[] }`.

## Tick flow ([main.ts](main.ts))

On global reset (code upload or server restart):
- Prototype extensions are installed (`prototypes/`).
- Memory is migrated or initialized (`MemoryUtil`). On a fresh respawn (one spawn, no creeps),
  memory is wiped first.
- The `Headquarters` and `TaskHandler` singletons are created, and every task in `Memory.tasks`
  is rebuilt by `TaskFactory`.

Each tick:
1. Re-initialize memory if the version changed. If the CPU bucket is full, generate a pixel.
2. Clean up memory of dead creeps. `TaskHandler` groups the living creeps by `taskName` and gives
   each task its current creeps.
3. `setUpBases`: create a `Base` for any newly owned room with a spawn.
4. `plan`: each base:
   - Every 100 ticks, and right away after a controller level-up, places construction sites for
     every layout level it has unlocked.
   - Creates any tasks the room needs that it doesn't have yet (e.g. a build task when there are
     construction sites).
5. `processResourceRequests`: each base collects spawn requests from all of its tasks and sorts
   them by priority. Each idle spawn spawns the highest-priority request, and the new creep's
   memory records which task it belongs to.
6. `run`: each base runs its tasks, which direct their creeps. Then it runs its towers (attack
   hostiles, otherwise repair damaged structures under 10k hits).
7. `cleanUp`: each base removes tasks whose `isDone()` is true, along with their memory.

## Memory

Top-level `Memory` fields are typed in [global_types.d.ts](global_types.d.ts). Everything stored
in Memory must survive `JSON.stringify` (no `Map`, `Set` or class instances).

- `currentMemoryVersion`: bump `CURRENT_MEMORY_VERSION` in [memory_util.ts](memory_util.ts) and
  add cleanup to `migrateMemory` when the schema changes.
- `bases_v3[roomName]`: base layout and construction planning state.
- `sources[sourceId]`: source metadata, used by power harvesting.
- `tasks[roomName]`: the state of each task in the room.
- `nextTaskId`: counter for unique task names.
- `creeps[name].taskName`: the task a creep belongs to.
- `log`: buffered log lines for `Logger`.

## Testing

Tests use Jest with `screeps-jest`, which provides Screeps globals and constants.
[testing/pathfinding/](testing/pathfinding/) contains a TypeScript port of the native Screeps
PathFinder, so pathfinding-dependent code (like base layout planning) can be tested against real
room terrain from [pathfinding/testdata/](pathfinding/testdata/).

- `npm test`: run tests
- `npm run check`: typecheck and test
- `npm run dryrun`: build `dist/main.js` without uploading

Most code still reads `Game`/`Memory` directly and is untested. Making the decision logic
testable is roadmap phase 1.
