import { ConstructionPlanning } from "../construction_planning";


const EXTENSION_MAX_PER_LEVEL = {
  0: 0,
  1: 0,
  2: 5,
  3: 10,
  4: 20,
  5: 30,
  6: 40,
  7: 50,
  8: 60,
}

export class ExtensionConstructionPlanning implements ConstructionPlanning {

  plan(room: Room): void {
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    });
    throw new Error("Method not implemented.");
  }

}