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
- **Manual**: console commands (`cmd.remoteMine('W1N2')`, `cmd.list()`, `cmd.cancel(id)`) and a
  flag color convention both create directives.

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
      the base's room only (remote work comes with phase 3 scouting and remote mining).

### Phase 3: Full economy automation ✅ (except remote roads and reservers)
Goal: the economy runs efficiently at every RCL with no manual tuning, then grows beyond the
base room.

**1. Static mining**
- [x] `mine` task per source: one miner (`5×WORK + MOVE`, plus up to 2 extra `MOVE` when
      affordable) on the container tile the base layout plans next to the source.
- [x] The container is an optimization: without it the miner drop mines. Losing it never removes
      the mine task. A missing container (with no site) gets a site from the mine task right away.
- [x] Replacement miners spawn early (`ticksToLive` < spawn time + walk time, using the measured
      path length). The replacement mines from beside the tile while the old miner holds it.
- [x] ~~Mode switching between separate `harvest` and `mine` tasks.~~ **Replaced (after phase 4):**
      one `mine` task per source for its whole life. It runs harvesters (never more than the
      source's open tiles) until a 550-energy miner is affordable, then the miner, and releases the
      harvesters to become haulers. Once the source's container exists and the base has a hauler,
      a harvester parks on the container and keeps harvesting into it. On collapse (nobody at the
      source, not enough energy for a miner) it requests one urgent harvester. This removed the
      task churn at the switch, and the crowding when sources have few open tiles.
- [x] `droppedResources` and source `openSpots` added to the snapshot. Workers only harvest at a
      source with a free tile (creeps next to it or heading there take tiles), otherwise wait.

**2. Hauling**
- [x] `haul` task: collects from mine containers and dropped energy (claim-aware, so haulers
      spread out), delivers to spawns/extensions → towers → controller container → storage.
- [x] Hauler count from measured spawn → source path lengths (`base/survey.ts`, saved in
      `BaseMemory.sourceDistances`), capped at 2 per mine + 1.
- [x] The haul task starts once any source has a container or a miner, and only counts those
      sources. Released harvesters fill haul requests. Adoption checks the request's minimal
      body, so a small harvester can't be adopted as a miner.

**3. Size everything else to income**
- [x] `computeEconomy`: income from miners/harvesters/remote miners, upkeep of non-upgraders.
- [x] Upgraders: WORK budget from spare income (halved during construction), plus 1 WORK per 25k
      storage energy above 50k; at least 1, at most 15 at RCL 8. Bodies are capped to the WORK
      still missing.
- [x] Controller container: the survey picks a tile 2 from the controller; construction places
      it from RCL 2. Upgraders gather from it first; haulers fill it.
- [x] Builders: 1–3 from the remaining construction progress (1 per 5000).

**4. Construction order and limits**
- [x] At most 5 sites per room; placed in priority order (spawn → extensions → towers →
      containers → storage → … → roads → walls/ramparts). Replans every 25 ticks (was 100), since
      only a few sites are placed at a time.

**5. Defense**
- [x] Towers: healers first, then attackers, then others; heal my damaged creeps; repair only
      above 500 energy (defense reserve).
- [x] Wall/rampart repair targets by RCL (`defense/repair_targets.ts`: 10k at RCL 2 up to 10M at
      RCL 8), used by towers and the repair task. Repairers finish normal structures first.
- [x] Safe mode when dangerous hostiles reach a spawn (range 5) or the controller (range 3) and
      towers can't cope (no energy, out-healed, or a spawn already damaged).

**6. Scouting and room intel**
- [x] `Memory.intel[roomName]` (`intel/types.ts`) recorded by `Headquarters` for every visible room,
      at most every 25 ticks. Snapshot additions: controller owner, reservation and safe mode;
      world `visibleRooms`, `getExits` and `myUsername`.
- [x] `scout` task (from RCL 2): one `[MOVE]` creep while any adjacent room's intel is missing or
      older than 5000 ticks.
- [ ] Later: scouting rooms 2 exits away.

**7. Remote mining**
- [x] `remoteMine` task per remote room: a 3-`WORK` miner per source (spawned pre-assigned via
      request memory), haulers sized from an estimated 50-tile distance. Drop mining.
- [x] Remote choice from intel and exits: unowned, not reserved by others, no keepers, no hostiles
      in the last 1500 ticks; more sources first. 1 room at ≥ 800 capacity, 2 at ≥ 1300. Rooms
      used by other bases are skipped.
- [x] Works without vision (source positions from intel). Retreats home and stops spawning while
      hostiles are present or were seen in the last 300 ticks. Done when the room becomes owned,
      reserved by someone else, or otherwise unusable.
- [ ] Reserver (`CLAIM` + `MOVE`, from about 1300 energy capacity) to double output to 10/tick,
      and containers in the remote room.
- [ ] Measure real remote path lengths instead of the 50-tile estimate.
- [ ] Roads to remote rooms, built in stages:
      - None when a remote first starts. Remotes get lost (invaders, other players), so roads
        would be wasted energy until the remote has proven it holds.
      - Once it's stable (held for a few thousand ticks without being lost, and home has spare
        energy), plan one route with PathFinder that prefers the home room's existing layout
        roads, and save it in base memory. Build swamp tiles first: a loaded `[CARRY, MOVE]`
        hauler takes 5 ticks per swamp tile without a road.
      - Plains tiles once the room is reserved. On energy alone, plains roads pay back slowly
        (about 15k energy to build vs about 0.33 energy/tick saved on hauler bodies for a remote
        50 tiles away). The real gain is spawn time and CPU from smaller and fewer haulers, and
        reservation doubles traffic, which roughly halves the payback.
      - Upkeep: give haulers one `WORK` part to repair road tiles as they walk over them.
      - Keep the decision a pure function (e.g. `shouldBuildRemoteRoads(intel, remoteStats)`) and
        tune its cutoffs once phase 6 stats show real numbers.

