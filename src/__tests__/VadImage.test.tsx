import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('next/image', () => ({
    __esModule: true,
    default: (props: Record<string, unknown>) => {
        const {src, alt, width, height, priority, className, loading, unoptimized, style, sizes, ...rest} = props;
        const passthrough = {...rest};
        delete (passthrough as Record<string, unknown>).fetchPriority;
        return React.createElement('img', {
            src,
            alt,
            width,
            height,
            className,
            loading,
            sizes,
            style,
            ...(priority ? {'data-priority': 'true'} : {}),
            ...(unoptimized ? {'data-unoptimized': 'true'} : {})
        });
    }
}));

const BASE_ENV = {
    vadImage_imagesSizes: '320,640,1024,1920',
    vadImage_pixelRatio: '1,2,3',
    vadImage_formats: 'webp,avif',
    vadImage_optimizationDirName: '/opt/'
};

const applyEnv = (extra: Record<string, string | undefined> = {}) => {
    for (const k of Object.keys(BASE_ENV)) delete process.env[k];
    delete process.env.vadImage_enableUpload;
    delete process.env.vadImage_upload_domain;
    Object.assign(process.env, BASE_ENV, extra);
};

beforeEach(() => {
    applyEnv();
    vi.resetModules();
});

const loadModule = async () => await import('../index');

const countMatches = (haystack: string, re: RegExp): number => {
    const matches = haystack.match(re);
    return matches ? matches.length : 0;
};

describe('VadImage — upload domain rotation', () => {
    it('splits comma-separated vadImage_upload_domain and rotates across renders', async () => {
        applyEnv({
            vadImage_enableUpload: 'true',
            vadImage_upload_domain: 'https://a.example.com/,https://b.example.com/,https://c.example.com/'
        });
        vi.resetModules();
        const {default: VadImage} = await loadModule();

        const domainsSeen = new Set<string>();
        const rng = vi.spyOn(Math, 'random');
        // Force each of the 3 domains in turn.
        for (const idx of [0, 1, 2]) {
            rng.mockReturnValueOnce(idx / 3 + 0.01);
            const html = renderToStaticMarkup(
                React.createElement(VadImage, {src: '/public/foo.jpg', width: 1920, height: 1080, alt: ''})
            );
            const match = html.match(/https:\/\/[abc]\.example\.com\//);
            expect(match).toBeTruthy();
            domainsSeen.add(match![0]);
            // No raw commas inside any srcset URL.
            expect(html).not.toMatch(/"https:\/\/[^"]*,https:\/\//);
        }
        expect(domainsSeen.size).toBe(3);
        rng.mockRestore();
    });

    it('useOnlyOneDomain=true always picks domain index 0', async () => {
        applyEnv({
            vadImage_enableUpload: 'true',
            vadImage_upload_domain: 'https://primary.example.com/,https://secondary.example.com/'
        });
        vi.resetModules();
        const {default: VadImage} = await loadModule();

        // Random would pick index 1, but useOnlyOneDomain forces 0.
        vi.spyOn(Math, 'random').mockReturnValue(0.99);

        for (let i = 0; i < 5; i++) {
            const html = renderToStaticMarkup(
                React.createElement(VadImage, {
                    src: '/public/foo.jpg',
                    width: 1920,
                    height: 1080,
                    alt: '',
                    useOnlyOneDomain: true
                })
            );
            expect(html).toContain('https://primary.example.com/');
            expect(html).not.toContain('https://secondary.example.com/');
        }
    });

    it('all URLs inside one render share the same CDN domain', async () => {
        applyEnv({
            vadImage_enableUpload: 'true',
            vadImage_upload_domain: 'https://a.example.com/,https://b.example.com/'
        });
        vi.resetModules();
        const {default: VadImage} = await loadModule();

        // Force domain index 1.
        vi.spyOn(Math, 'random').mockReturnValue(0.9);

        const html = renderToStaticMarkup(
            React.createElement(VadImage, {src: '/public/foo.jpg', width: 1920, height: 1080, alt: ''})
        );
        expect(countMatches(html, /https:\/\/a\.example\.com\//g)).toBe(0);
        expect(countMatches(html, /https:\/\/b\.example\.com\//g)).toBeGreaterThan(0);
    });

    it('warns when enableUpload=true but vadImage_upload_domain is missing, and emits local URLs', async () => {
        applyEnv({vadImage_enableUpload: 'true'});
        vi.resetModules();
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const {default: VadImage} = await loadModule();

        const html = renderToStaticMarkup(
            React.createElement(VadImage, {src: '/public/foo.jpg', width: 1920, height: 1080, alt: ''})
        );

        expect(errSpy).toHaveBeenCalled();
        const message = errSpy.mock.calls[0].join(' ');
        expect(message).toMatch(/vadImage_upload_domain/);
        // URL is local (no scheme).
        expect(html).not.toContain('https://');
        expect(html).toContain('/opt/');
        errSpy.mockRestore();
    });
});

describe('VadImage — useBlobPreview', () => {
    it('overrides the inner <img> src with the provided blob/data URL', async () => {
        const {default: VadImage} = await loadModule();
        const blob = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {
                src: '/public/foo.jpg',
                width: 1920,
                height: 1080,
                alt: '',
                useBlobPreview: blob
            })
        );
        const imgMatch = html.match(/<img[^>]*src="([^"]*)"/);
        expect(imgMatch).toBeTruthy();
        expect(imgMatch![1]).toBe(blob);
    });
});

describe('VadImage — onlyMain', () => {
    it('srcSetMode="ratio" + onlyMain + mobileSrc → exactly 2 <source> tags (mobile + desktop), single format', async () => {
        const {default: VadImage} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {
                src: '/public/foo.jpg',
                mobileSrc: '/public/foo-m.jpg',
                width: 1920,
                height: 1080,
                alt: '',
                onlyMain: true,
                srcSetMode: 'ratio'
            })
        );
        const sourceCount = countMatches(html, /<source /g);
        expect(sourceCount).toBe(2);
        expect(html).toContain('image/webp');
        expect(html).not.toContain('image/avif');
    });

    it('srcSetMode="ratio" + onlyMain without mobileSrc → exactly 1 source tag', async () => {
        const {default: VadImage} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {
                src: '/public/foo.jpg',
                width: 1920,
                height: 1080,
                alt: '',
                onlyMain: true,
                srcSetMode: 'ratio'
            })
        );
        expect(countMatches(html, /<source /g)).toBe(1);
    });

    it('default (width-mode) onlyMain still emits a single format and drops non-mobile sizes', async () => {
        const {default: VadImage} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {
                src: '/public/foo.jpg',
                mobileSrc: '/public/foo-m.jpg',
                width: 1920,
                height: 1080,
                alt: '',
                onlyMain: true
            })
        );
        expect(html).toContain('image/webp');
        expect(html).not.toContain('image/avif');
        // Exactly two distinct size segments in URLs: mobile-max (<=878) and global-max.
        const sizesUsed = new Set(
            [...html.matchAll(/-(\d+)w-\d+x\.webp/g)].map((m) => Number(m[1]))
        );
        expect(sizesUsed.size).toBe(2);
    });
});

