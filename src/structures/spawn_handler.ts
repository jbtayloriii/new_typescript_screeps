import { StructureHandler } from "./structure_handler";


export class SpawnHandler implements StructureHandler<StructureSpawn> {
  private spawn: StructureSpawn;

  constructor(spawn: StructureSpawn) {
    this.spawn = spawn;
  }

  getStructure(): StructureSpawn {
    return this.spawn;
  }
  
  execute(): void {
    throw new Error("Method not implemented.");
  }

}