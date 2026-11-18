import { describe, expect, jest, test } from '@jest/globals';
import { maybeGeneratePixel, PIXEL_BUCKET_THRESHOLD } from './cpu';

describe('maybeGeneratePixel', () => {
    test('generates a pixel when the bucket is full', () => {
        const generatePixel = jest.fn(() => OK as OK);
        expect(maybeGeneratePixel({ bucket: PIXEL_BUCKET_THRESHOLD, generatePixel })).toBe(true);
        expect(generatePixel).toHaveBeenCalledTimes(1);
    });

    test('does nothing when the bucket is not full', () => {
        const generatePixel = jest.fn(() => OK as OK);
        expect(maybeGeneratePixel({ bucket: PIXEL_BUCKET_THRESHOLD - 1, generatePixel })).toBe(false);
        expect(generatePixel).not.toHaveBeenCalled();
    });

    test('does nothing on servers without generatePixel', () => {
        expect(maybeGeneratePixel({ bucket: PIXEL_BUCKET_THRESHOLD })).toBe(false);
    });
});
