import Image, {ImageProps, StaticImageData} from "next/image";
import React from "react";
import path from "node:path";
import {NextConfig} from "next";

export enum ImageType {
    JPG = 'jpg',
    PNG = 'png',
    WEBP = 'webp',
    AVIF = 'avif'
}

export type SrcSetMode = 'width' | 'ratio';

export interface VadImageProps
    extends Omit<ImageProps, "src" | "quality"> {
    src: string | StaticImageData;
    basePath?: string;
    mobileSrc?: string;
    mobileWidth?: number;
    mobileHeight?: number;
    useOnlyOneDomain?: boolean;
    useBlobPreview?: string;
    onlyMain?: boolean;
    srcSetMode?: SrcSetMode;
}

export interface VadImageBlockConfig {
    imagesSizes: number[];
    pixelRatio: number[];
    optimizationDirName: string;
    formats: ImageType[];
    quality: number;
    imagesPath: string;
    buildFolderPath: string;
    enableUpload: boolean;
    uploadAccessKey?: string;
    uploadSecretKey?: string;
    uploadDomain?: string;
    uploadEndpoint?: string;
    uploadBucket?: string;
}

export interface VadImageConfig extends NextConfig {
    VadImage: VadImageBlockConfig;
}

const DEFAULT_SIZES = [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920];
const DEFAULT_RATIOS = [1, 2, 3];
const DEFAULT_FORMATS: ImageType[] = [ImageType.WEBP, ImageType.AVIF];
const DEFAULT_OPT_DIR = '/opt/';
const MOBILE_BREAKPOINT = 878;

interface EnvConfig {
    imagesSizes: number[];
    pixelRatio: number[];
    optimizationDirName: string;
    formats: ImageType[];
    enableUpload: boolean;
    uploadDomains: string[];
}

let envWarned = false;

const readEnv = (): EnvConfig => {
    const imagesSizes = process.env.vadImage_imagesSizes?.split(',').map((v) => Number(v)) ?? DEFAULT_SIZES;
    const pixelRatio = process.env.vadImage_pixelRatio?.split(',').map((v) => Number(v)) ?? DEFAULT_RATIOS;
    const optimizationDirName = process.env.vadImage_optimizationDirName ?? DEFAULT_OPT_DIR;
    const formats = process.env.vadImage_formats?.split(',').map((v) => v as ImageType) ?? DEFAULT_FORMATS;
    const enableUpload = process.env.vadImage_enableUpload === 'true';
    const uploadDomains = process.env.vadImage_upload_domain?.split(',').filter(Boolean) ?? [];
    if (enableUpload && uploadDomains.length === 0 && !envWarned) {
        envWarned = true;
        // eslint-disable-next-line no-console
        console.error(
            '[vadimages-nextjs-image-optimizer] vadImage_enableUpload=true but vadImage_upload_domain is empty or missing; falling back to local paths.'
        );
    }
    return {imagesSizes, pixelRatio, optimizationDirName, formats, enableUpload, uploadDomains};
};

const resolveSrc = (src: string | StaticImageData): string =>
    typeof src === 'string' ? src : src.src;

const rewriteForUpload = (imageUrl: string, cdnDomain: string): string =>
    cdnDomain + imageUrl.substring(imageUrl.indexOf('/', 2)).replace('//', '/').replace('/', '%2F');

const buildVariantUrl = (
    dir: string,
    name: string,
    size: number,
    ratio: number,
    format: ImageType,
    optDir: string
): string => `${dir}${optDir}${name}-${size}w-${ratio}x.${format}`;

const maybeUpload = (
    url: string,
    enabled: boolean,
    cdnDomain: string | undefined
): string => (enabled && cdnDomain ? rewriteForUpload(url, cdnDomain) : url);

const pickCdnIndex = (domains: string[], useOnlyOneDomain: boolean): number => {
    if (domains.length === 0) return 0;
    return useOnlyOneDomain ? 0 : Math.floor(Math.random() * domains.length);
};

