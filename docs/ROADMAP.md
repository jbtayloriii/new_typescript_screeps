# Roadmap

Goals:
1. A clear, current description of how the code works ([src/README.md](../src/README.md)).
2. As much logic as possible covered by unit tests.
3. Fully automated by default, with the option to give manual orders (e.g. "send an army to
   W3N3") through the same system the automation uses.

## Target architecture

### Pure decisions, thin game adapter

```
Game/Memory ──► Snapshot (plain data) ──► Decide (pure functions) ──► Intents ──► Executor ──► Game API
```

- **Snapshot**: a read-only, plain-data view of each room for this tick (structures, creeps,
  sources, energy, RCL, hostiles), built by one adapter that reads `Game`.
- **Decide**: functions like `planSpawns(snapshot, tasks)` and `decideHarvest(creep, snapshot)`
  that return **intents**, e.g. `{ type: 'harvest', creep, target }` or
  `{ type: 'spawn', body, memory, priority }`.
- **Executor**: the only code that calls `creep.harvest()`, `spawn.spawnCreep()`, etc.

Decision logic is tested with plain objects and no Screeps mocks. A few `screeps-jest` tests
cover the snapshot and executor adapters.

### Tasks are the only unit of work

A task is serializable state plus pure functions:
- `getSpawnRequests(snapshot)`: bodies, priorities and initial memory for the creeps it needs.
- `decide(snapshot, creeps)`: intents for its creeps this tick.
- `isDone(snapshot)`: when it can be removed.

The link between creeps and tasks is saved in one direction only: `creep.memory.taskName` is the
single record of which task a creep belongs to. Tasks never save a list of their creeps. Each
tick, creeps are grouped by `taskName` from `Game.creeps` (wherever they are) and each task is
handed its list. That way creep deaths, failed spawns and deleted tasks can't leave the two sides
out of sync.

Each base has one spawn queue ordered by task priority. Creep roles (`CreepHandler`,
`CreepType`) are removed.

### Directives: one path for automation and manual commands

A **directive** is a persistent, high-level goal in `Memory.directives` ("grow the economy",
"remote-mine W1N2", "attack W3N3 with 4 melee"). Directives create tasks.

- **Automatic**: empire and base planners create directives from game state.
- **Manual** (later): console commands (`cmd.attack('W3N3', { size: 4 })`, `cmd.list()`,
  `cmd.cancel(id)`) and a flag color convention both create directives.

Automated and manual directives go through the same directive → tasks → intents path, so
anything you can order by hand can later be automated, and the other way round.

### One Memory module

A single typed schema with only JSON-safe types, a version number with migration steps, and all
access through a small module so tests can use a fake.

## Phases

### Phase 0: Fix bugs and document current behavior ✅
- [x] Base layout was stored as a `Map` in Memory (serializes to `{}`); now a plain object.
- [x] `Memory.sources` was never initialized.
- [x] `Base` kept `Room` and `BaseMemory` references across ticks; now looked up each tick.
- [x] Spawn queue called `shift()` twice on a successful spawn.
- [x] Layout replanning ran every tick and never retried failed sites; now every 100 ticks
      (and on level-up), re-applying all unlocked levels.
- [x] `TaskFactory.removeTask` used the wrong key; task names could be reused after removal.
- [x] `Base.plan` added a new orphaned task to Memory after every global reset; removed until
      phase 2.
- [x] Removed unused room prototype code that stored a `Map` in Memory.
- [x] Moved the tower loop from `main.ts` into `Base`.
- [x] Memory migration to v2.5 (with tests) that clears the broken data.
- [x] Rewrote [src/README.md](../src/README.md) to describe what actually runs.

### Phase 1: Testing groundwork ✅
- [x] Snapshot types and a `buildRoomSnapshot(room)` adapter, plus range queries.
- [x] `aRoom()` snapshot builder for tests.
- [x] Numbered memory migrations (replacing the version string) and `createTestMemory()`.
- [x] Intent types, an executor, and `actOrApproach` (with tests using `screeps-jest` mocks).
- [x] Testable pixel step (also no longer crashes on private servers without `generatePixel`).
- [x] Towers moved from prototypes to `decideTowerIntents(snapshot)`, the first logic to use
      snapshot → intents → executor.
- [x] Jest resolves `baseUrl` imports (`modulePaths`), so code using imports like
      `logging/logger` can be tested.
- Deferred to phase 2: typed Memory accessors. Add them for task memory once the task
  interface exists, rather than guessing their shape now.

### Phase 2: Switch to tasks
- [ ] New `Task` interface (`getSpawnRequests` / `decide` / `isDone`) with serializable state.
      Tasks must not keep game objects or Memory references across ticks (e.g. the current
      `BasicUpgradeTask` keeps a `StructureController`).
- [ ] Load tasks from Memory on global reset.
- [ ] One-way creep → task link: `creep.memory.taskName` is the only saved link, and task memory
      never lists creeps. Each tick, group `Game.creeps` by `taskName` (all rooms, not only
      creeps physically in the base) and give each task its creeps. Unit-test the grouping as a
      pure function. Cases to cover:
      - A creep that is still spawning counts toward its task right away, so the task doesn't
        request a duplicate.
      - Dead creeps simply drop out; nothing to clean up.
      - Orphaned creeps (a `taskName` that matches no task) are reassigned to a compatible task
        in their base, or recycled at a spawn.
      - Moving a creep to another task is a single write to `memory.taskName`.
- [ ] Port harvest, upgrade, build and repair to tasks, with unit tests for each state machine and
      its spawn requests.
- [ ] Spawn queue with priorities, and body sizing based on available and capacity energy.
- [ ] Route every game action in `Base` through intents. Each base tick becomes: build one
      snapshot → collect intents from pure steps → call `executeIntents` once:
      - `planConstruction(snapshot, baseMemory)` → `createConstructionSite` intents (replaces
        the direct calls in `Base.plan`).
      - `planSpawns(snapshot, tasks)` → `spawn` intents (replaces the direct `spawnCreep` in
        `Base.processResourceRequests`).
      - `task.decide(snapshot)` → creep intents.
      - `decideTowerIntents(snapshot)` stays a base-level step, not a task (towers don't own or
        spawn creeps).
      This leaves `Base` putting the steps together and gives one place to log failed intents,
      measure CPU, and resolve conflicts (e.g. two intents for the same creep).
- [ ] Delete `creeps/types/*`, `CreepHandler`, `CreepHandlerFactory`, `EntityHandler`,
      `SimpleBasePlanner` (this also removes the circular imports Rollup warns about).
- [ ] Fix `returnResourceToStructure`, which picks a new target every tick instead of keeping
      the saved one.

### Phase 3: Full economy automation
- [ ] Base planner that sets up tasks for each RCL: static miners and containers, haulers,
      builders paced by the number of construction sites, upgraders sized to energy income.
- [ ] Construction placement respects the construction-site cap and builds in priority order.
- [ ] Defense: tower targeting and repair thresholds as pure functions; safe mode when the base
      is under threat.
- [ ] Remove `Base`'s remaining direct `room.find` calls in favor of the snapshot.

### Phase 4: Directives and manual commands
- [ ] `Memory.directives`: the directive type, lifecycle (created → active → done or
      cancelled) and an empire-level loop that turns directives into tasks.
- [ ] Rework the automatic planners from phase 3 to create directives.
- [ ] Console API: `cmd.list()`, `cmd.cancel(id)`, and a command per directive type.
- [ ] Flag parser (a color convention mapped to directive types).
- [ ] First directives: `RemoteMine`, `Scout`, `Claim`.

### Phase 5: Military
- [ ] `Attack`, `Defend` and `Escort` directives.
- [ ] Groups of creeps that move together, with formation and rally points.
- [ ] Target selection and engagement logic as pure, tested functions.

### Phase 6: Observability (can be done at any point)
- [ ] Per-tick CPU and stats recorded in Memory.
- [ ] Room visuals for active directives, tasks and spawn queue (building on `visuals/`).
- [ ] Use `Logger` consistently in place of `console.log`; enable daily `Logger.report()`.

### Later / optional
- [ ] Simulation tests over multiple ticks with `screeps-server-mockup`, if unit tests miss bugs
      in how the parts fit together.
