import { coordinateToCoordString } from "utils/string_utils";
import { getBaseLayoutForSpawn } from "pathfinding/base_layout_utils";
import { executeIntents } from "intents/execute_intents";
import { summarizeFailures } from "intents/failures";
import { MyCreepSnapshot } from "snapshot/types";
import { WorldSnapshot } from "snapshot/world";
import { TaskStore } from "tasks/task_store";
import { decideBaseIntents, reconcileTasks } from "./base_tick";
import { RemoteToSurvey, surveyBase } from "./survey";
import { activePanels } from "visuals/settings";
import { buildPanels } from "visuals/panels";
import { layoutHud } from "visuals/layout";
import { renderCommands } from "visuals/render";

/**
 * A single owned room.
 *
 * Base instances live across ticks (in the global Headquarters), but game objects and Memory
 * references do not: both are recreated every tick. So a Base only stores its room name and
 * reads everything else fresh each tick. All decisions are made by the pure functions in
 * `base_tick.ts`; this class only applies their results.
 */
export class Base {
  private readonly roomName: RoomName;

  private constructor(roomName: RoomName) {
    this.roomName = roomName;
  }

  public static createBaseFromInitialSpawn(initialSpawn: StructureSpawn) {
    const roomName = initialSpawn.room.name;
    console.log(`Creating base at room ${roomName} on tick ${Game.time}`);

    if (!(roomName in Memory.bases_v3)) {
      Memory.bases_v3[roomName] = {
        currentControllerLevelPlan: 0,
        lastBaseLayoutPlanTick: 0,
        initialSpawn: coordinateToCoordString(initialSpawn.pos),
        baseLayout: getBaseLayoutForSpawn(initialSpawn),
      };
    }

    return new Base(roomName);
  }

  /** This base's remote rooms with known sources, for `surveyBase`. */
  private remotesToSurvey(): RemoteToSurvey[] {
    return (Memory.tasks[this.roomName] ?? []).flatMap(t =>
      t.type === 'remoteMine' && Memory.intel[t.targetRoom]
        ? [{ targetRoom: t.targetRoom, sources: Memory.intel[t.targetRoom].sources }]
        : []);
  }

  public getRoomName(): RoomName {
    return this.roomName;
  }

  /** Runs this base for one tick. `creeps` are the creeps owned by this base. */
  public tick(world: WorldSnapshot, creeps: readonly MyCreepSnapshot[]): void {
    const home = world.getRoom(this.roomName);
    const baseMemory = Memory.bases_v3[this.roomName];
    const room = Game.rooms[this.roomName];
    if (!home || !baseMemory || !room) {
      return;
    }
    surveyBase(room, baseMemory, this.remotesToSurvey());

    const shared = { world, home, baseMemory, creeps, intel: Memory.intel, directives: Memory.directives };

    // Remove finished tasks and create missing ones before deciding anything else.
    const store = new TaskStore(Memory);
    const changes = reconcileTasks({ ...shared, tasks: store.getTasks(this.roomName) });
    changes.remove.forEach(name => store.removeTask(this.roomName, name));
    changes.create.forEach(spec => store.createTask(this.roomName, spec));

    const panels = activePanels(Memory, this.roomName, world.tick);
    const plan = decideBaseIntents({ ...shared, tasks: store.getTasks(this.roomName) }, { report: panels !== null });
    Object.assign(baseMemory, plan.baseMemoryUpdate);

    const failures = summarizeFailures(executeIntents(plan.intents));
    if (failures) {
      console.log(`[${this.roomName}] intent failures: ${failures}`);
    }

    if (panels && plan.report) {
      const hud = buildPanels(plan.report, panels, { used: Game.cpu.getUsed(), bucket: Game.cpu.bucket });
      renderCommands(layoutHud(hud), new RoomVisual(this.roomName));
    }
  }

}
