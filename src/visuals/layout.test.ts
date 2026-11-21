import { describe, expect, test } from '@jest/globals';
import { HUD, layoutHud, truncate } from './layout';
import { COLORS } from './types';

describe('truncate', () => {
    test('cuts long text with an ellipsis', () => {
        expect(truncate('hello', 10)).toBe('hello');
        expect(truncate('hello world', 6)).toBe('hello…');
    });
});

describe('layoutHud', () => {
    test('stacks panels from the top-left, each with a background, title and rows', () => {
        const commands = layoutHud([
            { title: 'A', rows: [{ text: 'one' }, { text: 'two', color: COLORS.warn }] },
            { title: 'B', rows: [] },
        ]);
        const rects = commands.filter(c => c.kind === 'rect');
        const texts = commands.filter(c => c.kind === 'text');

        expect(rects).toHaveLength(2);
        expect(rects[0]).toMatchObject({ x: HUD.x, y: HUD.y });
        // The second panel starts below the first (3 lines + padding) plus the gap
        expect(rects[1].y).toBeCloseTo(HUD.y + 3 * HUD.lineHeight + 2 * HUD.padding + HUD.gap);
        expect(texts.map(t => t.kind === 'text' && t.text)).toEqual(['A', 'one', 'two', 'B']);
        expect(texts[2]).toMatchObject({ color: COLORS.warn });
    });

    test('draws a bar after the row text, filled by its fraction', () => {
        const commands = layoutHud([{ title: 'A', rows: [{ text: 'Energy ', bar: { fraction: 0.25, color: COLORS.good } }] }]);
        const [, empty, filled] = commands.filter(c => c.kind === 'rect');
        expect(empty.kind === 'rect' && filled.kind === 'rect' && filled.width / empty.width).toBeCloseTo(0.25);
        expect(filled).toMatchObject({ fill: COLORS.good, x: HUD.x + HUD.padding + 'Energy '.length * HUD.charWidth });
    });

    test('truncates rows longer than the HUD', () => {
        const [, , row] = layoutHud([{ title: 'A', rows: [{ text: 'x'.repeat(HUD.widthChars + 10) }] }]);
        expect(row.kind === 'text' && row.text.length).toBe(HUD.widthChars);
    });
});
