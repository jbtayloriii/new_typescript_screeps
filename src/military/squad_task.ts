import { Intent } from "intents/types";
import { getMyStructures, getRange } from "snapshot/queries";
import { MyCreepSnapshot, Pos, RoomSnapshot } from "snapshot/types";
import { SpawnRequest, SquadTaskMemory, TaskContext, TaskDefinition } from "tasks/types";
import { chooseTarget, CombatRole, CombatTarget, decideCombat, StructureTargets } from "./combat";
import {
    DEFAULT_SQUAD_SIZE, Mission, MISSION_PRIORITY, RETREAT_BELOW, RETREAT_RECOVER, SQUAD_BODIES, squadComposition, SquadState,
} from "./squads";

/** The leader waits for members farther away than this (outside combat). */
export const COHESION_RANGE = 3;
/** Members count as gathered at the rally point within this range. */
export const RALLY_RANGE = 4;
/** Escorts engage hostiles within this range of the creeps they guard. */
export const ESCORT_GUARD_RANGE = 6;
/** Any squad member fights back against hostiles this close, wherever it is. */
const SELF_DEFENSE_RANGE = 3;

const ROOM_CENTER_RANGE = 20;

const ROLE_ORDER: readonly CombatRole[] = ['melee', 'ranged', 'healer'];

function roleOf(creep: MyCreepSnapshot): CombatRole {
    const role = creep.memory.role;
    return role === 'melee' || role === 'ranged' || role === 'healer' ? role : 'melee';
}

function isOnEdge(pos: Pos): boolean {
    return pos.x === 0 || pos.y === 0 || pos.x === 49 || pos.y === 49;
}

/** The squad's leader: fighters before healers, then by name, so it's stable tick to tick. */
export function chooseLeader(members: readonly MyCreepSnapshot[]): MyCreepSnapshot | null {
    return [...members].sort((a, b) =>
        ROLE_ORDER.indexOf(roleOf(a)) - ROLE_ORDER.indexOf(roleOf(b)) || a.name.localeCompare(b.name))[0] ?? null;
}

/** The squad's state: the most common state among members that have one, else RALLY. */
export function currentSquadState(members: readonly MyCreepSnapshot[]): SquadState {
    const counts = new Map<number, number>();
    for (const m of members) {
        if (m.memory.state !== undefined) {
            counts.set(m.memory.state, (counts.get(m.memory.state) ?? 0) + 1);
        }
    }
    let best: number = SquadState.RALLY;
    let bestCount = 0;
    for (const [state, count] of counts) {
        if (count > bestCount) {
            best = state;
            bestCount = count;
        }
    }
    return best as SquadState;
}

/** The squad's total hits as a fraction of total max hits. */
export function squadHealth(members: readonly MyCreepSnapshot[]): number {
    const max = members.reduce((sum, m) => sum + m.hitsMax, 0);
    return max === 0 ? 1 : members.reduce((sum, m) => sum + m.hits, 0) / max;
}

/**
 * The next squad state:
 * - RALLY → ENGAGE once every role is filled, nobody is spawning, and all are at the rally point;
 * - ENGAGE → RETREAT below RETREAT_BELOW total health;
 * - RETREAT → ENGAGE once back above RETREAT_RECOVER.
 */
export function nextSquadState(
    state: SquadState,
    members: readonly MyCreepSnapshot[],
    wanted: number,
    rally: Pos): SquadState {
    switch (state) {
        case SquadState.RALLY: {
            const ready = members.length >= wanted
                && members.every(m => !m.spawning && getRange(m.pos, rally) <= RALLY_RANGE);
            return ready ? SquadState.ENGAGE : SquadState.RALLY;
        }
        case SquadState.ENGAGE:
            return squadHealth(members) < RETREAT_BELOW ? SquadState.RETREAT : SquadState.ENGAGE;
        case SquadState.RETREAT:
            return squadHealth(members) >= RETREAT_RECOVER ? SquadState.ENGAGE : SquadState.RETREAT;
    }
}

/** Where the squad gathers and retreats to: next to the home spawn, else the home room's center. */
export function rallyPoint(home: RoomSnapshot): Pos {
    return getMyStructures(home, STRUCTURE_SPAWN)[0]?.pos ?? { x: 25, y: 25, roomName: home.name };
}

/** Escorts: the creeps of the escorted directive's task(s) in this base. */
function escortedCreeps(task: SquadTaskMemory, ctx: TaskContext): MyCreepSnapshot[] {
    const escortedId = ctx.directives[task.directiveId]?.escortedId;
    if (!escortedId) {
        return [];
    }
    const taskNames = new Set(ctx.baseTasks.filter(t => 'directiveId' in t && t.directiveId === escortedId).map(t => t.name));
    return ctx.world.myCreeps.filter(c => taskNames.has(c.memory.taskName) && !c.spawning)
        .sort((a, b) => a.name.localeCompare(b.name));
}

const STRUCTURE_TARGETS: Record<Mission, StructureTargets> = {
    attack: 'all',
    defend: 'invaderCores',
    escort: 'none',
};

