import { describe, expect, test } from '@jest/globals';
import { layoutOverlay, LEVEL_COLORS } from './layout_overlay';

describe('layoutOverlay', () => {
    const layout = { 1: ['10_10_s', '11_11_r'], 3: ['14_14_t'] };

    test('draws each planned structure colored by its RCL, roads as dots', () => {
        const glyphs = layoutOverlay(layout, new Set()).filter(c => c.kind === 'glyph');
        expect(glyphs).toEqual([
            { kind: 'glyph', text: 's', x: 10, y: 10, color: LEVEL_COLORS[1], size: 0.5, opacity: 0.85 },
            { kind: 'glyph', text: '·', x: 11, y: 11, color: LEVEL_COLORS[1], size: 0.6, opacity: 0.85 },
            { kind: 'glyph', text: 't', x: 14, y: 14, color: LEVEL_COLORS[3], size: 0.5, opacity: 0.85 },
        ]);
    });

    test('fades structures that are built', () => {
        const glyphs = layoutOverlay(layout, new Set(['10_10_spawn'])).filter(c => c.kind === 'glyph');
        expect(glyphs.map(g => g.kind === 'glyph' && g.opacity)).toEqual([0.2, 0.85, 0.85]);
    });

    test('lists warnings above the legend', () => {
        const texts = layoutOverlay(layout, new Set(), ['no lab spot']).filter(c => c.kind === 'text');
        expect(texts.map(t => t.kind === 'text' && t.text)).toContain('⚠ no lab spot');
    });
});
