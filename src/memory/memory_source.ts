

/** Memory mapper for handling Sources. */
export class MemorySource {


    /**
     * Creates a source memory object for initial mapping to Memory.
     * @param sourceId The ID of the Source to map
     * @returns The Source memory object if the Source exists, or null otherwise.
     */
    public static mapSourceMemory(sourceObj: Source): SourceMemory {
        let powerHarvestingContainerPosition = this.getSourceContainerPosition(sourceObj);

        // Memory.memSources[mSourceId] = memoryObj;
        return {
            id: sourceObj.id,
            x: sourceObj.pos.x,
            y: sourceObj.pos.y,
            roomName: sourceObj.room.name,
            maxCreeps: MemorySource.getOpenLocationsForSource(sourceObj),
            powerHarvestContainer: powerHarvestingContainerPosition,
            currentPowerHarvester: undefined,
            currentCreepIds: [],
        };;
    }

    private static getOpenLocationsForSource(source: Source): number {
        let openSpaces = 0;

        let terrain = source.room.getTerrain();

        for(let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
            for(let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) {
                    openSpaces += 1;
                }
            }
        }
        return openSpaces;
    }

    /** Returns the first position of a Container next to a Source (for power harvesting), or undefined if none exists. */
    private static getSourceContainerPosition(source: Source): ObjectPositionMemory | undefined {
        for(let x = source.pos.x - 1; x <= source.pos.x + 1; x++) {
            for(let y = source.pos.y - 1; y <= source.pos.y + 1; y++) {
                let look = source.room.getPositionAt(x, y)!.look();
                look.forEach(function(lookObject) {                
                    if(lookObject &&(lookObject.type == LOOK_STRUCTURES) && lookObject[LOOK_STRUCTURES]!.structureType == STRUCTURE_CONTAINER) {
                        let id = lookObject[LOOK_STRUCTURES]!.id;
                        if (id) {
                            return {
                                x : x,
                                y : y,
                                containerId : id
                            }
                        }
                    }
                });
            }
        }
        return undefined;
    }
}