export interface ResolveVadImageUrlOptions {
    useOnlyOneDomain?: boolean;
    format?: ImageType;
    size?: number;
    pixelRatio?: 1 | 2 | 3;
}

export function resolveVadImageUrl(
    src: string | StaticImageData,
    opts?: ResolveVadImageUrlOptions
): string {
    const cfg = readEnv();
    const pathData = path.parse(resolveSrc(src));
    const size = opts?.size ?? Math.max(...cfg.imagesSizes);
    const format = opts?.format ?? cfg.formats[0];
    const ratio = opts?.pixelRatio ?? 1;
    const cdnIndex = pickCdnIndex(cfg.uploadDomains, !!opts?.useOnlyOneDomain);
    const cdnDomain = cfg.uploadDomains[cdnIndex];
    const url = buildVariantUrl(pathData.dir, pathData.name, size, ratio, format, cfg.optimizationDirName).replace('//', '/');
    return maybeUpload(url, cfg.enableUpload, cdnDomain);
}

const VadImage = ({
                      src,
                      mobileSrc,
                      mobileHeight,
                      mobileWidth,
                      priority = false,
                      loading,
                      className,
                      width,
                      height,
                      unoptimized,
                      alt = "",
                      style,
                      sizes,
                      useOnlyOneDomain,
                      useBlobPreview,
                      onlyMain,
                      srcSetMode = 'width',
                      ...rest
                  }: VadImageProps) => {
    const cfg = readEnv();
    const {optimizationDirName, enableUpload, uploadDomains} = cfg;
    let {imagesSizes, pixelRatio, formats} = cfg;

    const cdnIndex = pickCdnIndex(uploadDomains, !!useOnlyOneDomain);
    const cdnDomain = uploadDomains[cdnIndex];

    const pathData = path.parse(resolveSrc(src));
    const mobilePathData = mobileSrc ? path.parse(mobileSrc) : null;
    const maxImageSize = Math.max(...imagesSizes);

    if (onlyMain) {
        formats = [formats[0]];
        const allowed: number[] = [];
        if (mobilePathData) {
            allowed.push(Math.max(...imagesSizes.filter((s) => s <= MOBILE_BREAKPOINT)));
        }
        allowed.push(maxImageSize);
        imagesSizes = allowed;
    }

    const primaryPath = mobilePathData ?? pathData;
    let startImageUrl = buildVariantUrl(
        primaryPath.dir,
        primaryPath.name,
        imagesSizes[0],
        1,
        formats[0],
        optimizationDirName
    ).replace('//', '/');
    startImageUrl = maybeUpload(startImageUrl, enableUpload, cdnDomain);
    if (useBlobPreview && useBlobPreview.length > 0) {
        startImageUrl = useBlobPreview;
    }

    const renderInnerSources = (format: ImageType, size: number): React.ReactNode => {
        if (size === maxImageSize && onlyMain) return null;
        let basePathData = pathData;
        let sourceWidth = width;
        let sourceHeight = height;
        if (mobilePathData && size <= MOBILE_BREAKPOINT) {
            basePathData = mobilePathData;
            if (mobileHeight) sourceHeight = mobileHeight;
            if (mobileWidth) sourceWidth = mobileWidth;
        }

        if (srcSetMode === 'ratio') {
            const srcSet = pixelRatio
                .map((ratio) => {
                    const url = maybeUpload(
                        buildVariantUrl(basePathData.dir, basePathData.name, size, ratio, format, optimizationDirName),
                        enableUpload,
                        cdnDomain
                    );
                    return `${url} ${ratio}x`;
                })
                .join(', ');
            return (
                <source
                    key={`${format}-${size}`}
                    media={`(max-width: ${size}px)`}
                    srcSet={srcSet}
                    type={`image/${format}`}
                    width={sourceWidth}
                    height={sourceHeight}
                />
            );
        }

        return pixelRatio.map((ratio) => {
            const url = maybeUpload(
                buildVariantUrl(basePathData.dir, basePathData.name, size, ratio, format, optimizationDirName),
                enableUpload,
                cdnDomain
            );
            return (
                <source
                    key={`${format}-${size}-${ratio}`}
                    media={`(max-width: ${size}px)`}
                    srcSet={`${url} ${size}w`}
                    type={`image/${format}`}
                    width={sourceWidth}
                    height={sourceHeight}
                />
            );
        });
    };

    const renderOuterSources = (format: ImageType): React.ReactNode => {
        const outerMedia = onlyMain
            ? `(min-width: ${imagesSizes[0] + 1}px)`
            : `(min-width: ${maxImageSize + 1}px)`;

        if (srcSetMode === 'ratio') {
            const srcSet = pixelRatio
                .map((ratio) => {
                    const url = maybeUpload(
                        buildVariantUrl(pathData.dir, pathData.name, maxImageSize, ratio, format, optimizationDirName),
                        enableUpload,
                        cdnDomain
                    );
                    return `${url} ${ratio}x`;
                })
                .join(', ');
            return (
                <source
                    key={`${format}-max`}
                    media={outerMedia}
                    srcSet={srcSet}
                    type={`image/${format}`}
                    width={width}
                    height={height}
                />
            );
        }

        return pixelRatio.map((ratio) => {
            const url = maybeUpload(
                buildVariantUrl(pathData.dir, pathData.name, maxImageSize, ratio, format, optimizationDirName),
                enableUpload,
                cdnDomain
            );
            return (
                <source
                    key={`${format}-max-${ratio}`}
                    media={outerMedia}
                    srcSet={url}
                    type={`image/${format}`}
                    width={width}
                    height={height}
                />
            );
        });
    };

    return (
        <picture>
            {formats.flatMap((format) =>
                imagesSizes.flatMap((size) => {
                    const rendered = renderInnerSources(format, size);
                    if (rendered === null) return [];
                    return Array.isArray(rendered) ? rendered : [rendered];
                })
            )}
            {formats.flatMap((format) => {
                const rendered = renderOuterSources(format);
                return Array.isArray(rendered) ? rendered : [rendered];
            })}
            <Image
                src={startImageUrl}
                alt={alt}
                width={width}
                height={height}
                priority={priority}
                className={className}
                loading={loading}
                unoptimized={unoptimized}
                style={style}
                sizes={sizes}
                {...rest}
            />
        </picture>
    );
};

