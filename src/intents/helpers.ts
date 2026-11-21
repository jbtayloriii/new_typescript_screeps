import { getRange } from "snapshot/queries";
import { Pos } from "snapshot/types";
import { MoveIntent, TargetedCreepIntent } from "./types";

/** The range each targeted creep action works at. */
export const ACTION_RANGE: Record<TargetedCreepIntent['kind'], number> = {
    harvest: 1,
    transfer: 1,
    withdraw: 1,
    pickup: 1,
    build: 3,
    repair: 3,
    upgrade: 3,
    claimController: 1,
    reserveController: 1,
};

/**
 * Returns `action` if the creep is close enough to perform it, otherwise a move toward the
 * target. Use it for the common "act on it, or walk to it first" pattern.
 */
export function actOrApproach(
    creepPos: Pos,
    targetPos: Pos,
    action: TargetedCreepIntent): TargetedCreepIntent | MoveIntent {
    const range = ACTION_RANGE[action.kind];
    if (getRange(creepPos, targetPos) <= range) {
        return action;
    }
    return { kind: 'move', creepName: action.creepName, target: targetPos, range: range };
}
