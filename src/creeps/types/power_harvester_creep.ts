import { Logger } from "logging/logger";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { BaseCreepActions } from "base/base_creep_actions";
import { BaseMemory } from "memory/base_memory";
import { MemoryCache } from "memory/memory_cache";

export const enum PowerHarvesterCreepState {
  MOVING = 0,
  HARVESTING = 1,
}

export class PowerHarvesterCreepBlueprint extends CreepBlueprint {
  private sourceId: Id<Source>;
  private containerId: Id<StructureContainer>;
  private roomEnergyCapacity: number;

  constructor(room: Room, source: Source, container: StructureContainer) {
    super(room);
    this.sourceId = source.id;
    this.roomEnergyCapacity = room.energyCapacityAvailable;
    this.containerId = container.id;
  }

  getType(): CreepType {
    return CreepType.BASIC_UPGRADER;
  }

  getBody(): BodyPartConstant[] {
    let bodyArr: BodyPartConstant[] = [MOVE];
    let currentEnergy = this.roomEnergyCapacity - 50;

    // Push up to 5 work parts, which is the maximum that a room can support
    while (currentEnergy >= 100 && bodyArr.length < 6) {
      bodyArr.push(WORK);
      currentEnergy -= 100;
    }

    return bodyArr;
  }

  getInitialMemory(): PowerHarvesterCreepMemory {
    return {
      owningRoomId: this.owningRoomId,
      creepType: CreepType.POWER_HARVESTER,
      currentState: PowerHarvesterCreepState.MOVING,
      sourceId: this.sourceId,
    };
  }
}

export class PowerHarvesterCreepHandler extends CreepHandler {
  memory: PowerHarvesterCreepMemory;
  source: Source;

  constructor(creep: Creep) {
    super(creep);
    const powerHarvesterMemory = creep.memory as PowerHarvesterCreepMemory;
    this.memory = powerHarvesterMemory;

    const source = Game.getObjectById(powerHarvesterMemory.sourceId);
    if (!source) {
      throw `Unable to create power harvester creep: Invalid source with ID ${powerHarvesterMemory.sourceId}`;
    }
    this.source = source;
  }
  
  handle(creepActions: BaseCreepActions): void {
    let source = Game.getObjectById(this.memory.sourceId);
    if (!source) {
      Logger.warning(`Unable to find Source ${this.memory.sourceId} for power harvester.`);
      return;
    }
    let sourceMemory: SourceMemory = MemoryCache.getSourceMemory(source);

    if (this.memory.currentState == PowerHarvesterCreepState.MOVING) {
      if (this.creep.pos.x == sourceMemory.x && this.creep.pos.y == sourceMemory.y) {
        this.memory.currentState = PowerHarvesterCreepState.HARVESTING;
      } else {
        this.creep.moveTo(new RoomPosition(sourceMemory.x, sourceMemory.y, source.room.name));
      }
    }

    if (this.memory.currentState == PowerHarvesterCreepState.HARVESTING) {
        let harvestCode = this.creep.harvest(this.source);
        if (harvestCode == ERR_NOT_IN_RANGE) {
            Logger.warning(`Creep ${this.creep.id} at pos ${this.creep.pos} not in range to harvest source at ${this.source.pos}.`)
        }
    }
  }
}