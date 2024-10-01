

/** Memory mapper for handling Sources. */
export class MemorySource {


    /**
     * Creates a source memory object for initial mapping to Memory.
     * @param sourceId The ID of the Source to map
     * @returns The Source memory object if the Source exists, or null otherwise.
     */
    private static mapSource(sourceId: Id<Source>): SourceMemory | null {
        let sourceObj = Game.getObjectById(sourceId);
        if(!sourceObj) {
            return null;
        }

        memoryObj.x = sourceObj.pos.x;
        memoryObj.y = sourceObj.pos.y;
        memoryObj.roomName = sourceObj.room.name;
        memoryObj.canPowerHarvest = false;
        memoryObj.powerHarvesters = [];
        memoryObj.storageCarriers = [];

        let canPowerHarvest: boolean = false;
        let 
        
        let openSpaces = 0;
        for(let x = sourceObj.pos.x - 1; x <= sourceObj.pos.x + 1; x++) {
            for(let y = sourceObj.pos.y - 1; y <= sourceObj.pos.y + 1; y++) {
                let look = sourceObj.room.getPositionAt(x, y)!.look();
                look.forEach(function(lookObject) {                
                    if(lookObject !== undefined &&(lookObject.type == LOOK_STRUCTURES) && lookObject[LOOK_STRUCTURES]!.structureType == STRUCTURE_CONTAINER) {
                        canPowerHarvest = true;
                        memoryObj.sourceContainer = {
                            x : x,
                            y : y,
                            containerId : lookObject[LOOK_STRUCTURES].id
                        }
                    } else if(lookObject.type == LOOK_CONSTRUCTION_SITES && lookObject[LOOK_CONSTRUCTION_SITES].structureType == STRUCTURE_CONTAINER) {
                        memoryObj.canPowerHarvest = true;
                        memoryObj.sourceContainer = {
                            x : x,
                            y : y,
                        }
                    }
                });
            }
        }

        // Memory.memSources[mSourceId] = memoryObj;
        return {
            id: sourceObj.id,
            x: sourceObj.pos.x,
            y: sourceObj.pos.y,
            roomName: sourceObj.room.name,
            canPowerHarvest: canPowerHarvest,
            maxCreeps: openSpaces,
            currentPowerHarvester: undefined,
            currentCreepIds: [],
        };;
    }
}