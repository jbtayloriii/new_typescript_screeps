import { BaseReport, CreepReport, SpawnQueueReport, TaskReport } from "base/base_report";
import { WorkerState } from "tasks/behaviors";
import { COLORS, Panel, PanelName, Row, VisualName } from "./types";

/** CPU numbers, read by the caller from `Game.cpu` (not part of the pure report). */
export interface CpuInfo {
    readonly used: number;
    readonly bucket: number;
}

/** Below this many ticks to live, a creep's TTL is highlighted. */
const LOW_TTL = 100;

const PART_LETTERS: Partial<Record<BodyPartConstant, string>> = {
    [WORK]: 'W', [CARRY]: 'C', [MOVE]: 'M', [ATTACK]: 'A', [RANGED_ATTACK]: 'R', [HEAL]: 'H', [CLAIM]: 'K', [TOUGH]: 'T',
};

/** A compact body, e.g. "5W 1M" or "3W 3C 3M", in order of first appearance. */
export function formatBody(body: readonly BodyPartConstant[]): string {
    const counts = new Map<BodyPartConstant, number>();
    for (const part of body) {
        counts.set(part, (counts.get(part) ?? 0) + 1);
    }
    return [...counts].map(([part, n]) => `${n}${PART_LETTERS[part] ?? part}`).join(' ');
}

/** Pads text to a column width; longer text is kept whole (the HUD cuts overlong rows). */
function pad(text: string, width: number): string {
    return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

export function headerPanel(report: BaseReport, cpu?: CpuInfo): Panel {
    const rcl = report.rclProgress === null ? `RCL ${report.rcl}` : `RCL ${report.rcl} (${Math.floor(report.rclProgress * 100)}%)`;
    const fraction = report.energyCapacity > 0 ? report.energyAvailable / report.energyCapacity : 0;
    const rows: Row[] = [
        { text: `${rcl} · ${report.economy.mode} · tick ${report.tick}` },
        {
            text: `Energy ${report.energyAvailable}/${report.energyCapacity} `,
            bar: { fraction, color: fraction >= 1 ? COLORS.good : COLORS.warn },
        },
        { text: `Spawns ${report.spawns.busy}/${report.spawns.total} busy`, color: COLORS.dim },
    ];
    if (cpu) {
        rows.push({ text: `CPU ${cpu.used.toFixed(1)} so far · bucket ${cpu.bucket}`, color: cpu.bucket < 1000 ? COLORS.bad : COLORS.dim });
    }
    return { title: report.roomName, rows };
}

function creepSummary(task: TaskReport): string {
    const creeps = task.creeps;
    const byRole = (role: CreepReport['role']) => creeps.filter(c => c.role === role).length;
    if (creeps.some(c => c.role)) {
        return ['miner', 'hauler', 'reserver', 'claimer', 'pioneer', 'melee', 'ranged', 'healer']
            .map(role => [role, byRole(role as CreepReport['role'])] as const)
            .filter(([, n]) => n > 0)
            .map(([role, n]) => `${role} ${n}`)
            .join(' ');
    }
    if (task.type === 'mine' && creeps.some(c => c.miner)) {
        return `miner ${creeps.filter(c => c.miner).length}`;
    }
    // One letter per creep: G(athering), W(orking), s(pawning), · (no state yet).
    return creeps.map(c => c.spawning ? 's' : c.state === WorkerState.WORKING ? 'W' : c.state === WorkerState.GATHERING ? 'G' : '·').join('');
}

export function tasksPanel(report: BaseReport): Panel {
    const order: TaskReport['type'][] = ['mine', 'haul', 'upgrade', 'build', 'repair', 'scout', 'remoteMine', 'claim', 'squad'];
    const tasks = [...report.tasks].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
    const rows: Row[] = tasks.map(task => {
        const minTtl = Math.min(...task.creeps.map(c => c.ticksToLive ?? Infinity));
        const ttl = Number.isFinite(minTtl) ? ` ttl ${minTtl}` : '';
        const name = pad(task.label ? `${task.type} ${task.label}` : task.type, 16);
        const count = `${task.creeps.length}/${task.wanted}`;
        const parts = [name, pad(count, 4), creepSummary(task), task.detail ?? '', ttl.trim()].filter(p => p.length > 0);
        const short = task.creeps.length < task.wanted;
        return {
            text: parts.join(' '),
            color: minTtl < LOW_TTL ? COLORS.warn : short ? COLORS.text : COLORS.dim,
        };
    });
    return { title: 'Tasks', rows: rows.length > 0 ? rows : [{ text: 'no tasks', color: COLORS.dim }] };
}

const STATUS_TEXT: Record<SpawnQueueReport['status'], string> = {
    spawning: 'spawning',
    waiting: 'waiting',
    queued: '',
    unaffordable: "can't afford",
};

/** Requests listed; the rest are summarized as "+N more". */
const MAX_QUEUE_ROWS = 6;

export function spawnQueuePanel(report: BaseReport): Panel {
    const rows: Row[] = report.spawnQueue.slice(0, MAX_QUEUE_ROWS).map(entry => {
        const marker = entry.status === 'spawning' ? '+' : entry.status === 'waiting' ? '>' : ' ';
        const status = entry.status === 'waiting'
            ? `waiting ${entry.energyLeft ?? report.energyAvailable}/${entry.cost}`
            : STATUS_TEXT[entry.status];
        const text = [
            marker,
            pad(entry.taskType ?? entry.taskName, 10),
            pad(`p${entry.priority}`, 4),
            pad(formatBody(entry.body), 12),
            pad(String(entry.cost), 5),
            status,
            entry.urgent ? '(urgent)' : '',
        ].filter(p => p.length > 0).join(' ');
        const color = entry.status === 'spawning' ? COLORS.good
            : entry.status === 'waiting' ? COLORS.warn
                : entry.status === 'unaffordable' ? COLORS.bad
                    : COLORS.dim;
        return { text, color };
    });
    if (report.spawnQueue.length > MAX_QUEUE_ROWS) {
        rows.push({ text: `  +${report.spawnQueue.length - MAX_QUEUE_ROWS} more`, color: COLORS.dim });
    }
    return { title: 'Spawn queue', rows: rows.length > 0 ? rows : [{ text: 'nothing to spawn', color: COLORS.dim }] };
}

/** Until stats recording exists, these are the economy summary's estimates. */
export function economyPanel(report: BaseReport): Panel {
    const { incomePerTick, upkeepPerTick } = report.economy;
    const spare = incomePerTick - upkeepPerTick;
    return {
        title: 'Economy (estimated)',
        rows: [
            { text: `income ${incomePerTick.toFixed(1)}/t · upkeep ${upkeepPerTick.toFixed(1)}/t` },
            { text: `spare ${spare.toFixed(1)}/t · upgrade budget ${report.upgradeBudget} WORK`, color: spare < 0 ? COLORS.bad : COLORS.text },
        ],
    };
}

/** The panels to draw, in HUD order. */
export function buildPanels(report: BaseReport, panels: readonly VisualName[], cpu?: CpuInfo): Panel[] {
    const builders: Record<PanelName, () => Panel> = {
        header: () => headerPanel(report, cpu),
        tasks: () => tasksPanel(report),
        spawn: () => spawnQueuePanel(report),
        economy: () => economyPanel(report),
    };
    return (['header', 'tasks', 'spawn', 'economy'] as const).filter(p => panels.includes(p)).map(p => builders[p]());
}
