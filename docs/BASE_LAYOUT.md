# Base layout v2 — design

Status: planned. See [ROADMAP.md](ROADMAP.md) phase 7. [EXPANSION.md](EXPANSION.md) (phase 8)
depends on it: its spawn-position check should test that this full layout fits.

## Goals

- Plan a position for every structure each RCL allows, up to RCL 8: spawns, towers, links,
  labs, extractor, observer, power spawn, as well as what's planned today.
- Every structure comes from an explicit rule or stamp, not "somewhere near the core".
- Never move anything an existing base has already built, so existing bases can be replanned
  safely.
- Build a structure only once some code uses it. Plan positions for everything now so the space
  is reserved, but don't spend 500k energy on labs that nothing runs.
- Make the planner pure (terrain in, layout out), so it can be tested without Screeps mocks and
  run for rooms we don't own yet (the expansion spawn check).

## What's planned today

`getBaseLayout` ([base_layout_utils.ts](../src/pathfinding/base_layout_utils.ts)) runs once, when
the base is created, and is saved in `BaseMemory.baseLayout` as `{ [level]: "x_y_type"[] }`. It
is never recomputed.

1. **Core**: a 3×3 square next to the first spawn, ringed by roads. The center tile is walkable
   (a rampart from RCL 5) and the 8 ring tiles hold: the spawn, a road (the doorway to the
   center), tower (3), storage (4), link (5), terminal (6), factory (7), nuker (8). A creep on
   the center tile can reach all of them.
2. **Extensions**: 12 star-shaped stamps of 5 (60 in all). The first candidates are 8 offsets
   around the core; each placed stamp adds 4 more at (±2, ±2), so stamps tile on a diagonal grid
   and share their edge roads. They're unlocked in placement order: 2, 3, 4, 4, 5, 5, 6, 6, 7,
   7, 8, 8.
