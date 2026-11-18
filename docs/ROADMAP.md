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

Creeps store a `taskId`. Each base has one spawn queue ordered by task priority. Creep roles
(`CreepHandler`, `CreepType`) are removed.

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

### Phase 1: Testing groundwork
- [ ] Snapshot types and a `buildSnapshot(room)` adapter.
- [ ] Test helpers for snapshots, e.g. `aRoom().withRcl(3).withSources(2).withCreep(...)`.
- [ ] Memory module: typed accessors, numbered migrations, and a fake for tests.
- [ ] Intent types and an executor (with a test using `screeps-jest` mocks).
- [ ] Make the CPU and pixel logic in `main.ts` an injectable step.

### Phase 2: Switch to tasks
- [ ] New `Task` interface (`getSpawnRequests` / `decide` / `isDone`) with serializable state.
      Tasks must not keep game objects or Memory references across ticks (e.g. the current
      `BasicUpgradeTask` keeps a `StructureController`).
- [ ] Load tasks from Memory on global reset, and assign creeps by `taskId`.
- [ ] Port harvest, upgrade, build and repair to tasks, with unit tests for each state machine and
      its spawn requests.
- [ ] Spawn queue with priorities, and body sizing based on available and capacity energy.
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
