import Image, {ImageProps, StaticImageData} from "next/image";
import React from "react";

const path = require("path");
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

    const imagesSizes = process.env.vadImage_imagesSizes?.split(',').map((v) => Number(v)) ?? [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920];
    const pixelRatio = process.env.vadImage_pixelRatio?.split(',').map((v) => Number(v)) ?? [1, 2, 3];
    const optimizationDirName = process.env.vadImage_optimizationDirName ?? '/opt/';
    const formats = process.env.vadImage_formats?.split(',').map((v) => v as ImageType) ?? [ImageType.WEBP, ImageType.AVIF];

    const enableUpload = process.env.vadImage_enableUpload === 'true';
    const uploadDomain = process.env.vadImage_upload_domain;

    const pathData = path.parse(src as string);
    const mobilePathData = mobileSrc ? path.parse(mobileSrc as string) : null;

    const maxImageSize = Math.max(...imagesSizes);

    return (
        <picture>
            {formats.map((format) => (
                imagesSizes.map((size) => (
                    pixelRatio.map((ratio) => {
                        let imageUrl = `${pathData.dir}${optimizationDirName}${pathData.name}-${size}w-${ratio}x.${format} ${size}w`;
                        let sourceWidth = width;
                        let sourceHeight = height;
                        if (mobilePathData && size <= 878) {
                            imageUrl = `${mobilePathData.dir}${optimizationDirName}${mobilePathData.name}-${size}w-${ratio}x.${format} ${size}w`
                            if (mobileHeight){
                                sourceHeight = mobileHeight;
                            }
                            if (mobileWidth){
                                sourceWidth = mobileWidth;
                            }
                        }

                        if (enableUpload) {
                            imageUrl = uploadDomain + imageUrl.substring(imageUrl.indexOf('/', 2)).replace('//', '/').replace('/', '%2F');
                        }

                        return (
                            <source
                                media={`(max-width: ${size}px)`}
                                srcSet={imageUrl}
                                type={`image/${format}`}
                                width={sourceWidth}
                                height={sourceHeight}
                            />);
                    })
                ))
            ))}

            {formats.map((format) => (
                pixelRatio.map((ratio) => {
                    let imageUrl = `${pathData.dir}${optimizationDirName}${pathData.name}-${maxImageSize}w-${ratio}x.${format}`;
                    let sourceWidth = width;
                    let sourceHeight = height;
                    if (mobilePathData) {
                        imageUrl = `${mobilePathData.dir}${optimizationDirName}${mobilePathData.name}-${maxImageSize}w-${ratio}x.${format}`;
                        if (mobileHeight){
                            sourceHeight = mobileHeight;
                        }
                        if (mobileWidth){
                            sourceWidth = mobileWidth;
                        }
                    }

                    if (enableUpload) {
                        imageUrl = uploadDomain + imageUrl.substring(imageUrl.indexOf('/', 2)).replace('//', '/').replace('/', '%2F');
                    }

                    return (
                        <source
                            media={`(min-width: ${maxImageSize+1}px)`}
                            srcSet={imageUrl}
                            type={`image/${format}`}
                            width={sourceWidth}
                            height={sourceHeight}
                        />);
                })
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