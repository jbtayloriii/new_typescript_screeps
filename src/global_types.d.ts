import { TaskMemory } from "tasks/types";

/** A string that is of type "x_y", e.g. "33_4" */
type CoordinateString = string;

/** A string that is of type "x_y_type", e.g. "33_4_Spawn" */
type BasePlanningCoordinateString = string;

type Coordinate = { x: number, y: number };

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
    // Version of the last migration applied; see memory/migrations.ts
    memoryVersion: number;
    bases_v3: { [roomName: string]: BaseMemory };
    // Each base's tasks, keyed by the base's room name. See tasks/types.ts.
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

  interface CreepMemory {
    /**
     * The task this creep belongs to. This is the only saved link between creeps and tasks:
     * tasks never store their creeps. An empty or unknown name means the creep is an orphan.
     */
    taskName: string;

    /** The base (room name) that owns this creep, wherever the creep currently is. */
    baseRoomName: RoomName;

    /** The creep's state in its task's state machine (e.g. gathering vs working). */
    state?: number;

    /** The object the creep is currently working on, if its task remembers one. */
    targetId?: Id<_HasId>;
  }

  interface LogMemory {
    lastReportedDate: number;
    infoMessages: string[];
    warningMessages: string[];
  }
}
