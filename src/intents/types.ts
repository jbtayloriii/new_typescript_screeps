import { Pos } from "snapshot/types";

/**
 * Intents are plain-data descriptions of game actions. Decision logic returns intents, and
 * `executeIntents` is the only code that turns them into game API calls.
 *
 * Objects are referenced by ID or creep name (never by game object) so intents can be built from
 * snapshots and asserted on in tests with plain equality.
 */

export type MoveIntent = { kind: 'move'; creepName: string; target: Pos; range: number };
export type HarvestIntent = { kind: 'harvest'; creepName: string; targetId: Id<Source | Mineral> };
export type TransferIntent = { kind: 'transfer'; creepName: string; targetId: Id<AnyStoreStructure | Creep>; resource: ResourceConstant };
export type WithdrawIntent = { kind: 'withdraw'; creepName: string; targetId: Id<AnyStoreStructure | Tombstone | Ruin>; resource: ResourceConstant };
export type PickupIntent = { kind: 'pickup'; creepName: string; targetId: Id<Resource> };
export type BuildIntent = { kind: 'build'; creepName: string; targetId: Id<ConstructionSite> };
export type RepairIntent = { kind: 'repair'; creepName: string; targetId: Id<Structure> };
export type UpgradeIntent = { kind: 'upgrade'; creepName: string; targetId: Id<StructureController> };
export type SayIntent = { kind: 'say'; creepName: string; message: string };

export type CreepIntent =
    | MoveIntent
    | HarvestIntent
    | TransferIntent
    | WithdrawIntent
    | PickupIntent
    | BuildIntent
    | RepairIntent
    | UpgradeIntent
    | SayIntent;

/** Creep intents that act on a target object (everything except move and say). */
export type TargetedCreepIntent = Exclude<CreepIntent, MoveIntent | SayIntent>;

export type SpawnIntent = {
    kind: 'spawn';
    spawnId: Id<StructureSpawn>;
    body: BodyPartConstant[];
    name: string;
    memory: CreepMemory;
};

export type TowerAttackIntent = { kind: 'towerAttack'; towerId: Id<StructureTower>; targetId: Id<Creep> };
export type TowerHealIntent = { kind: 'towerHeal'; towerId: Id<StructureTower>; targetId: Id<Creep> };
export type TowerRepairIntent = { kind: 'towerRepair'; towerId: Id<StructureTower>; targetId: Id<Structure> };

export type TowerIntent = TowerAttackIntent | TowerHealIntent | TowerRepairIntent;

export type CreateConstructionSiteIntent = {
    kind: 'createConstructionSite';
    pos: Pos;
    structureType: BuildableStructureConstant;
};

export type Intent = CreepIntent | SpawnIntent | TowerIntent | CreateConstructionSiteIntent;

/** Return codes of the actions intents map to (upgradeController can also return ERR_ACCESS_DENIED). */
export type IntentReturnCode = ScreepsReturnCode | ERR_ACCESS_DENIED;

export interface IntentResult {
    readonly intent: Intent;
    readonly code: IntentReturnCode;
}
