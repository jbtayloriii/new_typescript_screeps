import * as fs from 'fs';
import * as path from 'path';

/**
 * Reads a local file, for testing.
 * @param dirName The test directory.
 * @param subpath The path to the file, relative to the current directory.
 * @throws Error if the file could not be found
 */
export function readFile(dirName: string, subpath: string): string {
    try {
        const fullPath = path.join(dirName, subpath);
        return fs.readFileSync(fullPath, 'utf-8');
    } catch (e: unknown) {
        const error = e as Error;
        throw new Error(`Could not read file: ${error.message}`);
    }
}
