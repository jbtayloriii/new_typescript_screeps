import { Base } from "base/base";
import { Logger } from "logging/logger";
import { executeIntents } from "intents/execute_intents";
import { MyCreepSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";

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
        this.bases.set(roomName, Base.createBaseFromInitialSpawn(spawns[0]));
      }
    }
  }

  public run(world: WorldSnapshot): void {
    const { byBase, rehomed } = groupCreepsByBase(world.myCreeps, [...this.bases.keys()]);
    executeIntents(rehomed.map(({ creep, baseRoomName }) =>
      ({ kind: 'setCreepMemory', creepName: creep.name, patch: { baseRoomName } })));
    this.bases.forEach((base, roomName) => base.tick(world, byBase.get(roomName) ?? []));
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
