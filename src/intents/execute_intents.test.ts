import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { mockGlobal, mockInstanceOf } from 'screeps-jest';
import { executeIntents } from './execute_intents';
import { Intent } from './types';

const sourceId = 'source' as Id<Source>;
const towerId = 'tower' as Id<StructureTower>;
const hostileId = 'hostile' as Id<Creep>;
const spawnId = 'spawn' as Id<StructureSpawn>;

let creep: Creep;
let objects: Record<string, unknown>;

beforeEach(() => {
    creep = mockInstanceOf<Creep>({
        harvest: () => OK,
        moveTo: () => OK,
        say: () => OK,
        upgradeController: () => ERR_NOT_IN_RANGE,
    });
    objects = {
        [sourceId]: mockInstanceOf<Source>({ id: sourceId }),
        [hostileId]: mockInstanceOf<Creep>({ id: hostileId }),
        [towerId]: mockInstanceOf<StructureTower>({ id: towerId, attack: () => OK }),
        [spawnId]: mockInstanceOf<StructureSpawn>({ id: spawnId, spawnCreep: () => OK }),
    };
    mockGlobal<Game>('Game', {
        creeps: { c1: creep },
        rooms: {},
        getObjectById: ((id: string) => objects[id] ?? null) as Game['getObjectById'],
    }, /* allowUndefinedAccess= */ true); // so missing creeps/rooms read as undefined
});

describe('executeIntents', () => {
    test('calls the matching API and returns its code, in order', () => {
        const intents: Intent[] = [
            { kind: 'harvest', creepName: 'c1', targetId: sourceId },
            { kind: 'upgrade', creepName: 'c1', targetId: 'ctrl' as Id<StructureController> },
        ];
        objects['ctrl'] = mockInstanceOf<StructureController>({ id: 'ctrl' });

        const results = executeIntents(intents);

        expect(results.map(r => r.code)).toEqual([OK, ERR_NOT_IN_RANGE]);
        expect(results.map(r => r.intent)).toEqual(intents);
        expect(creep.harvest).toHaveBeenCalledWith(objects[sourceId]);
    });

    test('moves to a RoomPosition with the given range', () => {
        executeIntents([{ kind: 'move', creepName: 'c1', target: { x: 5, y: 6, roomName: 'W1N1' }, range: 3 }]);

        const [target, opts] = (creep.moveTo as jest.Mock).mock.calls[0] as [RoomPosition, MoveToOpts];
        expect([target.x, target.y, target.roomName]).toEqual([5, 6, 'W1N1']);
        expect(opts).toEqual({ range: 3 });
    });

    test('runs tower and spawn intents', () => {
        const memory = { taskName: 't' } as CreepMemory;
        const results = executeIntents([
            { kind: 'towerAttack', towerId, targetId: hostileId },
            { kind: 'spawn', spawnId, body: [WORK, MOVE], name: 'n', memory },
        ]);

        expect(results.map(r => r.code)).toEqual([OK, OK]);
        expect((objects[towerId] as StructureTower).attack).toHaveBeenCalledWith(objects[hostileId]);
        expect((objects[spawnId] as StructureSpawn).spawnCreep).toHaveBeenCalledWith([WORK, MOVE], 'n', { memory });
    });

    test('returns error codes for missing creeps and targets instead of throwing', () => {
        const results = executeIntents([
            { kind: 'harvest', creepName: 'gone', targetId: sourceId },
            { kind: 'harvest', creepName: 'c1', targetId: 'missing' as Id<Source> },
            { kind: 'towerAttack', towerId: 'missing' as Id<StructureTower>, targetId: hostileId },
            { kind: 'createConstructionSite', pos: { x: 1, y: 1, roomName: 'W9N9' }, structureType: STRUCTURE_ROAD },
        ]);

        expect(results.map(r => r.code)).toEqual([ERR_NOT_FOUND, ERR_INVALID_TARGET, ERR_NOT_FOUND, ERR_NOT_FOUND]);
        expect(creep.harvest).not.toHaveBeenCalled();
    });

    test('recycles at a spawn and merges memory patches', () => {
        (objects[spawnId] as Record<string, unknown>).recycleCreep = jest.fn(() => OK);
        const memory = { taskName: 'old', baseRoomName: 'W1N1', state: 1 } as CreepMemory;
        (global as unknown as { Memory: Memory }).Memory = { creeps: { c1: memory } } as unknown as Memory;

        const results = executeIntents([
            { kind: 'recycle', spawnId, creepName: 'c1' },
            { kind: 'setCreepMemory', creepName: 'c1', patch: { taskName: 'new', state: undefined } },
            { kind: 'setCreepMemory', creepName: 'gone', patch: { taskName: 'new' } },
        ]);

        expect(results.map(r => r.code)).toEqual([OK, OK, ERR_NOT_FOUND]);
        expect(memory).toEqual({ taskName: 'new', baseRoomName: 'W1N1' });
    });

    test('activates safe mode', () => {
        objects['ctrl'] = mockInstanceOf<StructureController>({ id: 'ctrl', activateSafeMode: () => OK });
        expect(executeIntents([{ kind: 'activateSafeMode', controllerId: 'ctrl' as Id<StructureController> }])[0].code).toBe(OK);
        expect((objects['ctrl'] as StructureController).activateSafeMode).toHaveBeenCalled();
    });

    test('claims controllers and removes flags', () => {
        (creep as unknown as Record<string, unknown>).claimController = jest.fn(() => OK);
        objects['ctrl'] = mockInstanceOf<StructureController>({ id: 'ctrl' });
        const flag = { remove: jest.fn(() => OK) };
        mockGlobal<Game>('Game', {
            creeps: { c1: creep }, rooms: {}, flags: { f1: flag },
            getObjectById: ((id: string) => objects[id] ?? null) as Game['getObjectById'],
        }, true);

        const results = executeIntents([
            { kind: 'claimController', creepName: 'c1', targetId: 'ctrl' as Id<StructureController> },
            { kind: 'removeFlag', flagName: 'f1' },
            { kind: 'removeFlag', flagName: 'missing' },
        ]);
        expect(results.map(r => r.code)).toEqual([OK, OK, ERR_NOT_FOUND]);
        expect(flag.remove).toHaveBeenCalled();
    });

    test('runs combat intents', () => {
        const fighter = creep as unknown as Record<string, unknown>;
        for (const method of ['attack', 'rangedAttack', 'heal', 'rangedHeal', 'rangedMassAttack', 'attackController', 'reserveController']) {
            fighter[method] = jest.fn(() => OK);
        }
        objects['ctrl'] = mockInstanceOf<StructureController>({ id: 'ctrl' });
        const ctrl = 'ctrl' as Id<StructureController>;
        const results = executeIntents([
            { kind: 'attack', creepName: 'c1', targetId: hostileId },
            { kind: 'rangedAttack', creepName: 'c1', targetId: hostileId },
            { kind: 'heal', creepName: 'c1', targetId: hostileId },
            { kind: 'rangedHeal', creepName: 'c1', targetId: hostileId },
            { kind: 'rangedMassAttack', creepName: 'c1' },
            { kind: 'attackController', creepName: 'c1', targetId: ctrl },
            { kind: 'reserveController', creepName: 'c1', targetId: ctrl },
            { kind: 'rangedMassAttack', creepName: 'gone' },
        ]);
        expect(results.map(r => r.code)).toEqual([OK, OK, OK, OK, OK, OK, OK, ERR_NOT_FOUND]);
        expect(fighter.attack).toHaveBeenCalledWith(objects[hostileId]);
    });
});

