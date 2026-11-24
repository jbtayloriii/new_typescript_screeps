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
export type ClaimControllerIntent = { kind: 'claimController'; creepName: string; targetId: Id<StructureController> };
export type ReserveControllerIntent = { kind: 'reserveController'; creepName: string; targetId: Id<StructureController> };
/** With CLAIM parts: reduces another player's reservation (or an enemy controller's downgrade timer). */
export type AttackControllerIntent = { kind: 'attackController'; creepName: string; targetId: Id<StructureController> };
export type AttackIntent = { kind: 'attack'; creepName: string; targetId: Id<Creep | Structure> };
export type RangedAttackIntent = { kind: 'rangedAttack'; creepName: string; targetId: Id<Creep | Structure> };
export type HealIntent = { kind: 'heal'; creepName: string; targetId: Id<Creep> };
export type RangedHealIntent = { kind: 'rangedHeal'; creepName: string; targetId: Id<Creep> };
/** Hits everything hostile within range 3, more the closer it is. Needs no target. */
export type RangedMassAttackIntent = { kind: 'rangedMassAttack'; creepName: string };

export type CreepIntent =
    | MoveIntent
    | HarvestIntent
    | TransferIntent
    | WithdrawIntent
    | PickupIntent
    | BuildIntent
    | RepairIntent
    | UpgradeIntent
    | ClaimControllerIntent
    | ReserveControllerIntent
    | AttackControllerIntent
    | AttackIntent
    | RangedAttackIntent
    | HealIntent
    | RangedHealIntent
    | RangedMassAttackIntent
    | SayIntent;

/** Creep intents that act on a target object (everything except move and say). */
export type TargetedCreepIntent = Exclude<CreepIntent, MoveIntent | SayIntent | RangedMassAttackIntent>;

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

/** Recycles a creep at an adjacent spawn, returning some of its energy cost. */
export type RecycleIntent = { kind: 'recycle'; spawnId: Id<StructureSpawn>; creepName: string };

/**
 * Merges `patch` into a creep's memory. A key set to undefined is deleted. This is how
 * decision logic changes creep state (e.g. task assignment or state machine transitions)
 * without touching Memory directly.
 */
export type SetCreepMemoryIntent = { kind: 'setCreepMemory'; creepName: string; patch: Partial<CreepMemory> };

/** `reason` says why (see defense/safe_mode.ts); it's logged when safe mode is activated. */
export type ActivateSafeModeIntent = { kind: 'activateSafeMode'; controllerId: Id<StructureController>; reason?: string };

/** Removes a flag, e.g. once its directive is done. */
export type RemoveFlagIntent = { kind: 'removeFlag'; flagName: string };

export type Intent =
    | ActivateSafeModeIntent
    | RemoveFlagIntent
    | CreepIntent
    | SpawnIntent
    | RecycleIntent
    | TowerIntent
    | CreateConstructionSiteIntent
    | SetCreepMemoryIntent;

/** Return codes of the actions intents map to (upgradeController can also return ERR_ACCESS_DENIED). */
export type IntentReturnCode = ScreepsReturnCode | ERR_ACCESS_DENIED;

export interface IntentResult {
    readonly intent: Intent;
    readonly code: IntentReturnCode;
}
