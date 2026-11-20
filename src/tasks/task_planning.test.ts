import { describe, expect, test } from '@jest/globals';
import { planTasks } from './task_planning';
import { aRoom } from 'testing/builders/room_snapshot_builder';
import { TaskMemory } from './types';

describe('planTasks', () => {
    test('creates harvest per source, upgrade, build (with sites) and repair for a new base', () => {
        const room = aRoom().withRcl(1).withSource(10, 10).withSource(40, 40).withConstructionSite(STRUCTURE_ROAD, 5, 5).build();
        expect(planTasks(room, [])).toEqual([
            { type: 'harvest', sourceId: room.sources[0].id },
            { type: 'harvest', sourceId: room.sources[1].id },
            { type: 'upgrade' },
            { type: 'build' },
            { type: 'repair' },
        ]);
    });

    test('creates nothing that already exists', () => {
        const room = aRoom().withRcl(1).withSource(10, 10).withConstructionSite(STRUCTURE_ROAD, 5, 5).build();
        const existing: TaskMemory[] = [
            { name: 'h', roomName: 'W1N1', type: 'harvest', sourceId: room.sources[0].id },
            { name: 'u', roomName: 'W1N1', type: 'upgrade' },
            { name: 'b', roomName: 'W1N1', type: 'build' },
            { name: 'r', roomName: 'W1N1', type: 'repair' },
        ];
        expect(planTasks(room, existing)).toEqual([]);
    });

    test('skips build without sites and upgrade without my controller', () => {
        expect(planTasks(aRoom().build(), [])).toEqual([{ type: 'repair' }]);
    });
});
