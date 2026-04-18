import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

const root = path.resolve(__dirname, '..', '..');
const scriptPath = path.join(root, 'scripts', 'verify-dist.mjs');
const distJsPath = path.join(root, 'dist', 'index.js');

const run = (): {status: number; stdout: string; stderr: string} => {
    try {
        const stdout = execFileSync('node', [scriptPath], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
        return {status: 0, stdout, stderr: ''};
    } catch (err: any) {
        return {
            status: err.status ?? 1,
            stdout: err.stdout?.toString() ?? '',
            stderr: err.stderr?.toString() ?? ''
        };
    }
};

const withMutatedDist = (mutator: (source: string) => string, body: () => void) => {
    const original = fs.readFileSync(distJsPath, 'utf8');
    try {
        fs.writeFileSync(distJsPath, mutator(original));
        body();
    } finally {
        fs.writeFileSync(distJsPath, original);
    }
};

describe('scripts/verify-dist.mjs', () => {
    afterEach(() => {
        // safety net
        if (!fs.existsSync(distJsPath)) return;
    });

    it('passes on the current dist output', () => {
        if (!fs.existsSync(distJsPath)) {
            // Build hasn't been run; skip.
            return;
        }
        const {status, stdout} = run();
        expect(status).toBe(0);
        expect(stdout).toContain('ok —');
    });

    it('detects drift when a destructured prop is not declared in VadImageProps', () => {
        if (!fs.existsSync(distJsPath)) return;
        withMutatedDist(
            (src) => src.replace('const VadImage = ({', 'const VadImage = ({ bogusDriftProp,'),
            () => {
                const {status, stderr} = run();
                expect(status).not.toBe(0);
                expect(stderr).toContain('Drift detected');
                expect(stderr).toContain('bogusDriftProp');
            }
        );
    });
});
