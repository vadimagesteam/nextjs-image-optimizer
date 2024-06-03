import Image, {ImageProps, StaticImageData} from "next/image";
import React from "react";
import path from "node:path";


export interface VadImageProps
    extends Omit<ImageProps, "src" | "loader" | "quality"> {
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

    const imagesSizes = [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920];
    const pixelRatio = [1, 2, 3];
    const optimizationDirName = '/opt/';
    const formats = [ImageType.WEBP, ImageType.AVIF];

    const pathData = path.parse(src as string);

    return (
        <picture>
            {formats.map((format) => (
                <source
                    key={format}
                    srcSet={imagesSizes.map((size) => {
                        return pixelRatio.map((ratio) => {
                            return `${pathData.dir}${optimizationDirName}${pathData.name}-${size}x${ratio}.${format} ${size}w`
                        }).join(", ");
                    }).join(", ")}
                    type={`image/${format}`}
                />
            ))}
            <source
                srcSet={imagesSizes.map((size) => {
                    return `${pathData.dir}${optimizationDirName}${pathData.name}-${size}x1.${pathData.ext} ${size}w`
                }).join(", ")}
                type={`image/${pathData.ext}`}
            />
            <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                priority={priority}
            />
        </picture>
    );
};

VadImage.displayName = "VadImage";
export default VadImage;