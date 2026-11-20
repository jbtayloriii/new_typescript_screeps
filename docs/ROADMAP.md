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

### Phase 2: Switch to tasks ✅
- [x] `TaskDefinition` interface (`getSpawnRequests` / `decide` / `isDone`), all pure, over
      serializable `TaskMemory`. Definitions are stateless and looked up by type in a registry,
      so tasks hold no game objects or Memory references across ticks.
- [x] Load tasks from Memory on global reset. With stateless definitions there is nothing to
      rebuild: `Memory.tasks` is read each tick.
- [x] One-way creep → task link: `creep.memory.taskName` (plus `baseRoomName` for the owning
      base) is the only saved link. Each tick, creeps are grouped by base, then by task, from all
      rooms. Tested cases:
      - Spawning creeps count toward their task right away.
      - Dead creeps drop out (their memory is deleted each tick).
      - Orphans fill the highest-priority open spawn request their body can handle, else join
        the upgrade task, else are recycled at a spawn.
      - Moving a creep to another task is one `setCreepMemory` intent.
- [x] Harvest (one task per source), upgrade, build and repair tasks on a shared
      gather → work loop, with tests for each task's spawn requests, decisions and `isDone`.
- [x] Spawn queue with priorities. Bodies are sized to energy capacity, or to the energy
      available now for urgent requests (the first harvester of each source). The top request
      blocks lower ones until it's affordable.
- [x] Every game action in `Base` goes through intents, with one `executeIntents` call per base
      tick: `reconcileTasks` → `decideBaseIntents` (orphans → spawns → tasks → towers →
      construction) → execute. New intent kinds: `setCreepMemory` and `recycle`. Failed intents
      are logged as one summary line per base per tick.
- [x] Deleted the role system (`creeps/`, `CreepHandler*`, `EntityHandler`, `SimpleBasePlanner`,
      base planner stubs), the old task classes, the power-harvester memory (`Memory.sources`,
      `MemoryCache`) and the unused prototypes. Rollup's circular-import warnings are gone.
- [x] Energy delivery keeps its saved target while it has room (the old
      `returnResourceToStructure` re-picked every tick).
- [x] Migration 2: existing creeps become orphans of their base (from `owningRoomId`) and are
      adopted into tasks on the first tick; old task memory and power-harvesting memory are
      dropped.
- [x] Construction skips spots already built or with a site, so it no longer issues failing
      intents every replan.
- Changed from the old behavior: 2 harvesters per source instead of 1 in total; tasks run in
      the base's room only (remote work comes with phase 4 directives).

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
