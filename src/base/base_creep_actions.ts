/** Set of actions that a creep within a base can perform. */
export interface BaseCreepActions {

    /** The room name of the owning base for this Creep. */
    baseRoomName: string;

    

    /** Returns a manner for a Creep to get energy to perform actions.
     * 
     * The default priority is:
     *  1. Use the storage structure in the room, if present with > 100 energy
     *  2. Use a power harvesting container, if present with > 100 energy
     *  3. Use an open Source, if present
     */
    getEnergySource(): Array<StructureStorage | StructureContainer | Source>;
}