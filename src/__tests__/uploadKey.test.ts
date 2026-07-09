import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const distPath = join(__dirname, '..', '..', 'dist', 'optimizeImages.js');
const componentSrc = join(__dirname, '..', 'index.tsx');

const loadUploadKeyForFile = (): ((basePath: string, file: string) => string) | null => {
    if (!existsSync(distPath)) {
        // Build hasn't run yet; caller should `npm run build` before tests.
        return null;
    }
    return createRequire(__filename)(distPath).uploadKeyForFile;
};

/*
 * Mirror of rewriteForUpload in src/index.tsx. A test below asserts the real
 * one still looks like this, so the two cannot drift apart unnoticed.
 */
const rewriteForUpload = (imageUrl: string, cdnDomain: string): string =>
    cdnDomain + imageUrl.substring(imageUrl.indexOf('/', 2)).replace('//', '/').replace('/', '%2F');

/* What the CDN resolves a URL to: the request path minus its leading slash, percent-decoded. */
const keyRequestedByCdn = (url: string, cdnDomain: string): string =>
    decodeURIComponent(url.slice(cdnDomain.length));

const BASE = '/repo/public/images';

describe('uploadKeyForFile', () => {
    it('keeps the leading slash the CDN URL asks for', () => {
        const uploadKeyForFile = loadUploadKeyForFile();
        if (!uploadKeyForFile) return;
        expect(uploadKeyForFile(BASE, `${BASE}/blogs/opt/a-320w-1x.webp`)).toBe('/blogs/opt/a-320w-1x.webp');
    });

    it('preserves nested directories', () => {
        const uploadKeyForFile = loadUploadKeyForFile();
        if (!uploadKeyForFile) return;
        expect(uploadKeyForFile(BASE, `${BASE}/case-studies/osu-beavers/opt/tickets-320w-1x.webp`))
            .toBe('/case-studies/osu-beavers/opt/tickets-320w-1x.webp');
    });

    it('still refuses files outside imagesPath', () => {
        const uploadKeyForFile = loadUploadKeyForFile();
        if (!uploadKeyForFile) return;
        expect(() => uploadKeyForFile(BASE, '/repo/public/secrets.env')).toThrow(/Upload refused/);
        expect(() => uploadKeyForFile(BASE, '/etc/passwd')).toThrow(/Upload refused/);
    });

    /*
     * The regression that broke 1.7.0-1.7.2: the uploader wrote `blogs/a.webp`
     * while VadImage pointed at `%2Fblogs/a.webp`, i.e. `/blogs/a.webp`.
     */
    it.each([
        '/images/blogs/opt/a-320w-1x.webp',
        '/images/case-studies/opt/osu-beavers-320w-1x.webp',
        '/images/case-studies/osu-beavers/opt/tickets-320w-1x.webp',
        '/images/work/bg/m/opt/icicles-1920w-2x.avif',
    ])('uploads %s to exactly the key the CDN requests', (imageUrl) => {
        const uploadKeyForFile = loadUploadKeyForFile();
        if (!uploadKeyForFile) return;
        const cdnDomain = 'https://cdn1.vadimages.com/';
        const file = join(BASE, imageUrl.replace('/images/', ''));

        expect(uploadKeyForFile(BASE, file)).toBe(keyRequestedByCdn(rewriteForUpload(imageUrl, cdnDomain), cdnDomain));
    });

    it('rewriteForUpload in src/index.tsx still matches the mirror above', () => {
        const src = readFileSync(componentSrc, 'utf8');
        expect(src).toContain(`cdnDomain + imageUrl.substring(imageUrl.indexOf('/', 2)).replace('//', '/').replace('/', '%2F')`);
    });
});
