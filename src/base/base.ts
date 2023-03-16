import { CreepHandler } from "../creeps/creep_handler";
import { CreepType } from "../creeps/creep_handler_factory";
import { BasePlanner } from "./base_planner";
import { SimpleBasePlanner } from "./simple_base_planner";


export class Base {
  private roomId: RoomId;
  private spawns: StructureSpawn[];
  private towers: StructureTower[];
  private creepMap: Map<string, CreepHandler> = new Map();

  private constructor(roomId: RoomId, spawns: StructureSpawn[], towers: StructureTower[]) {
    this.roomId = roomId;
    this.spawns = spawns;
    this.towers = towers;
  }

  public static createBaseFromRoom(room: Room) {
    console.log(`Creating base at room ${room.name} on tick ${Game.time}`);

    const spawns = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_SPAWN }
    }) as StructureSpawn[];
    const towers = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_TOWER }
    }) as StructureTower[];
    return new Base(room.name, spawns, towers);
  }

  receiveStructures(structures: Structure[]) {

  }

  addCreep(creep: CreepHandler) {
    if (this.creepMap.has(creep.getCreep().id)) {
      console.log(`Trying to add creep ${creep.getCreep().name} to base ${this.roomId} that already has it.`)
    }
    this.creepMap.set(creep.getCreep().name, creep);
  }

  removeDeadCreepHandler(creepName: string) {
    if (this.creepMap.has(creepName)) {
      console.log(`Deleting dead creep from base at ${this.roomId}`);
      this.creepMap.delete(creepName);
    }
  }


  processResourceRequests(): void {
    if (!Game.rooms[this.roomId]) {
      console.log(`Trying to plan base actions for nonexistent base: ${this.roomId}`);
      return;
    }
    const room = Game.rooms[this.roomId];

    const validSpawns = this.spawns.filter(spawn => !spawn.spawning);
    if (validSpawns.length == 0) {
      return;
    }

    const basePlanner = this.getBasePlanner(room);

    basePlanner.planConstruction(room);

    const creepBlueprints = basePlanner.planCreepCreation(room, Array.from(this.creepMap.values()));

    for (let spawn of validSpawns) {
      if (creepBlueprints.length > 0) {
        const nextBlueprint = creepBlueprints[0];
        const name = [CreepType[nextBlueprint.getType()], this.roomId, Game.time].join('_');
        const ret = spawn.spawnCreep(nextBlueprint.getBody(), name, {memory: nextBlueprint.getInitialMemory()});
        if (ret == OK) {
          creepBlueprints.shift();
        }
      }
    }
  }

  private getBasePlanner(room: Room): BasePlanner {
    if (room.controller && room.controller.level < 3) {
      return new SimpleBasePlanner();
    }

    // TODO: add more base planner types here
    return new SimpleBasePlanner();
  }

  run(): void {
    console.log(`Running creeps at base ${this.roomId}, there are ${this.creepMap.keys.length}`);
    for(let k in this.creepMap) {
      console.log(k);
    }
    this.creepMap.forEach(handler => handler.handle());
  }

  cleanUp(): void {

  }
  
}