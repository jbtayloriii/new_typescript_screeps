import { BasicHarvesterCreepState } from "creeps/types/basic_harvester_creep";
import { CreepType } from "./creeps/creep_handler_factory";
import { BasicBuilderCreepState } from "./creeps/types/basic_builder_creep";
import { BasicUpgraderCreepState } from "./creeps/types/basic_upgrader_creep";

declare global {
  type RoomId = string;

  interface Memory {
    currentMemoryVersion: string;
  }

  interface CreepMemory {
    owningRoomId: RoomId;
    creepType: CreepType;

    // Action memory
    harvestingSourceId?: Id<Source>;
    currentStructureResourceTargetId?: Id<Structure>;
    buildingConstructionSiteId?: Id<ConstructionSite>;

    // Prototype memory
    _movePath?: string;
    _moveTargetPosSerial?: string;
  }

  interface RoomMemory {
    powerHarvestingMap: { [sourceId: Id<Source>]: RoomPosition };
    _sourceToHarvestSpotMap: Map<
      Id<Source>,
      {
        openSpots: number;
        currentCreeps: Id<Creep>[];
      }
    >;
  }

  interface BasicHarvesterCreepMemory extends CreepMemory {
    currentState: BasicHarvesterCreepState;
    sourceId: Id<Source>;
    dropOffLocationId: Id<StructureSpawn>;
  }

  interface BasicUpgraderCreepMemory extends CreepMemory {
    currentState: BasicUpgraderCreepState;
    sourceId: Id<Source>;
    controllerId: Id<StructureController>;
  }

  interface BasicBuilderCreepMemory extends CreepMemory {
    currentState: BasicBuilderCreepState;
    sourceId: Id<Source>;
  }

  enum CreepActionReturnVal {
    SAME_ACTION = 0,
    NEXT_ACTION = 1,
    ACTION_ERROR = 2,
  }
}
