import { BasicHarvesterCreepState } from "creeps/types/basic_harvester_creep";
import { CreepType } from "./creeps/creep_handler_factory";
import { BasicBuilderCreepState } from "./creeps/types/basic_builder_creep";
import { BasicUpgraderCreepState } from "./creeps/types/basic_upgrader_creep";
import { PowerHarvesterCreepState } from "./creeps/types/power_harvester_creep";
import { BasicRepairerCreepState } from "creeps/types/basic_repairer_creep";
import { TaskType } from "tasks/task";

/** A string that is of type "x_y", e.g. "33_4" */
type CoordinateString = string;

/** A string that is of type "x_y_type", e.g. "33_4_Spawn" */
type BasePlanningCoordinateString = string;

type Coordinate = { x: number, y: number };
type LayoutCoordinate = { x: number, y: number, type: BuildableStructureConstant };

/**
 * Maps a controller level (1-8) to the planned construction coordinates unlocked at that level.
 *
 * This is a plain object rather than a Map because it is stored in Memory, which is
 * JSON-serialized each tick (a Map would serialize to `{}`). Keys become strings after a
 * round trip, but numeric indexing still works.
 */
type BaseLayoutMap = { [controllerLevel: number]: BasePlanningCoordinateString[] };

declare global {
  type RoomName = string;

  interface Memory {
    currentMemoryVersion: string;
    bases_v3: { [roomName: string]: BaseMemory };
    sources: { [sourceId: string]: SourceMemory };
    tasks: { [roomName: string]: TaskMemory[] };
    // Monotonic counter used to generate unique task names
    nextTaskId: number;

    log: LogMemory;
  }

  interface BaseMemory {
    // Holds the current level of controller that base layout construction has been planned
    currentControllerLevelPlan: number

    // Holds the last time the base layout has been converted to construction plans, or 0 if it has never been done
    lastBaseLayoutPlanTick: number;

    // Holds the coordinate string of the initial spawn for a base
    initialSpawn: CoordinateString;

    // Holds the computed base layout, mapped to different controller levels
    baseLayout: BaseLayoutMap;
  }

  interface TaskMemory {
    name: string;
    roomName: string;
    taskType: TaskType;
    currentState: number;
  }

  interface RoomInfoMemory {
    initialSpawn: CoordinateString;
    baseLayout: BaseLayoutMap;
  }

  interface CreepMemory {
    owningRoomId: RoomName; // Deprecated, use baseId
    creepType: CreepType;

    taskName: string;

    currentState?: number;

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
    controllerId: Id<StructureController>;
  }

  interface BasicBuilderCreepMemory extends CreepMemory {
    taskName: "TODO: remove";
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
