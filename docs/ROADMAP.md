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

### Phase 3: Full economy automation ✅
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
- [x] Sites placed in priority order (spawn → extensions → towers → containers → storage → … →
      roads → walls/ramparts), at most 5 per priority tier: a site counts against a structure's
      cap only if it's at least as important, so road sites placed at RCL 1 can't block
      extensions at RCL 2. Builders build the most important site first (closest among equals),
      and switch when a more important one appears. Roads are placed only from RCL 3 (energy
      goes to extensions and upgrading first). Replans every 25 ticks (was 100).

**5. Defense**
- [x] Towers: healers first, then attackers, then others; heal my damaged creeps; repair only
      above 500 energy (defense reserve).
- [x] Wall/rampart repair targets by RCL (`defense/repair_targets.ts`: 10k at RCL 2 up to 10M at
      RCL 8), used by towers and the repair task. Repairers finish normal structures first.
- [x] Safe mode when dangerous hostiles reach a spawn (range 5) or the controller (range 3) and
      towers can't cope (no energy, out-healed, or a spawn already damaged).
- [x] Safe mode v2 (after losing W23S31, which spent its charge on 3 harassers at RCL 3): only
      when hostiles within 3 of a spawn or tower can destroy it and its rampart within 50 ticks
      and the towers can't kill them first, or a claimer reaches the controller (which would
      block safe mode) while hostiles that can damage structures are in the room. Activations
      are logged to `Memory.log` with the reason.

**6. Scouting and room intel**
- [x] `Memory.intel[roomName]` (`intel/types.ts`) recorded by `Headquarters` for every visible room,
      at most every 25 ticks. Snapshot additions: controller owner, reservation and safe mode;
      world `visibleRooms`, `getExits` and `myUsername`.
- [x] `scout` task (from RCL 2): one `[MOVE]` creep while any room within 2 exits has intel that's
      missing or older than 5000 ticks (adjacent rooms first). Remote mining still only picks
      adjacent rooms.

**7. Remote mining**
- [x] `remoteMine` task per remote room: a 3-`WORK` miner per source (spawned pre-assigned via
      request memory), haulers sized from an estimated 50-tile distance. Drop mining.
- [x] Remote choice from intel and exits: unowned, not reserved by others, no keepers, no hostiles
      in the last 1500 ticks; more sources first. 1 room at ≥ 800 capacity, 2 at ≥ 1300. Rooms
      used by other bases are skipped.
- [x] Works without vision (source positions from intel). Retreats home and stops spawning while
      hostiles are present or were seen in the last 300 ticks. Done when the room becomes owned,
      reserved by someone else, or otherwise unusable.
- [x] Reserver (`[CLAIM, MOVE]×2`, from 1300 energy capacity) whenever the reservation has less
      than 3000 ticks left. While reserved (10 energy/tick per source): miners are `5W 1C 3M` and
      haulers are sized for 10/tick. **Added:** an Invader core reserving a room no longer ends its
      directive, and rooms reserved by Invaders aren't picked as new remotes. Since phase 5, the
      remote pauses only while a core exists (an automatic defend squad destroys it), and the
      reserver clears the leftover reservation with `attackController`.
- [x] Containers in reserved remote rooms: one per source, on the walkable tile next to it that's
      closest to the room center. The miner's CARRY part builds it and repairs it below half
      hits (containers outside owned rooms decay 5× faster).
- [x] Measured remote path lengths: the base survey runs PathFinder from the spawn to each remote
      source once (`BaseMemory.remoteDistances`); haulers are sized from them (50-tile estimate
      until then, or if no complete path is found).