describe('VadImage — srcSetMode default', () => {
    it('defaults to width-descriptor srcSet matching 1.6.4 markup', async () => {
        const {default: VadImage} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {src: '/public/foo.jpg', width: 1920, height: 1080, alt: ''})
        );
        // width-descriptor shape: srcSet="/path/foo-NNNw-Rx.ext NNNw"
        expect(html).toMatch(/srcSet="[^"]*-320w-1x\.webp 320w"/);
        // Should NOT contain density descriptors in default mode.
        expect(html).not.toMatch(/srcSet="[^"]*-320w-1x\.webp 1x/);
    });

    it('srcSetMode="ratio" emits density-descriptor srcSets', async () => {
        const {default: VadImage} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {
                src: '/public/foo.jpg',
                width: 1920,
                height: 1080,
                alt: '',
                srcSetMode: 'ratio'
            })
        );
        expect(html).toMatch(/srcSet="[^"]* 1x, [^"]* 2x, [^"]* 3x"/);
    });
});

describe('VadImage — sizes pass-through', () => {
    it('threads sizes to the inner <img>', async () => {
        const {default: VadImage} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImage, {
                src: '/public/foo.jpg',
                width: 1920,
                height: 1080,
                alt: '',
                sizes: '(max-width: 768px) 100vw, 50vw'
            })
        );
        expect(html).toMatch(/<img[^>]*sizes="\(max-width: 768px\) 100vw, 50vw"/);
    });
});

describe('resolveVadImageUrl', () => {
    it('returns the largest-size primary URL that matches what VadImage emits', async () => {
        const {default: VadImage, resolveVadImageUrl} = await loadModule();
        const resolved = resolveVadImageUrl('/public/foo.jpg');
        // Should be largest size (1920), format[0]=webp, ratio 1x.
        expect(resolved).toMatch(/\/public\/opt\/foo-1920w-1x\.webp$/);

        const html = renderToStaticMarkup(
            React.createElement(VadImage, {src: '/public/foo.jpg', width: 1920, height: 1080, alt: ''})
        );
        // Resolved URL must appear somewhere in the emitted markup.
        expect(html).toContain(resolved);
    });

    it('respects useOnlyOneDomain in upload mode', async () => {
        applyEnv({
            vadImage_enableUpload: 'true',
            vadImage_upload_domain: 'https://primary.example.com/,https://secondary.example.com/'
        });
        vi.resetModules();
        const {resolveVadImageUrl} = await loadModule();
        vi.spyOn(Math, 'random').mockReturnValue(0.99);
        const resolved = resolveVadImageUrl('/public/foo.jpg', {useOnlyOneDomain: true});
        expect(resolved.startsWith('https://primary.example.com/')).toBe(true);
    });
});

describe('VadImagePreload', () => {
    it('renders a <link rel="preload"> with imagesrcset matching configured sizes', async () => {
        const {VadImagePreload} = await loadModule();
        const html = renderToStaticMarkup(
            React.createElement(VadImagePreload, {
                src: '/public/foo.jpg',
                sizes: '(max-width: 768px) 100vw, 50vw'
            })
        );
        expect(html).toContain('rel="preload"');
        expect(html).toContain('as="image"');
        // Attribute name casing differs across react/react-dom versions; match case-insensitively.
        expect(html).toMatch(/imagesrcset="[^"]*-320w-1x\.webp 320w[^"]*-1920w-1x\.webp 1920w"/i);
        expect(html).toMatch(/imagesizes="\(max-width: 768px\) 100vw, 50vw"/i);
        expect(html).toContain('fetchpriority="high"');
    });
});
