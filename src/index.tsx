import Image, {ImageProps, StaticImageData} from "next/image";
import React from "react";
const path = require("path");
import {NextConfig} from "next";


export interface VadImageProps
    extends Omit<ImageProps, "src" | "quality"> {
    src: string | StaticImageData;
    basePath?: string;
    mobileSrc?: string | StaticImageData;
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

    return (
        <picture>
            {formats.map((format) => (
                imagesSizes.map((size) => (
                    pixelRatio.map((ratio) => {
                        let imageUrl = `${pathData.dir}${optimizationDirName}${pathData.name}-${size}w-${ratio}x.${format} ${size}w`;
                        if (mobilePathData && size <= 878) {
                            imageUrl = `${mobilePathData.dir}${optimizationDirName}${mobilePathData.name}-${size}w-${ratio}x.${format} ${size}w`
                        }

                        if(enableUpload){
                            imageUrl = uploadDomain + imageUrl.substring(imageUrl.indexOf('/',2)).replace('//','/').replace('/', '%2F');
                        }

                        return (<source media={`(max-width: ${size}px)`} srcSet={imageUrl} type={`image/${format}`}/>);
                    })
                ))
            ))}

            <Image
                src={src.toString().replace('//','/')}
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