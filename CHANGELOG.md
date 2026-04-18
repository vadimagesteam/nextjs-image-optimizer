# Changelog

## 1.7.2

### Fixed

- **Webpack `UnhandledSchemeError` in client components.** `dist/index.js` no longer imports `node:path`. The `node:` protocol is Node-only and is not polyfilled by webpack / Turbopack / esbuild for browser targets, so any downstream Next.js project that used `<VadImage>` in a client component failed to build with `UnhandledSchemeError: Reading from "node:path" is not handled by plugins`. The component entry now has zero Node built-in dependencies — `path.parse()` is replaced with a small inline parser — which also drops `path-browserify` (~6 KB) from every consumer's client bundle and makes the component usable in edge runtime and workers without extra config.
- **Regression test** added: `dist/index.js` is asserted to contain no `node:` imports (or `"path"` imports) after every build. Would have caught the 1.7.1 break before publish.

### Unchanged

- The CLI (`dist/optimizeImages.js`) keeps `node:path` since it runs only under Node.
- All runtime behavior, props, env vars, filename convention, and peer-dep ranges are identical to 1.7.1.

## 1.7.1

### Restored (regressed in 1.7.0)

- **Multi-CDN rotation.** `vadImage_upload_domain` is again parsed as a comma-separated list of CDN origins; one domain is picked per `<VadImage>` render (shared across every `<source>` inside that `<picture>`). 1.7.0 used the raw string verbatim, producing URLs like `https://images.a.com/,https://images.b.com/...` that 404ed.
- **`useOnlyOneDomain?: boolean`** prop — forces the CDN index to `0` instead of a random pick. Useful for images whose URL you want to be deterministic (OG tags, preloads, etc.).
- **`useBlobPreview?: string`** prop — when set, the inner `<img>` uses this value (typically a data URL or tiny pre-resolved image) as its initial `src` until hydration.
- **`onlyMain?: boolean`** prop — collapses the generated `srcset` to a bare minimum (one mobile size if `mobileSrc` is set, plus the max desktop size) and emits only the first configured format. For below-the-fold thumbnails.
- **Width-descriptor `srcSet` markup** is again the default. 1.7.0 switched to density descriptors (`1x, 2x, 3x`), which invalidated downstream HTML-equality checks and cache keys. 1.7.1 restores the 1.6.4 shape and adds a `srcSetMode?: "width" | "ratio"` prop for consumers who want to opt into density descriptors.

### Added

- **`resolveVadImageUrl(src, opts?)`** — server-safe helper that returns a single primary image URL (largest size, first format, upload-rewritten). Use it for `generateMetadata().openGraph.images[0].url`, JSON-LD `"image"`, or inside `<link rel="preload">`.
- **`<VadImagePreload>`** — trivial component that emits `<link rel="preload" as="image" imagesrcset=... imagesizes=... fetchpriority="high">`. Render inside a layout `<head>` for LCP images.
- **`sizes` pass-through** — the `sizes` prop is now explicitly threaded to the inner `<Image>` so the browser can pick correctly when width-descriptor `srcSet`s are in play.
- **Env-var validation.** When `vadImage_enableUpload === 'true'` but `vadImage_upload_domain` is empty, a single clear `console.error` is logged and the component falls back to local paths instead of silently emitting malformed URLs.
- **Build-time drift guard.** `scripts/verify-dist.mjs` runs after `tsc` and fails the build if any prop destructured by `VadImage` in `dist/index.js` is not declared in `VadImageProps`. This is how the 1.7.0 regression slipped through.

### Not yet addressed

- **Per-image `quality` override.** `VadImageProps` still `Omit`s `quality`: honoring it at render time would require the CLI to pre-generate variants at non-default qualities (filename includes quality in the hash). Tracked as a follow-up; the global `vadImage_quality` env remains the only knob.

### Unchanged from 1.7.0

- Next.js 15 / 16 peer-dep support and the `engines.node >= 20.9.0` requirement.
- All `vadImage_*` environment variable names and the `<optimizationDirName>/<name>-<size>w-<ratio>x.<format>` filename convention — the contract with consumers is untouched.
- The image optimizer CLI (`src/optimizeImages.ts`) and the `sharp` pipeline.