3. **Source roads**: a PathFinder path from the spawn to each source, with a container on the
   last tile (the miner's tile; `findContainerTile` finds it there).
4. Outside the layout: the controller container, chosen by the survey
   (`chooseControllerContainerTile`) on a tile the layout doesn't use.

| Structure | Allowed by RCL (1–8) | Planned now | Missing |
| --- | --- | --- | --- |
| Spawn | 1, 1, 1, 1, 1, 1, 2, 3 | 1 | 2 (RCL 7, 8) |
| Extension | 0, 5, 10, 20, 30, 40, 50, 60 | 60 | — |
| Tower | 0, 0, 1, 1, 2, 2, 3, 6 | 1 | 5 |
| Link | 0, 0, 0, 0, 2, 3, 4, 6 | 1 (core) | source and controller links |
| Container | 5 from RCL 1 | 2 sources + controller | mineral |
| Storage, terminal, factory, nuker | RCL 4, 6, 7, 8 | yes (core ring) | — |
| Extractor | RCL 6 | — | 1 |
| Lab | 0, 0, 0, 0, 0, 3, 6, 10 | — | 10 |
| Observer, power spawn | RCL 8 | — | 1 each |
| Ramparts / walls | RCL 2 | core center only | perimeter (later) |

What already uses more than one: the spawn queue spreads requests over every idle spawn
(`planSpawnQueue`), and tower logic loops over every tower. Extra spawns and towers are useful
as soon as they're built.

## The v2 plan

1. **Core**: unchanged, except that the RCL 8 ring slot holds the **power spawn instead of the
   nuker** (see "The core ring").
2. **Stamp grid**: find the grid slots exactly as today's extension search does, but keep going
   until 14 slots are found (12 extension stamps + a tower stamp + a spawn stamp). Then fill the
   slots in the stamp order below.
3. **Source roads and containers**: unchanged.
4. **Controller**: the controller container moves into the layout (same tile choice; existing
   bases keep their saved tile), plus a road to it from the core at RCL 3. Today nothing plans
   a road to the controller.
5. **Links**: see below.
6. **Mineral**: extractor on the mineral, a container next to it (the walkable neighbor closest
   to the core) and a road to it, all at RCL 6.
7. **Labs**: one 10-lab stamp, see below.

### Per-RCL result

| RCL | Adds |
| --- | --- |
| 1 | spawn |
| 2 | 5 extensions, source containers, controller container, core ring road |
| 3 | 5 extensions, tower 1 (core), roads (from RCL 3, as now), controller road |
| 4 | 10 extensions, storage |
| 5 | 10 extensions, tower 2 (tower stamp), core link + 1st link target, center rampart |
| 6 | 10 extensions, terminal, 2nd link target, extractor + mineral container + road, labs 1–3 |
| 7 | 10 extensions, spawn 2, tower 3, 3rd link target, factory, labs 4–6 |
| 8 | 10 extensions, spawn 3, towers 4–6, nuker, observer, power spawn, labs 7–10 |

RCL 8 allows 6 links; this plans 4 (core, 2 sources, controller). The other 2 are left for later
uses (e.g. a link at the exit to a remote).

### The core ring

A creep standing on the center tile reaches all 8 ring tiles. So the ring is for structures that
trade resources with storage often:

| Ring slot | Keep? | Why |
| --- | --- | --- |
| Spawn | yes | built at RCL 1; filled from the hub |
| Road | yes | the doorway into the center tile |
| Tower | yes | built at RCL 3 in existing bases, so it can't move |
| Storage, terminal, core link | yes | the hub itself |
| Factory | yes | its inputs and outputs all move to and from storage and terminal |
| Nuker → **power spawn** | swap | the power spawn uses 50 energy/tick while running (its 5,000 lasts ~100 ticks) and takes power from the terminal. The nuker is filled once and then idles through a 100k-tick cooldown |

Both unlock at RCL 8, so the swap moves nothing already built, except where a nuker has been
built. In that case it stays, and the power spawn takes the spawn stamp's center instead.

Haulers can reach every ring tile from the outer ring road, so the core works without a hub
creep. A stationary hub manager on the center tile is a later task (see "Suggested order").

### Core stamps on the extension grid

Two new stamps with the same footprint as an extension stamp (a plus of 5, ringed by roads), so
they slot into the same grid and share edge roads with the extension stamps around them:

```
Tower stamp          Spawn stamp
. . r . .            . . r . .
. r T r .            . r S r .
r T T T r            r N c O r
. r T r .            . r S r .
. . r . .            . . r . .
```

- **Tower stamp**: tower 2 in the center (RCL 5), tower 3 (RCL 7), towers 4–6 (RCL 8). It keeps
  the towers together near the core, where they cover the base and are easy to keep filled.
- **Spawn stamp**: spawn 2 (RCL 7, top), spawn 3 (RCL 8, bottom), nuker `N` and observer `O`
  (RCL 8). The center `c` is a road. Each spawn has road tiles next to it to spawn creeps onto.

**Stamp order.** Grid slots are numbered in the order today's search finds them: the slots
touching the core first, then outward. Stamps fill them in this order:

| Slot | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stamp | ext 2 | ext 3 | ext 4 | ext 4 | **towers** | **spawns** | ext 5 | ext 5 | ext 6 | ext 6 | ext 7 | ext 7 | ext 8 | ext 8 |

- The early extensions (RCL 2–4) keep the closest slots. Before storage exists, energy is
  walked from the spawn to extensions, so short trips matter most then.
- The tower and spawn stamps come next, usually still touching the core, ahead of the RCL 5–8
  extensions. Those move out by two slots, which costs little once haulers fill from storage.
- If the room has fewer than 14 slots, stamps from the end of the order (RCL 8 extensions
  first) are dropped and reported as warnings.

**Existing bases.** A slot with anything built in it keeps its v1 stamp and level. The rest of
the order fills the remaining slots. For example:

- At RCL 4 (slots 1–4 built), the result is the same as for a new base.
- At RCL 6 (slots 1–8 built), the tower stamp lands in slot 9 and the spawn stamp in slot 10.
  The RCL 7–8 extensions take slots 11–14.

Finding slots doesn't depend on what goes in them: every stamp has the same footprint, so the
search accepts the same slots in the same order as today. Only what's assigned to each slot
changes, and built slots aren't reassigned.

### Links

Three link targets beside the core link: each source and the controller. Order them by path
distance from the storage, longest first. That way the first link at RCL 5 replaces the longest
haul, so the order follows the room rather than a fixed rule.

- **Source link**: a free tile next to the miner's tile (the source container), so the miner
  can transfer without moving. Not on a road tile.
- **Controller link**: a free tile next to the controller container and within range 3 of the
  controller, so upgraders standing by the container can draw from it.

### Labs

A 4×4 stamp with a diagonal road. All 10 labs touch the road, and the two input labs (`I`) are
within range 2 of the other eight, which reactions need:

```
r L L .
L r I L
L I r L
. L L r
```

- Placed after the stamp grid, by its own search: all 16 tiles free (road tiles may reuse
  planned roads), the two road ends joined to the base's roads. Prefer the spot closest to
  storage, since labs trade minerals with the terminal and storage.
- Unlocked: the 2 inputs + 1 output at RCL 6, 3 more at RCL 7, the last 4 at RCL 8.
- Its shape doesn't fit the diamond grid, so it comes after all 14 grid stamps and may be
  further from storage in tight rooms.

### Checks the planner makes (tested for every test room)

- For every RCL, the number of each structure type planned up to that RCL ≤
  `CONTROLLER_STRUCTURES[type][rcl]`.
- No two structures on one tile (except road + rampart, and container + rampart).
- Every non-road structure has a walkable neighbor reachable from the core.
- Lab inputs are within range 2 of all output labs.
- The stamp grid finds the same slots, in the same order, as today's extension search.
- Replanning keeps every built structure at its tile and type.

Shortfalls (e.g. "only 13 grid slots fit", "no lab spot") are saved as `layoutWarnings` on the
base and shown by visuals and `cmd.layout`.

## Building only what's used

Construction places every unlocked layout structure today. v2 adds a list of structure types
that are planned but not yet built, because nothing uses them yet:

```ts
/** Structure types planned but not built until code uses them. Remove a type as its logic lands. */
export const NOT_YET_BUILT: ReadonlySet<BuildableStructureConstant> = new Set([
    STRUCTURE_LINK,        // until a link task moves energy
    STRUCTURE_EXTRACTOR,   // until mineral mining
    STRUCTURE_LAB,         // until reactions or boosts
    STRUCTURE_TERMINAL,    // until terminal/market code
    STRUCTURE_FACTORY,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_OBSERVER,
]);
```

The terminal (RCL 6), factory (RCL 7) and nuker (RCL 8) are already planned today, at 100k energy
each to build, so this also stops a base spending 300k on structures nothing uses.
Already-built ones are left alone.

## Replanning existing bases

- `BaseMemory.layoutVersion` (missing means 1). When it's older than the current version, the
  base replans on its next tick and saves the new layout and version. This runs in `Base`, not
  in a Memory migration, because source roads need `PathFinder`, and Memory migrations are pure.
- Inputs: the initial spawn (as today), the saved controller container, and the live room's
  structures. Built structures decide which grid slots are fixed (and whether the ring has a
  nuker). A tile holding a structure the layout doesn't plan (e.g. one built by hand) is treated
  as blocked, so new placements avoid it.
- CPU: one full plan per base, once. Spread it out if several bases replan on the same tick.

## How it fits the code

| Where | Change |
| --- | --- |
| `pathfinding/base_layout_map_obj.ts` | plain tile grid. Build the `CostMatrix` only for the PathFinder step, so the core, grid and lab steps are pure |
| `pathfinding/base_layout_utils.ts` | `planLayoutFromTerrain` (pure: core, stamp grid, labs) and the PathFinder steps (source, controller and mineral roads). Split today's `addBaseExtensions` into finding slots and assigning stamps |
| `pathfinding/stamps.ts` (new) | extension, tower, spawn and lab stamps, `STAMP_ORDER`, and assigning stamps to slots (with fixed slots for existing bases) |
| `base/construction.ts` | `NOT_YET_BUILT`; the controller container comes from the layout |
| `base/base.ts` | `layoutVersion` check and replan |
| `base/survey.ts` | the controller container tile choice moves into the planner (the function is reused) |
| `directives/commands.ts` | `cmd.layout(room)`: draw the planned layout (by level, built/unbuilt) and print warnings |
| `visuals/` | a layout overlay (see the overlays section of [VISUALS.md](VISUALS.md)) |

Today's search stops after 50 candidates; finding 14 slots may need a higher limit.

## Suggested order

1. **Pure layout map, versioning and checks.** No change to the layout yet. It moves the
   `CostMatrix` out, splits slot finding from stamp assignment (same output), adds the per-RCL
   count checks, `layoutVersion` and `cmd.layout`.
2. **Tower and spawn stamps.** These are used straight away. This is the first version bump.
3. **`NOT_YET_BUILT`**, then the controller container and road.
4. **Link positions** (not built yet). Building them waits for a link task.
5. **Mineral**: extractor, container and road (not built until mineral mining).
6. **Labs stamp** and the nuker/power spawn swap.
7. Then expansion (phase 8) checks the full pure layout when it picks a spawn position.

Later, each in its own design: hub manager (a stationary creep on the core center moving
resources between storage, terminal, link, factory and power spawn), rampart perimeter
(min-cut), link task, mineral mining, lab reactions and boosts, factory.

## Decisions

- Built structures never move. Unbuilt ones may (the RCL 5–8 extension stamps, the core's RCL 8
  slot).
- Every structure comes from an explicit stamp or rule. The tower and spawn stamps share the
  extension footprint and sit on the same grid, in a fixed stamp order.
- The core ring is for hub traffic: the factory stays, and the power spawn replaces the nuker
  (unless a nuker is already built there).
- Plan every position now, but don't build types that nothing uses yet.
- Order link targets by haul distance instead of a fixed order.
- Labs go after the stamp grid, accepting that in tight rooms they may be further from storage.
