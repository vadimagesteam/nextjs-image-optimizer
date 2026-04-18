import Image, {ImageProps, StaticImageData} from "next/image";
import React from "react";
import path from "node:path";
import {NextConfig} from "next";


export interface VadImageProps
    extends Omit<ImageProps, "src" | "quality"> {
    src: string | StaticImageData;
    basePath?: string;
    mobileSrc?: string;
    mobileWidth?: number;
    mobileHeight?: number;
}

export enum ImageType {
    JPG = 'jpg',
    PNG = 'png',
    WEBP = 'webp',
    AVIF = 'avif'
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
    VadImage: VadImageBlockConfig
}

const imagesSizes = process.env.vadImage_imagesSizes?.split(',').map((v) => Number(v)) ?? [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920];
const pixelRatio = process.env.vadImage_pixelRatio?.split(',').map((v) => Number(v)) ?? [1, 2, 3];
const optimizationDirName = process.env.vadImage_optimizationDirName ?? '/opt/';
const formats = process.env.vadImage_formats?.split(',').map((v) => v as ImageType) ?? [ImageType.WEBP, ImageType.AVIF];
const enableUpload = process.env.vadImage_enableUpload === 'true';
const uploadDomain = process.env.vadImage_upload_domain;
const maxImageSize = Math.max(...imagesSizes);

const resolveSrc = (src: string | StaticImageData): string =>
    typeof src === 'string' ? src : src.src;

const rewriteForUpload = (imageUrl: string): string =>
    uploadDomain + imageUrl.substring(imageUrl.indexOf('/', 2)).replace('//', '/').replace('/', '%2F');

const buildSrcSet = (dir: string, name: string, size: number, format: ImageType): string =>
    pixelRatio.map((ratio) => {
        let imageUrl = `${dir}${optimizationDirName}${name}-${size}w-${ratio}x.${format}`;
        if (enableUpload) {
            imageUrl = rewriteForUpload(imageUrl);
        }
        return `${imageUrl} ${ratio}x`;
    }).join(', ');

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
                      ...rest
                  }: VadImageProps
) => {
    const pathData = path.parse(resolveSrc(src));
    const mobilePathData = mobileSrc ? path.parse(mobileSrc) : null;

    return (
        <picture>
            {formats.map((format) => (
                imagesSizes.map((size) => {
                    let basePathData = pathData;
                    let sourceWidth = width;
                    let sourceHeight = height;
                    if (mobilePathData && size <= 878) {
                        basePathData = mobilePathData;
                        if (mobileHeight) sourceHeight = mobileHeight;
                        if (mobileWidth) sourceWidth = mobileWidth;
                    }
                    return (
                        <source
                            key={`${format}-${size}`}
                            media={`(max-width: ${size}px)`}
                            srcSet={buildSrcSet(basePathData.dir, basePathData.name, size, format)}
                            type={`image/${format}`}
                            width={sourceWidth}
                            height={sourceHeight}
                        />
                    );
                })
            ))}

            {formats.map((format) => (
                <source
                    key={`${format}-max`}
                    media={`(min-width: ${maxImageSize + 1}px)`}
                    srcSet={buildSrcSet(pathData.dir, pathData.name, maxImageSize, format)}
                    type={`image/${format}`}
                    width={width}
                    height={height}
                />
            ))}

            <Image
                src={`${pathData.dir}${optimizationDirName}${pathData.name}-${imagesSizes[0]}w-1x.${formats[0]}`.replace('//', '/')}
                alt={alt}
                width={width}
                height={height}
                priority={priority}
                className={className}
                loading={loading}
                unoptimized={unoptimized}
                style={style}
                {...rest}
            />
        </picture>
    );
};

VadImage.displayName = "VadImage";
export default VadImage;
