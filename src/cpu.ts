/** The bucket must be full to generate a pixel (generating one costs the whole bucket). */
export const PIXEL_BUCKET_THRESHOLD = 10000;

/**
 * Generates a pixel when the CPU bucket is full. Returns true if one was generated.
 *
 * `generatePixel` only exists on the official servers, so this does nothing on private servers.
 */
export function maybeGeneratePixel(cpu: Pick<CPU, 'bucket'> & Partial<Pick<CPU, 'generatePixel'>>): boolean {
    if (cpu.bucket < PIXEL_BUCKET_THRESHOLD || typeof cpu.generatePixel !== 'function') {
        return false;
    }
    return cpu.generatePixel() === OK;
}
