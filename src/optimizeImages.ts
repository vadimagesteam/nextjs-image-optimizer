#!/usr/bin/env node

import colors from 'colors';
import fs from 'fs';
import mime from 'mime';
import * as cliProgress from 'cli-progress';
import * as path from "node:path";
import sharp from "sharp";

colors.enable();

enum ImageType {
    JPG = 'jpg',
    PNG = 'png',
    WEBP = 'webp',
    AVIF = 'avif'
}

function getFiles(dir: string, files: string[] = [], excludePath: string) {
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
            const fileType = mime.getType(name);
            if (fileType?.includes('image') && !name.includes(excludePath)){
                files.push(path.resolve(name));
            }
        }
    }
    return files
}

const vadimagesNextImageOptimizer = async function () {

    console.log('Start image optimization'.green);

    const quality = 75;
    const imagesPath = __dirname + '/../example/images';
    const imagesSizes = [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920];
    const pixelRatio = [1, 2, 3];
    const optimizationDirName = '/opt/';
    const formats = [ImageType.WEBP, ImageType.AVIF];

    const files = getFiles(imagesPath, [], optimizationDirName);
    console.log(`Total images found: ${files.length}`.blue);

    const imagesProgress = new cliProgress.SingleBar({
        format: 'CLI Progress |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Chunks || Speed: {speed}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,

    });
    imagesProgress.start(files.length, 0, {
        speed: "N/A"
    });
    for (const file of files) {
        await processFile(file, quality, imagesSizes, pixelRatio, optimizationDirName, formats);
        imagesProgress.increment();
    }
    imagesProgress.stop();

    console.log('Finish image optimization'.green);
}

const processFile = async function (file: string, quality: number, sizes: number[], pixelRatio: number[], optimizationDir: string, formats: ImageType[] = [ImageType.WEBP]){
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
            for(const format of formats) {
                await optimizeImage(format, fileData, quality, size, ratio, fullOptimizationDir, fileName);
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
    const optimizedFileNameAndPath = `${path}${baseName}-${size}w-${pixelRatio}x.${format}`;
    const info = await transformer.toFile(optimizedFileNameAndPath);
}


if (require.main === module) {
    vadimagesNextImageOptimizer();
}
module.exports = vadimagesNextImageOptimizer;
