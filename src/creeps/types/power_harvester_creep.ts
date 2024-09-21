import { Logger } from "logging/logger";
import { ActionHarvestSource } from "../actions/action_harvest_source";
import { ActionUpgradeController } from "../actions/action_upgrade_controller";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { BaseCreepActions } from "base/base_creep_actions";

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
      containerId: this.containerId,
    };
  }
}

export class PowerHarvesterCreepHandler extends CreepHandler {
  memory: PowerHarvesterCreepMemory;
  source: Source;
  container: StructureContainer;

  constructor(creep: Creep) {
    super(creep);
    const powerHarvesterMemory = creep.memory as PowerHarvesterCreepMemory;
    this.memory = powerHarvesterMemory;

    const source = Game.getObjectById(powerHarvesterMemory.sourceId);
    if (!source) {
      throw `Unable to create power harvester creep: Invalid source with ID ${powerHarvesterMemory.sourceId}`;
    }
    this.source = source;

    const container = Game.getObjectById(powerHarvesterMemory.containerId);
    if (!container) {
      throw `Unable to create power harvester creep: Invalid container with ID ${powerHarvesterMemory.containerId}`;
    }
    this.container = container;
  }
  
  handle(creepActions: BaseCreepActions): void {
    if (this.memory.currentState == PowerHarvesterCreepState.MOVING &&
            this.container.pos == this.creep.pos) {
        this.memory.currentState = PowerHarvesterCreepState.HARVESTING;
    }

    if (this.memory.currentState == PowerHarvesterCreepState.HARVESTING) {
        let harvestCode = this.creep.harvest(this.source);
        if (harvestCode == ERR_NOT_IN_RANGE) {
            Logger.warning(`Creep ${this.creep.id} at pos ${this.creep.pos} not in range to harvest source at ${this.source.pos}.`)
        }
    }
  }
}