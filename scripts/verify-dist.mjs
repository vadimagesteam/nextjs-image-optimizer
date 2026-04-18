#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(here, '..', 'dist');
const jsPath = path.join(distDir, 'index.js');
const dtsPath = path.join(distDir, 'index.d.ts');

const js = fs.readFileSync(jsPath, 'utf8');
const dts = fs.readFileSync(dtsPath, 'utf8');

const destructureMatch =
    js.match(/VadImage\s*=\s*\(\{([\s\S]*?)\}\)/) ||
    js.match(/function\s+VadImage\s*\(\{([\s\S]*?)\}\)/);

if (!destructureMatch) {
    console.error('[verify-dist] Could not locate VadImage destructure in dist/index.js');
    process.exit(1);
}

const destructured = destructureMatch[1]
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean)
    .filter((piece) => !piece.startsWith('...'))
    .map((piece) => piece.split(':')[0].split('=')[0].trim())
    .filter(Boolean);

const propsBlockMatch = dts.match(/interface\s+VadImageProps[^{]*\{([\s\S]*?)\n\}/);
if (!propsBlockMatch) {
    console.error('[verify-dist] Could not locate VadImageProps interface in dist/index.d.ts');
    process.exit(1);
}
const vadImagePropNames = [...propsBlockMatch[1].matchAll(/^\s*(\w+)\??\s*:/gm)].map((m) => m[1]);

const imagePropsKeys = new Set([
    'alt', 'src', 'width', 'height', 'fill', 'loader', 'quality', 'priority', 'loading', 'placeholder',
    'blurDataURL', 'unoptimized', 'overrideSrc', 'onLoadingComplete', 'objectFit', 'objectPosition',
    'lazyBoundary', 'lazyRoot', 'style', 'className', 'sizes', 'onLoad', 'onError', 'decoding', 'draggable',
    'id', 'role', 'tabIndex', 'title', 'crossOrigin', 'referrerPolicy', 'useMap'
]);

const known = new Set([...vadImagePropNames, ...imagePropsKeys]);
const missing = destructured.filter((name) => !known.has(name));

if (missing.length) {
    console.error(
        `[verify-dist] Drift detected — destructured props not declared in VadImageProps or ImageProps: ${missing.join(', ')}`
    );
    console.error('[verify-dist] Declared VadImageProps:', vadImagePropNames.join(', '));
    process.exit(1);
}

console.log(
    `[verify-dist] ok — ${destructured.length} destructured props resolve against VadImageProps (${vadImagePropNames.length}) + ImageProps.`
);
