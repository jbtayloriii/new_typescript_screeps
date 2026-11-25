import { Base } from "base/base";
import { Logger } from "logging/logger";
import { executeIntents } from "intents/execute_intents";
import { MyCreepSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { recordIntel, roomsNeedingIntel } from "intel/record_intel";
import { DirectiveStore } from "directives/store";
import { BaseSummary, DirectivePlanInput, planDirectives } from "directives/planning";
import { getMyStructures } from "snapshot/queries";
import { homeThreats } from "military/home_defense";
import { Intent } from "intents/types";
import { pruneVisuals } from "visuals/settings";

/** Top-level singleton: creates a Base for each owned room and runs each base every tick. */
export class Headquarters {
  private bases: Map<RoomName, Base> = new Map();

  private constructor() { }

  public setUpBases(): void {
    // TODO: remove bases that are destroyed

    const owningRooms = Object.entries(Game.rooms).filter(
      ([roomName, room]) => room.controller && room.controller.my
    );
    for (let [roomName, room] of owningRooms) {
      if (!this.bases.has(roomName)) {
        const spawns = room.find(FIND_MY_SPAWNS);
        if (spawns.length == 0) {
          console.log(`Unable to create base in ${roomName}, no initial spawns.`);
          continue;
        }
        try {
          this.bases.set(roomName, Base.createBaseFromInitialSpawn(spawns[0]));
        } catch (e) {
          // E.g. the layout planner can't fit the base core next to a hand-placed spawn. Don't let
          // one room break every tick; it's retried each tick in case the spawn changes.
          console.log(`Unable to create base in ${roomName}: ${e}`);
        }
      }
    }
  }

  public run(world: WorldSnapshot): void {
    // Record intel first, so this tick's decisions (e.g. a scout picking its next room) see it.
    for (const roomName of roomsNeedingIntel(world, Memory.intel)) {
      Memory.intel[roomName] = recordIntel(world.getRoom(roomName)!, Memory.intel[roomName]);
    }

    // Empire-level goals: flags, finishing, base assignment and automatic remote mining.
    const store = new DirectiveStore(Memory);
    const changes = planDirectives(this.planInput(world));
    store.apply(changes, world.tick);
    for (const alert of changes.alerts ?? []) {
      Logger.warning(alert);
    }
    for (const spec of changes.create) {
      if (spec.type === 'defend' && spec.targetRoom === spec.baseRoomName) {
        // Saved in Memory.log (and the daily email), so attacks leave a record.
        Logger.warning(`[${spec.targetRoom}] home defense with ${spec.size} defenders: ${spec.reason ?? 'under attack'}`);
      }
    }
    store.prune(world.tick);
    for (const roomName of pruneVisuals(Memory, world.tick)) {
      console.log(`Visuals off in ${roomName} (expired).`);
    }
    const handoffs = new Map(changes.handoffs.map(h => [h.creepName, h.baseRoomName]));
    executeIntents([
      ...changes.intents,
      ...changes.handoffs.map((h): Intent =>
        ({ kind: 'setCreepMemory', creepName: h.creepName, patch: { baseRoomName: h.baseRoomName, taskName: '' } })),
    ]);
    // Apply handoffs to this tick's creep list too, so the old base doesn't treat them as orphans.
    const creeps = world.myCreeps.map(c => handoffs.has(c.name)
      ? { ...c, memory: { ...c.memory, baseRoomName: handoffs.get(c.name)!, taskName: '' } }
      : c);

    const { byBase, rehomed } = groupCreepsByBase(creeps, [...this.bases.keys()]);
    executeIntents(rehomed.map(({ creep, baseRoomName }) =>
      ({ kind: 'setCreepMemory', creepName: creep.name, patch: { baseRoomName } })));
    tickEachBase(this.bases, (base, roomName) => base.tick(world, byBase.get(roomName) ?? []));
  }

  /** True once a miner (a mine task creep without CARRY) works one of the base's sources. */
  private hasMiner(world: WorldSnapshot, roomName: RoomName): boolean {
    const mineTasks = new Set((Memory.tasks[roomName] ?? []).filter(t => t.type === 'mine').map(t => t.name));
    return world.myCreeps.some(c => mineTasks.has(c.memory.taskName) && (c.activeParts[CARRY] ?? 0) === 0);
  }

  /** What the empire planner (and `cmd.evaluate`) needs this tick. */
  public planInput(world: WorldSnapshot): DirectivePlanInput {
    return { world, directives: new DirectiveStore(Memory).all(), bases: this.summarizeBases(world), intel: Memory.intel };
  }

  private summarizeBases(world: WorldSnapshot): BaseSummary[] {
    return [...this.bases.keys()].map(roomName => {
      const room = world.getRoom(roomName);
      return {
        roomName,
        energyCapacity: room?.energyCapacityAvailable ?? 0,
        staticMining: this.hasMiner(world, roomName),
        rcl: room?.controller?.level ?? 0,
        storageEnergy: room ? getMyStructures(room, STRUCTURE_STORAGE).reduce((sum, s) => sum + (s.store?.energy ?? 0), 0) : 0,
        underAttack: room ? homeThreats(room).length > 0 : false,
      };
    });
  }

  public static initialize(): Headquarters {
    Logger.info("Initializing hq");
    return new Headquarters();
  }
}

export interface CreepsByBase {
  readonly byBase: ReadonlyMap<RoomName, readonly MyCreepSnapshot[]>;
  /** Creeps whose base doesn't exist, with the base they were moved to. */
  readonly rehomed: readonly { creep: MyCreepSnapshot, baseRoomName: RoomName }[];
}

/**
 * Groups creeps by `memory.baseRoomName`. A creep whose base doesn't exist (lost, or missing
 * from old memory) joins the base in the room it's in, else the first base.
 */
export function groupCreepsByBase(creeps: readonly MyCreepSnapshot[], baseNames: readonly RoomName[]): CreepsByBase {
  const byBase = new Map<RoomName, MyCreepSnapshot[]>(baseNames.map(name => [name, []]));
  const rehomed: { creep: MyCreepSnapshot, baseRoomName: RoomName }[] = [];
  for (const creep of creeps) {
    let baseRoomName = creep.memory.baseRoomName;
    if (!byBase.has(baseRoomName)) {
      if (baseNames.length === 0) {
        continue;
      }
      baseRoomName = byBase.has(creep.pos.roomName) ? creep.pos.roomName : baseNames[0];
      rehomed.push({ creep, baseRoomName });
    }
    byBase.get(baseRoomName)!.push({ ...creep, memory: { ...creep.memory, baseRoomName } });
  }
  return { byBase, rehomed };
}

/**
 * Runs `tick` for every base, catching errors so one broken base doesn't stop the bases after
 * it (or the rest of the tick). Errors are logged with their stack. Returns the rooms that failed.
 */
export function tickEachBase<B>(
  bases: ReadonlyMap<RoomName, B>,
  tick: (base: B, roomName: RoomName) => void,
  log: (message: string) => void = console.log): RoomName[] {
  const failed: RoomName[] = [];
  bases.forEach((base, roomName) => {
    try {
      tick(base, roomName);
    } catch (e) {
      failed.push(roomName);
      log(`[${roomName}] base tick failed: ${e instanceof Error ? e.stack : String(e)}`);
    }
  });
  return failed;
}
