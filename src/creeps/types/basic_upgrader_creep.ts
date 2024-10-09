import { BaseCreepActions } from "base/base_creep_actions";
import { upgradeController } from "../actions/upgrade_controller";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { getEnergy } from "creeps/actions/get_energy";

export const enum BasicUpgraderCreepState {
  HARVESTING = 0,
  UPGRADING = 1,
}

export class BasicUpgraderCreepBlueprint extends CreepBlueprint {
  private sourceId: Id<Source>;
  private controllerId: Id<StructureController>;
  private energyAvailable: number;

  constructor(room: Room, source: Source, controller: StructureController) {
    super(room);
    this.sourceId = source.id;
    this.controllerId = controller.id;
    this.energyAvailable = room.energyAvailable;
  }

  getType(): CreepType {
    return CreepType.BASIC_UPGRADER;
  }
  getBody(): BodyPartConstant[] {
    let bodyArr: BodyPartConstant[] = [];
    let currentEnergy = this.energyAvailable;
    while (currentEnergy > 200) {
      bodyArr.push(WORK);
      bodyArr.push(MOVE);
      bodyArr.push(CARRY);
      currentEnergy -= 200;

      // Limit to 5 [work, move, carry] sets
      if (bodyArr.length >= 15) {
        return bodyArr;
      }
    }

    return bodyArr;
  }
  getInitialMemory(): BasicUpgraderCreepMemory {
    return {
      owningRoomId: this.owningRoomId,
      creepType: CreepType.BASIC_UPGRADER,
      currentState: BasicUpgraderCreepState.HARVESTING,
      sourceId: this.sourceId,
      controllerId: this.controllerId,
      links: {},
    };
  }
}

export class BasicUpgraderCreepHandler extends CreepHandler {
  memory: BasicUpgraderCreepMemory;
  source: Source;
  controller: StructureController;

  constructor(creep: Creep) {
    super(creep);
    const upgraderMemory = creep.memory as BasicUpgraderCreepMemory;
    this.memory = upgraderMemory;

    const source = Game.getObjectById(upgraderMemory.sourceId);
    if (!source) {
      throw `Unable to create basic harvester creep: Invalid source with ID ${upgraderMemory.sourceId}`;
    }
    this.source = source;

    const controller = Game.getObjectById(upgraderMemory.controllerId);
    if (!controller) {
      throw `Unable to create basic upgrader creep; no controller ${upgraderMemory.controllerId}`;
    }
    this.controller = controller;
  }
  
  handle(creepActions: BaseCreepActions): void {
    if (this.memory.currentState == BasicUpgraderCreepState.HARVESTING &&
      this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
      this.memory.currentState = BasicUpgraderCreepState.UPGRADING;
    }

    if (this.memory.currentState == BasicUpgraderCreepState.UPGRADING
      && this.creep.store[RESOURCE_ENERGY] === 0) {
      this.memory.currentState = BasicUpgraderCreepState.HARVESTING;
    }

    if (this.memory.currentState == BasicUpgraderCreepState.HARVESTING) {
      getEnergy(this.creep, creepActions);
    } else if (this.memory.currentState == BasicUpgraderCreepState.UPGRADING) {
      upgradeController(this.creep, this.controller);
    }
  }
  
}