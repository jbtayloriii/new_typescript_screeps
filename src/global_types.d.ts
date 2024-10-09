import { BasicHarvesterCreepState } from "creeps/types/basic_harvester_creep";
import { CreepType } from "./creeps/creep_handler_factory";
import { BasicBuilderCreepState } from "./creeps/types/basic_builder_creep";
import { BasicUpgraderCreepState } from "./creeps/types/basic_upgrader_creep";
import { PowerHarvesterCreepState } from "./creeps/types/power_harvester_creep";
import { BasicRepairerCreepState } from "creeps/types/basic_repairer_creep";
import { BaseMemory } from "memory/base_memory";

declare global {
  type RoomName = string;

  interface Memory {
    currentMemoryVersion: string;
    bases_v2: { [roomName: string]: BaseMemory };
    sources: { [sourceId: string]: SourceMemory };

    log: LogMemory;
  }

  interface StructureMemory {

  }

  interface CreepMemory {
    owningRoomId: RoomName; // Deprecated, use baseId
    creepType: CreepType;

    // Action memory
    harvestingSourceId?: Id<Source>;
    currentStructureResourceTargetId?: Id<Structure>;
    buildingConstructionSiteId?: Id<ConstructionSite>;

    // Linked actions
    links: CreepLinks;

    // Prototype memory
    _movePath?: string;
    _moveTargetPosSerial?: string;
  }

  interface CreepLinks {
    powerHarvestSourceId?: Id<Source>;
  }

  interface SourceMemory {
    id: Id<Source>;
    x: number;
    y: number;
    roomName: string;
    maxCreeps: number;
    currentPowerHarvester?: Id<Creep>;
    powerHarvestContainer?: ObjectPositionMemory;
    currentCreepIds: Id<Creep>[];
  }

  interface LogMemory {
    lastReportedDate: number;
    infoMessages: string[];
    warningMessages: string[];
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

  interface ObjectPositionMemory {
    containerId: string,
    x: number,
    y: number,
  }

  interface BasicHarvesterCreepMemory extends CreepMemory {
    currentState: BasicHarvesterCreepState;
    dropOffLocationId: Id<StructureSpawn>;
  }

  interface BasicUpgraderCreepMemory extends CreepMemory {
    currentState: BasicUpgraderCreepState;
    sourceId: Id<Source>;
    controllerId: Id<StructureController>;
  }

  interface BasicBuilderCreepMemory extends CreepMemory {
    currentState: BasicBuilderCreepState;
  }

  interface PowerHarvesterCreepMemory extends CreepMemory {
    currentState: PowerHarvesterCreepState;
    sourceId: Id<Source>;
  }

  interface BasicRepairerCreepMemory extends CreepMemory {
    currentState: BasicRepairerCreepState;
    roomName: string;
    currentRepairId: Id<Structure> | null;
  }


  enum CreepActionReturnVal {
    SAME_ACTION = 0,
    NEXT_ACTION = 1,
    ACTION_ERROR = 2,
  }
}
