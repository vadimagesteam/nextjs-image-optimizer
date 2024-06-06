#!/usr/bin/env node

import colors from 'colors';
import fs from 'fs';
// import mime from 'mime';
import * as cliProgress from 'cli-progress';
import * as path from "node:path";
import sharp from "sharp";
import loadConfig from "next/dist/server/config";
var mime = require('mime-types')



colors.enable();


 interface VadImageBlockConfig {
    imagesSizes: number[];
    pixelRatio: number[];
    optimizationDirName: string;
    formats: ImageType[];
    quality: number;
    imagesPath: string;
    buildFolderPath: string;
}

enum ImageType {
    JPG = 'jpg',
    PNG = 'png',
    WEBP = 'webp',
    AVIF = 'avif'
}

const getFiles = async (dir: string, files: string[] = [], excludePath: string)=> {
     // const mime = await import('mime');
    // Get an array of all files and directories in the passed directory using fs.readdirSync
    const fileList = fs.readdirSync(dir);
    // Create the full path of the file/directory by concatenating the passed directory and file/directory name
    for (const file of fileList) {
        const name = `${dir}/${file}`
        // Check if the current file/directory is a directory using fs.statSync
        if (fs.statSync(name).isDirectory()) {
            // If it is a directory, recursively call the getFiles function with the directory path and the files array
            getFiles(name, files, excludePath)
        } else {
            // If it is a file, push the full path to the files array
            const fileType = mime.lookup(name);
            if (fileType?.includes('image') && !name.includes(excludePath)) {
                files.push(path.resolve(name));
            }
        }
    }
    return files
}

const prepareImagesPath = (path: string): string => {
    if (path.startsWith("/")) {
        path = path.slice(1);
    }
    return __dirname + '/../' + path;
}

const vadimagesNextImageOptimizer = async function () {
    const config = await loadNextConfig();

    console.log({config});

    const quality = config.quality;
    const imagesPath = prepareImagesPath(config.imagesPath);
    const imagesSizes = config.imagesSizes;
    const pixelRatio = config.pixelRatio;
    const optimizationDirName = config.optimizationDirName;
    const formats = config.formats;

    console.log('Start image optimization'.green);

    const files = await getFiles(imagesPath, [], optimizationDirName);
    console.log(`Total images found: ${files.length}`.blue);
    const filesCountToGenerate = files.length * imagesSizes.length * pixelRatio.length * formats.length;
    console.log(`Total images to generate: ${filesCountToGenerate}`.blue)

    const imagesProgress = new cliProgress.SingleBar({
        format: 'Generate images |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Files',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,

    });
    imagesProgress.start(filesCountToGenerate, 0, {
        speed: "N/A"
    });
    for (const file of files) {
        await processFile(file, quality, imagesSizes, pixelRatio, optimizationDirName, formats, imagesProgress);
    }
    imagesProgress.stop();

    console.log('Finish image optimization'.green);
}

const processFile = async function (file: string, quality: number, sizes: number[], pixelRatio: number[], optimizationDir: string, formats: ImageType[] = [ImageType.WEBP], progress: cliProgress.SingleBar | null = null ){
    // console.log(`Processing file: ${file}`.yellow);
    // console.log(`Quality: ${quality}`);
    // console.log(`Sizes: ${sizes}`);
    // console.log(`Pixel Ratio: ${pixelRatio}`);

    const fileData = fs.readFileSync(file);
    const pathData = path.parse(file);
    const fullOptimizationDir = pathData.dir + optimizationDir;
    const fileName = pathData.name;
    if (!fs.existsSync(optimizationDir)) {
        fs.mkdirSync(optimizationDir);
    }
    for (const size of sizes) {
        for (const ratio of pixelRatio) {
            for (const format of formats) {
                await optimizeImage(format, fileData, quality, size, ratio, fullOptimizationDir, fileName);
                if(progress){
                    progress.increment();
                }
            }
        }

    }
}

const optimizeImage = async function (format: ImageType, fileData: Buffer, quality: number, size: number, pixelRatio: number, path: string, baseName: string) {
    const transformer = sharp(fileData, {
        animated: true,
        limitInputPixels: false, // disable pixel limit
    });

    transformer.rotate();

    const {width: metaWidth} = await transformer.metadata();

    const finalWidth = size * pixelRatio;
    transformer.resize(finalWidth);

    switch (format) {
        case ImageType.AVIF:
            const avifQuality = quality - 15;
            transformer.avif({
                quality: Math.max(avifQuality, 0),
                chromaSubsampling: "4:2:0", // same as webp
            });
            break;
        case ImageType.WEBP:
        case ImageType.JPG:
        case ImageType.PNG:
            transformer.toFormat(format, {
                quality,
            });
            break;
    }
    if (!fs.existsSync(path)){
        fs.mkdirSync(path);
    }
    const optimizedFileNameAndPath = `${path}${baseName}-${size}w-${pixelRatio}x.${format}`;
    const info = await transformer.toFile(optimizedFileNameAndPath);
}

const loadNextConfig = async function (): Promise<VadImageBlockConfig> {

    const nextConfigPathIndex = process.argv.indexOf("--nextConfigPath");

    let nextConfigPath =
        nextConfigPathIndex !== -1
            ? process.argv[nextConfigPathIndex + 1]
            : undefined;

    if (nextConfigPath) {
        nextConfigPath = path.isAbsolute(nextConfigPath)
            ? nextConfigPath
            : path.join(process.cwd(), nextConfigPath);
    } else {
        nextConfigPath = path.join(process.cwd(), "next.config.js");
    }
    const nextConfigFolder = path.dirname(nextConfigPath);
    const nextjsConfig = await loadConfig("phase-export", nextConfigFolder);

// Check if nextjsConfig is an object or is undefined
    if (typeof nextjsConfig !== "object" || nextjsConfig === null) {
        throw new Error("next.config.js is not an object");
    }
    // const legacyPath = nextjsConfig.images?.nextImageExportOptimizer;
    // const newPath = nextjsConfig.env;

    return {
        imagesSizes: nextjsConfig.env.vadImage_imagesSizes?.split(',').map((v) => Number(v)) ?? [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920],
        pixelRatio: nextjsConfig.env.vadImage_pixelRatio?.split(',').map((v) => Number(v)) ?? [1, 2, 3],
        optimizationDirName: nextjsConfig.env.vadImage_optimizationDirName ?? '/opt/',
        formats: nextjsConfig.env.vadImage_formats?.split(',').map((v) => v as ImageType) ?? [ImageType.WEBP, ImageType.AVIF],
        quality: Number(nextjsConfig.env.vadImage_quality) ?? 75,
        imagesPath: nextjsConfig.env.vadImage_imagesPath ?? 'public/images',
        buildFolderPath: nextjsConfig.env.vadImage_buildFolderPath ?? 'build',
    }
}

if (require.main === module) {
    vadimagesNextImageOptimizer();
}
module.exports = vadimagesNextImageOptimizer;
