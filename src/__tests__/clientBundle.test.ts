import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const distPath = join(__dirname, '..', '..', 'dist', 'index.js');

describe('client bundle — no Node.js scheme imports', () => {
    it('dist/index.js contains no `node:` imports or requires', () => {
        if (!existsSync(distPath)) {
            // Build hasn't run yet; caller should `npm run build` before tests.
            return;
        }
        const contents = readFileSync(distPath, 'utf8');
        expect(contents).not.toMatch(/from ["']node:/);
        expect(contents).not.toMatch(/require\(["']node:/);
        expect(contents).not.toMatch(/import\(["']node:/);
    });

    it('dist/index.js does not import "path"', () => {
        if (!existsSync(distPath)) return;
        const contents = readFileSync(distPath, 'utf8');
        // Component entry is fully self-contained — no path module at all.
        expect(contents).not.toMatch(/from ["']path["']/);
        expect(contents).not.toMatch(/require\(["']path["']\)/);
    });
});
