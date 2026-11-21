import { describe, expect, jest, test } from '@jest/globals';
import { renderCommands } from './render';

describe('renderCommands', () => {
    test('draws rects and left-aligned monospace text', () => {
        const visual = { rect: jest.fn(), text: jest.fn() };
        renderCommands([
            { kind: 'rect', x: 1, y: 2, width: 3, height: 4, fill: '#000', opacity: 0.5 },
            { kind: 'text', text: 'hi', x: 1, y: 2, color: '#fff', size: 0.5 },
        ], visual as unknown as RoomVisual);

        expect(visual.rect).toHaveBeenCalledWith(1, 2, 3, 4, { fill: '#000', opacity: 0.5 });
        expect(visual.text).toHaveBeenCalledWith('hi', 1, 2, { color: '#fff', font: '0.5 monospace', align: 'left' });
    });
});