- [x] Roads to remote rooms, in stages (`tasks/remote_roads.ts`, `remoteRoadStage`, pure):
      - `none` while the remote is new or was attacked in the last 3000 ticks, or the base has
        less than 2 energy/tick spare;
      - `swamp` once it's held 3000 ticks: swamp tiles only;
      - `all` once it's also reserved.

      The survey plans the route once (`BaseMemory.remoteRoutes`, compact tile indexes per
      room), preferring existing roads and the home layout's planned roads. Sites are placed
      only in visible rooms, at most 3 per room at a time. Once roads are being built, haulers
      get one `WORK` part and build or repair road tiles within range 3 as they walk (outside the
      home room, whose roads the base's own builders and repairers handle). The cutoffs are
      guesses to tune with phase 6 stats.

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
- Military directives came in phase 5. Claimers also clear another player's reservation with
  `attackController` before claiming (added in phase 5).

### Phase 5: Military ✅
- [x] `attack`, `defend` and `escort` directives, each run by a `squad` task in the assigned base
      (`military/`). Console: `cmd.attack(room, { size })`, `cmd.defend(room, { size })`,
      `cmd.escort(directiveId, { size })`. Military directives need a base with 550 energy
      capacity; escorts run from the escorted directive's base. Done: attack when the room is seen
      with no hostile structures or combat creeps; defend when clear for 100 ticks; escort when
      the escorted directive ends.
- [x] Automatic defense: a remote room with NPC invaders (recently seen) or an Invader core gets
      a `defend` directive from its base, sized 2–4 to the threat. Only NPCs: player hostiles need
      a manual order. Intel now records Invader cores, hostile structures and hostile owners.
- [x] Home defense against players (`military/home_defense.ts`): player attackers in a base room
      that its towers can't kill within 50 ticks get an automatic `defend` directive for the base
      itself, sized 2–6. Defenders spawn at priority 95 (ahead of everything but the first miner,
      harvesters and the first hauler), counter what attacks (melee vs dismantlers, ranged vs
      melee, melee vs ranged, mixed otherwise), and fight as soon as they spawn.
- [x] Squads (`squadComposition`): attack is a healer per 3, the rest alternating melee/ranged;
      defend/escort is ranged plus a healer. Rally at the home spawn until complete, then move
      out with follow-the-leader movement (followers stay next to the leader, the leader waits for
      stragglers but never on a room edge). Retreat below 40% total health, re-engage at 90%.
      Reinforcements join wherever the squad is. **Simpler than planned:** no fixed formations
      (e.g. 2×2 quads); follow-the-leader with cohesion waits instead.
- [x] Pure engagement logic (`military/combat.ts`): target tiers (healers → ranged → melee →
      others; then cores/towers → spawns → extensions → other structures), per-mission structure
      rules, melee/ranged/healer actions including mass attack and ranged heal.
- [x] Phase 3/4 follow-ups: remotes pause only while an Invader core exists; reservers and
      claimers clear other reservations with `attackController`.
- Not yet: quad formations, kiting (ranged creeps stepping away from melee), boosts, towers and
  ramparts as tactical concerns (breaching ramparts, avoiding tower range), and automatic
  attacks.

### Phase 6: Observability (can be done at any point)
- [ ] Per-tick CPU and stats recorded in Memory.
- [ ] Room visuals (HUD panels for tasks, spawn queue, economy, alerts; creep overlays; toggled
      with `cmd.visuals`). Design in [VISUALS.md](VISUALS.md). **Step 1 done:** header, tasks,
      spawn queue and (estimated) economy panels, `cmd.visuals` with a 200-tick auto-off.
- [ ] Use `Logger` consistently in place of `console.log`; enable daily `Logger.report()`.

### Phase 7: Base layout v2 ✅
Plan every structure each RCL allows, without moving anything built. Design in
[BASE_LAYOUT.md](BASE_LAYOUT.md).
- [x] Pure layout map (no `CostMatrix` until PathFinder runs), `layoutVersion` replanning for
      existing bases, per-RCL count checks against `CONTROLLER_STRUCTURES`, `cmd.layout(room)`.
- [x] Tower stamp (towers 2–6) and spawn stamp (spawns 2–3, nuker, observer), with the extension
      stamp's footprint so they share its grid. They take slots 5–6 of a fixed stamp order;
      grid slots with built structures keep what they have.
- [x] `NOT_YET_BUILT`: plan but don't build links, extractor, labs, terminal, factory, power
      spawn, nuker and observer until code uses them. Controller container and road move into
      the layout.
- [x] Link positions (sources and controller, longest haul first), mineral extractor + container
      + road, 10-lab stamp, observer position. The power spawn takes the nuker's core slot
      (the nuker moves out, unless one is already built there).
- [x] Protective ramparts over spawns, towers and storage from RCL 3 (layout version 3), built
      right after storage, and towers rescue new ramparts before they decay.

### Phase 8: Expansion
Make `cmd.claim(room)` reliable from a room name alone. Design in [EXPANSION.md](EXPANSION.md).
- [ ] Spawn position v2: walking distance to sources and controller, exit penalty, and the whole
      layout (12 extension stamps) must fit, not just the core. `cmd.evaluate(room)` dry run.
- [ ] Claim phases (scouting → evaluating → claiming → building → incubating), with the room
      scouted first and checks that cancel or hold with a reason.
- [ ] Base readiness (RCL 4, 1300 capacity, 10k storage, one claim at a time, `force` to skip),
      a faster claimer on a planned route, and up to 3 claim attempts.
- [ ] Pioneers sized to the room's sources, replaced early, kept away from hostiles; stall
      watchdog (never unclaims automatically).
- [ ] Incubation: the parent base keeps sending helpers until the new base has RCL 3 and a tower.

### Later / optional
- [ ] Simulation tests over multiple ticks with `screeps-server-mockup`, if unit tests miss bugs
      in how the parts fit together.