/** The target for one member: in the mission area per the mission's rules, plus self-defense anywhere. */
function targetFor(member: MyCreepSnapshot, task: SquadTaskMemory, ctx: TaskContext, guarded: readonly MyCreepSnapshot[]): CombatTarget | null {
    const room = ctx.world.getRoom(member.pos.roomName);
    if (!room) {
        return null;
    }
    if (task.mission === 'escort') {
        const threat = chooseTarget(member.pos, room, 'none');
        const nearGuarded = threat && guarded.some(g => getRange(g.pos, threat.pos) <= ESCORT_GUARD_RANGE);
        if (threat && (nearGuarded || getRange(member.pos, threat.pos) <= SELF_DEFENSE_RANGE)) {
            return threat;
        }
        return null;
    }
    if (member.pos.roomName === task.targetRoom) {
        return chooseTarget(member.pos, room, STRUCTURE_TARGETS[task.mission]);
    }
    const nearby = chooseTarget(member.pos, room, 'none');
    return nearby && getRange(member.pos, nearby.pos) <= SELF_DEFENSE_RANGE ? nearby : null;
}

/**
 * A combat squad for an attack, defend or escort directive.
 *
 * Members (melee, ranged, healers; see `squadComposition`) gather at the rally point next to the
 * home spawn until the squad is complete, then move out together: the leader heads for the
 * target (the target room, or the escorted creeps), followers stay next to the leader, and the
 * leader waits for anyone more than COHESION_RANGE behind (except on room-edge tiles, where
 * waiting would bounce it between rooms). In the mission area every member fights (see
 * `decideCombat`). Below 40% total health the squad retreats to the rally point and re-engages
 * at 90%. A replacement for a lost member joins the squad wherever it is.
 */
export const squadTask: TaskDefinition<SquadTaskMemory> = {
    getSpawnRequests(task, ctx) {
        const directive = ctx.directives[task.directiveId];
        if (!directive || directive.status !== 'active') {
            return [];
        }
        const roles = squadComposition(task.mission, directive.size ?? DEFAULT_SQUAD_SIZE[task.mission]);
        const requests: SpawnRequest[] = [];
        for (const role of ROLE_ORDER) {
            const have = ctx.creeps.filter(c => c.memory.role === role).length;
            const want = roles.filter(r => r === role).length;
            for (let i = have; i < want; i++) {
                requests.push({
                    taskName: task.name,
                    priority: MISSION_PRIORITY[task.mission] - requests.length,
                    body: SQUAD_BODIES[role],
                    memory: { role },
                });
            }
        }
        return requests;
    },

    decide(task, ctx) {
        const directive = ctx.directives[task.directiveId];
        const members = ctx.creeps.filter(c => !c.spawning);
        if (!directive || members.length === 0) {
            return [];
        }
        const intents: Intent[] = [];
        const wanted = squadComposition(task.mission, directive.size ?? DEFAULT_SQUAD_SIZE[task.mission]).length;
        const rally = rallyPoint(ctx.home);
        const state = currentSquadState(members);
        const next = nextSquadState(state, ctx.creeps, wanted, rally);
        for (const m of ctx.creeps) {
            // New members (no state yet) join the squad's state, so reinforcements go straight to it.
            if (m.memory.state !== next) {
                intents.push({ kind: 'setCreepMemory', creepName: m.name, patch: { state: next } });
            }
        }

        const leader = chooseLeader(members)!;
        const guarded = task.mission === 'escort' ? escortedCreeps(task, ctx) : [];
        const destination: Pos | null = next !== SquadState.ENGAGE ? rally
            : task.mission === 'escort' ? guarded[0]?.pos ?? rally
                : { x: 25, y: 25, roomName: task.targetRoom };
        const destinationRange = next !== SquadState.ENGAGE ? RALLY_RANGE - 1
            : task.mission === 'escort' ? 2 : ROOM_CENTER_RANGE;

        for (const member of members) {
            const role = roleOf(member);
            const room = ctx.world.getRoom(member.pos.roomName);
            // Retreating squads only fight back; otherwise they fight in the mission area.
            const target = next === SquadState.ENGAGE ? targetFor(member, task, ctx, guarded)
                : room ? (() => {
                    const t = chooseTarget(member.pos, room, 'none');
                    return t && getRange(member.pos, t.pos) <= SELF_DEFENSE_RANGE ? t : null;
                })() : null;

            if (room && (target || role === 'healer')) {
                const follow = member === leader ? destination : leader.pos;
                intents.push(...decideCombat(member, role, target, room, members, follow));
                // A healer leading (healer-only squad) still travels when nobody needs healing.
                if (role === 'healer' && member === leader && destination && !intents.some(i => i.kind === 'move' && i.creepName === member.name)
                    && getRange(member.pos, destination) > destinationRange) {
                    intents.push({ kind: 'move', creepName: member.name, target: destination, range: destinationRange });
                }
                continue;
            }

            if (member === leader) {
                const straggler = members.some(m => m !== leader && getRange(m.pos, leader.pos) > COHESION_RANGE);
                const waiting = next === SquadState.ENGAGE && straggler && !isOnEdge(leader.pos);
                if (!waiting && destination && getRange(leader.pos, destination) > destinationRange) {
                    intents.push({ kind: 'move', creepName: leader.name, target: destination, range: destinationRange });
                }
            } else if (getRange(member.pos, leader.pos) > 1) {
                intents.push({ kind: 'move', creepName: member.name, target: leader.pos, range: 1 });
            }
        }
        return intents;
    },

    isDone(task, ctx) {
        return ctx.directives[task.directiveId]?.status !== 'active';
    },
};
