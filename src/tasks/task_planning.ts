import { RoomSnapshot } from "snapshot/types";
import { TaskMemory, TaskSpec } from "./types";

/**
 * Returns the tasks a base needs but doesn't have yet:
 * - One harvest task per source.
 * - An upgrade task while the controller is mine.
 * - A build task while there are construction sites.
 * - A repair task.
 */
export function planTasks(home: RoomSnapshot, existing: readonly TaskMemory[]): TaskSpec[] {
    const specs: TaskSpec[] = [];
    const has = (type: TaskMemory['type']) => existing.some(t => t.type === type);

    for (const source of home.sources) {
        if (!existing.some(t => t.type === 'harvest' && t.sourceId === source.id)) {
            specs.push({ type: 'harvest', sourceId: source.id });
        }
    }
    if (home.controller?.my && !has('upgrade')) {
        specs.push({ type: 'upgrade' });
    }
    if (home.constructionSites.length > 0 && !has('build')) {
        specs.push({ type: 'build' });
    }
    if (!has('repair')) {
        specs.push({ type: 'repair' });
    }
    return specs;
}