### Phase 4: Directives and manual commands ✅
- [x] `Memory.directives` (`directives/types.ts`): type, target room, assigned base, source
      (auto/manual/flag) and lifecycle (pending → active → done or cancelled, with a reason).
      Short ids (`d3`) for typing in the console. Ended directives are pruned after 5000 ticks
      (done) or 50000 (cancelled; kept so the automatic planner doesn't recreate them).
- [x] Empire-level loop (`planDirectives`, pure, run by `Headquarters` before the bases): flags,
      finishing, assigning pending directives to the closest suitable base (within 10 rooms), claim
      spawn positions, automatic remote mining. Bases run one task per active directive assigned
      to them (tasks carry a `directiveId`) and drop tasks whose directive ended.
- [x] Automatic remote room choice moved from `planTasks` to the empire loop, creating `auto`
      directives. Migration 3 gives existing remote mine tasks a directive so they keep running.
      **Kept per base, without directives:** mining, hauling, upgrading, building, repairing and
      the routine adjacent-room scout, which are upkeep rather than goals you'd order by hand.
- [x] Console API (global `cmd`): `help`, `list(includeEnded?)`, `cancel(id)`,
      `remoteMine(room, { base? })`, `scout(room, { base? })`, `claim(room, { base?, x?, y? })`.
- [x] Flags: yellow = remote mine, white = scout, purple = claim (spawn on the flag). Removing the
      flag cancels; finishing removes the flag. Other colors are ignored.
- [x] Directive types:
      - `remoteMine`: manual ones override the automatic choice (they count against the same
        limit). Done when the room becomes unusable (owned, reserved by others, keepers) or a base.
      - `scout`: a scout goes to the room, however far, and the directive is done once it's seen.
      - `claim`: waits for spare GCL and a base with 650 energy capacity. A claimer claims the
        controller, two pioneers place and build the first spawn (position from the flag/command,
        or chosen from terrain to fit the layout's core), then the new base takes over the creeps.
- Not yet: directives for military goals (phase 5), and a claimer that can attack another
  player's reservation.

### Phase 5: Military
- [ ] `Attack`, `Defend` and `Escort` directives.
- [ ] Groups of creeps that move together, with formation and rally points.
- [ ] Target selection and engagement logic as pure, tested functions.

### Phase 6: Observability (can be done at any point)
- [ ] Per-tick CPU and stats recorded in Memory.
- [ ] Room visuals (HUD panels for tasks, spawn queue, economy, alerts; creep overlays; toggled
      with `cmd.visuals`). Design in [VISUALS.md](VISUALS.md).
- [ ] Use `Logger` consistently in place of `console.log`; enable daily `Logger.report()`.

### Later / optional
- [ ] Simulation tests over multiple ticks with `screeps-server-mockup`, if unit tests miss bugs
      in how the parts fit together.
