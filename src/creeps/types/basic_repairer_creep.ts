import { BaseCreepActions } from "base/base_creep_actions";
import { CreepBlueprint } from "../creep_blueprint";
import { CreepHandler } from "../creep_handler";
import { CreepType } from "../creep_handler_factory";
import { getEnergy } from "creeps/actions/get_energy";


// Repair up to 10000 hits
const REPAIR_CUTOFF = 10000;

// Prioritize structures with < 100 hits
const CRITICAL_REPAIR_CUTOFF = 100;

export class BasicRepairerCreepBlueprint extends CreepBlueprint {
  private roomName: string;

  constructor(room: Room) {
    super(room);
    this.roomName = room.name;
  }

  getBody(): BodyPartConstant[] {
    return [WORK, CARRY, MOVE];
  }

  getType(): CreepType {
    return CreepType.BASIC_REPAIRER;
  }

  getInitialMemory(): BasicRepairerCreepMemory {
    return {
      currentState: BasicRepairerCreepState.GET_ENERGY,
      currentRepairId: null,
      roomName: this.roomName,
      creepType: CreepType.BASIC_REPAIRER,
      owningRoomId: this.owningRoomId,
      links: {},
    };
  }
}

export const enum BasicRepairerCreepState {
  GET_ENERGY = 1,
  REPAIR_NEAREST = 2,
}

export class BasicRepairerCreepHandler extends CreepHandler {
  memory: BasicRepairerCreepMemory;
  roomName: string;

  constructor(creep: Creep) {
    super(creep);
    const memory = creep.memory as BasicRepairerCreepMemory;
    this.memory = memory;
    this.roomName = memory.roomName;
  }

  handle(creepActions: BaseCreepActions) {
    if (this.memory.currentState == BasicRepairerCreepState.GET_ENERGY &&
      this.creep.store[RESOURCE_ENERGY] === this.creep.store.getCapacity()) {
      this.memory.currentState = BasicRepairerCreepState.REPAIR_NEAREST;
    }

    if (this.memory.currentState == BasicRepairerCreepState.REPAIR_NEAREST
      && this.creep.store[RESOURCE_ENERGY] === 0) {
      this.memory.currentState = BasicRepairerCreepState.GET_ENERGY;
    }

    if (this.memory.currentState == BasicRepairerCreepState.GET_ENERGY) {
      getEnergy(this.creep, creepActions);
    } else if (this.memory.currentState == BasicRepairerCreepState.REPAIR_NEAREST) {
      this.repairStructure(creepActions);
    }
  }

  private repairStructure(creepActions: BaseCreepActions): void {
    let repairId = null;

    // Determine if we keep our current target
    if (this.memory.currentRepairId) {
      let repairObjMem = Game.getObjectById(this.memory.currentRepairId);

      if (repairObjMem && repairObjMem.hits < repairObjMem.hitsMax && repairObjMem.hits <= REPAIR_CUTOFF) {
        repairId = this.memory.currentRepairId;
      } else {
        this.memory.currentRepairId = null;
      }
    }

    // Find a new target if we don't have one, prioritizing the critical cutff first
    if (!this.memory.currentRepairId) {
      let structureArr = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
        filter: (structure) => (structure.hits < structure.hitsMax) && (structure.hits <= CRITICAL_REPAIR_CUTOFF)
      });
      if (!structureArr) {
        structureArr = this.creep.pos.findClosestByPath(FIND_STRUCTURES, {
          filter: (structure) => (structure.hits < structure.hitsMax) && (structure.hits <= REPAIR_CUTOFF)
        });
      }

      if (structureArr) {
        this.memory.currentRepairId = structureArr.id;
      }
    }

    if (!this.memory.currentRepairId) {
      return;
    }

    let repairObj = Game.getObjectById(this.memory.currentRepairId);
    if (repairObj == null) {
      return;
    }

    let repairCode = this.creep.repair(repairObj);
    if (repairCode == ERR_NOT_IN_RANGE) {
      this.creep.moveTo(repairObj);
    }
    this.creep.SayJobAction('🔧');
  }

}