VadImage.displayName = "VadImage";
export default VadImage;

export interface VadImagePreloadProps {
    src: string | StaticImageData;
    mobileSrc?: string;
    sizes?: string;
    useOnlyOneDomain?: boolean;
}

export function VadImagePreload({
                                    src,
                                    mobileSrc,
                                    sizes,
                                    useOnlyOneDomain
                                }: VadImagePreloadProps) {
    const cfg = readEnv();
    const pathData = path.parse(resolveSrc(src));
    const mobilePathData = mobileSrc ? path.parse(mobileSrc) : null;
    const cdnIndex = pickCdnIndex(cfg.uploadDomains, !!useOnlyOneDomain);
    const cdnDomain = cfg.uploadDomains[cdnIndex];
    const format = cfg.formats[0];

    const entries = cfg.imagesSizes.map((size) => {
        const base = mobilePathData && size <= MOBILE_BREAKPOINT ? mobilePathData : pathData;
        const url = maybeUpload(
            buildVariantUrl(base.dir, base.name, size, 1, format, cfg.optimizationDirName),
            cfg.enableUpload,
            cdnDomain
        );
        return `${url} ${size}w`;
    });

    const linkProps: Record<string, string | undefined> = {
        rel: 'preload',
        as: 'image',
        imageSrcSet: entries.join(', '),
        fetchpriority: 'high'
    };
    if (sizes) linkProps.imageSizes = sizes;
    return React.createElement('link', linkProps);
}

VadImagePreload.displayName = "VadImagePreload";
