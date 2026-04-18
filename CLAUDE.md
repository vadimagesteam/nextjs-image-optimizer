# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project purpose

Published npm package `vadimages-nextjs-image-optimizer`: a build-time image optimizer for Next.js that generates pre-sized WebP/AVIF variants with `sharp`, plus a `<VadImage>` React component that emits a `<picture>` element pointing at those variants. Optionally uploads the generated files to Cloudflare R2 (or any S3-compatible bucket) and deletes the local copies.

## Commands

- `npm run build` — clean `dist/` and compile both entry points (`tsc` for `src/index.tsx` via `tsconfig.json`, then `tsc --project tsconfig.optimizeImages.json` for the CLI). `tsup.config.ts` exists in the repo but is **not** used by the build script.
- `npm run dev-optimization` — run the CLI (`src/optimizeImages.ts`) directly via `tsx` without building.
- No lint or test runner is configured (`npm test` intentionally fails).

## Architecture

Two disjoint entry points share only the `VadImageBlockConfig` shape and the `vadImage_*` env vars they both read.

### Runtime component — `src/index.tsx`
Default-exports `VadImage`, a wrapper around `next/image` that renders a `<picture>` with many `<source>` tags. Reads `vadImage_*` env vars **at render time** (so the Next.js runtime must have them in `process.env`, typically via `next.config.js` → `env`).

Source URL convention:
```
<dir>/<optimizationDirName>/<name>-<size>w-<ratio>x.<format>
```
- One `<source media="(max-width: Npx)">` per `(format, size, pixelRatio)` combo, plus a `(min-width: maxSize+1px)` set for screens wider than the largest size.
- `mobileSrc` substitutes a different source when `size <= 878` (the 878 constant is hard-coded; mobile breakpoint is fixed).
- When `vadImage_enableUpload === 'true'`, URLs are rewritten to `<uploadDomain>/<url-encoded path>` — directory separators become `%2F`.

### Build-time CLI — `src/optimizeImages.ts`
Shebanged Node script published as the package `bin`. Flow:
1. `loadNextConfig()` — parses `--nextConfigPath` CLI flag, calls Next.js's internal `loadConfig("phase-export", folder)` to read `next.config.js` and extract `env.vadImage_*` values.
2. `getFiles()` — recursive walk of `imagesPath`, filters by mime type `image/*`, skips anything whose path contains `optimizationDirName` (avoids re-processing its own output).
3. For each file, metadata is read once via `sharp(...).metadata()`, then for each `(size, ratio, format)` combo: hash = `md5(fileHash + size + ratio + format + quality)`. If the hash is already listed under this file in `.vadimages-cache.json` (in `process.cwd()`), the combo is skipped. Otherwise `sharp` generates the variant and the hash is appended to the cache. The cache is written atomically via write-to-tmp + rename.
4. Concurrency comes from `vadImage_concurrency` (default 7) and is applied to `PromisePool.withConcurrency`.
5. AVIF quality is always `quality - 15` (floored at 0); JPG/PNG/WEBP use `quality` as-is. `sharp` is called with `limitInputPixels: MAX_INPUT_PIXELS` (1 GP) as a DoS guard.
6. If upload is enabled, each generated file is PUT to R2/S3 with `ACL: 'public-read'` using `path.relative(imagesPath, file)` as the `Key` (upload is refused if the file falls outside `imagesPath`), then the local file is `unlinkSync`'d.

### Why two tsconfigs
`tsconfig.json` compiles only `src/index.tsx` with `module: ES2022` and `jsx: react` (for the React component export). `tsconfig.optimizeImages.json` compiles only `src/optimizeImages.ts` with `module: CommonJS` and no JSX (the CLI needs `require()` and a CJS shebang script). Each excludes the other's source file. Changing module settings globally will break one of the two outputs.

## Configuration surface (all `vadImage_*` env vars)

Both the component and CLI read the same keys, so they must be defined in `next.config.js` `env:` block to be visible to both Next's runtime and the CLI (which shells out through `loadConfig`). Keys: `imagesPath`, `buildFolderPath`, `quality`, `formats` (comma-joined), `optimizationDirName`, `imagesSizes` (comma-joined ints), `pixelRatio` (comma-joined ints), `enableUpload`, `upload_accessKey`, `upload_secretKey`, `upload_endpoint`, `upload_domain`, `upload_bucket`.

## Things to watch when editing

- `src/index.tsx` and `src/optimizeImages.ts` must agree on the filename convention `<name>-<size>w-<ratio>x.<format>` and on `optimizationDirName`. A change in one must be mirrored in the other or the component will point at URLs the CLI didn't produce.
- The cache file `.vadimages-cache.json` keys by path relative to `process.cwd()` (`file.replace(process.cwd(), '')`). Moving the optimizer's working directory invalidates the cache.
- The `878` mobile breakpoint in `src/index.tsx` is a magic number, not env-configurable.
- `src/index.tsx` reads all `vadImage_*` env vars at module load time (module scope, not per-render). Changes to those env vars after the module is first imported by Next will not take effect.
- Pixel ratios are rendered as density descriptors in a single `srcSet` per `(format, size)` (e.g. `url-1x 1x, url-2x 2x, url-3x 3x`), not as separate `<source>` elements — the browser picks the variant matching `devicePixelRatio`.
