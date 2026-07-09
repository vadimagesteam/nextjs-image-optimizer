#!/usr/bin/env node

import colors from 'colors';
import fs from 'fs';
import * as cliProgress from 'cli-progress';
import * as path from "node:path";
import sharp from "sharp";
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {PromisePool} from "@supercharge/promise-pool";

var mime = require('mime-types');
var md5 = require('md5');

const MAX_INPUT_PIXELS = 1_000_000_000;




colors.enable();


interface VadImageBlockConfig {
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
    concurrency: number;
}

enum ImageType {
    JPG = 'jpg',
    PNG = 'png',
    WEBP = 'webp',
    AVIF = 'avif'
}



const cachingData: {[key: string]:string[]} = {};
const cachingFilePath = process.cwd() + '/.vadimages-cache.json';

let config: VadImageBlockConfig;

const getFiles = async (dir: string, files: string[] = [], excludePath: string) => {
    const fileList = fs.readdirSync(dir);
    for (const file of fileList) {
        const name = `${dir}/${file}`
        const stat = fs.lstatSync(name);
        if (stat.isSymbolicLink()) {
            continue;
        }
        if (stat.isDirectory()) {
            getFiles(name, files, excludePath)
        } else if (stat.isFile()) {
            const fileType = mime.lookup(name);
            if (fileType && fileType?.includes('image') && !name.includes(excludePath)) {
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
    return process.cwd() + '/' + path;
}

const loadCachingFile = async (path: string = cachingFilePath) => {
    if(fs.existsSync(path)) {
        var obj = JSON.parse(fs.readFileSync(path, 'utf8'));
        for (const key in obj) {
            cachingData[key] = obj[key];
        }
    }
}

const storeCachingFile = async (path: string = cachingFilePath) => {
    const tmpPath = `${path}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(cachingData, null, 4));
    fs.renameSync(tmpPath, path);
}

const vadimagesNextImageOptimizer = async function () {
    config = await loadNextConfig();
    await loadCachingFile();
    const {uploadAccessKey, uploadSecretKey, ...safeConfig} = config;
    console.log({config: {...safeConfig, uploadAccessKey: uploadAccessKey ? '***' : undefined, uploadSecretKey: uploadSecretKey ? '***' : undefined}});

    const quality = config.quality;
    const imagesPath = prepareImagesPath(config.imagesPath);
    const imagesSizes = config.imagesSizes;
    const pixelRatio = config.pixelRatio;
    const optimizationDirName = config.optimizationDirName;
    const formats = config.formats;

    console.log('imagesPath: ', imagesPath);

    console.log('Start image optimization'.green);

    const files = await getFiles(imagesPath, [], optimizationDirName);
    console.log(`Total images found: ${files.length}`.blue);
    const filesCountToGenerate = files.length * imagesSizes.length * pixelRatio.length * formats.length;
    console.log(`Total images to generate: ${filesCountToGenerate}`.blue)

    const imagesProgress = new cliProgress.SingleBar({
        format: 'Generate images |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Files | ETA: {eta}s | Duration: {duration}s',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,

    });
    imagesProgress.start(filesCountToGenerate, 0, {
        speed: "N/A"
    });

    await PromisePool
        .for(files)
        .withConcurrency(config.concurrency)
        .process(async (file) => {
            await processFile(file, quality, imagesSizes, pixelRatio, optimizationDirName, formats, imagesProgress);
        });

    // for (const file of files) {
    //     await processFile(file, quality, imagesSizes, pixelRatio, optimizationDirName, formats, imagesProgress);
    // }
    imagesProgress.stop();
    await storeCachingFile();
    console.log('Finish image optimization'.green);
}

const processFile = async function (file: string, quality: number, sizes: number[], pixelRatio: number[], optimizationDir: string, formats: ImageType[] = [ImageType.WEBP], progress: cliProgress.SingleBar | null = null) {
    const fileData = fs.readFileSync(file);
    const fileHash = md5(fileData);
    const pathData = path.parse(file);
    const fullOptimizationDir = pathData.dir + optimizationDir;
    const fileName = pathData.name;
    const baseFilePath = file.replace(process.cwd(), '');

    const {width: metaWidth} = await sharp(fileData, {
        animated: true,
        limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();

    for (const size of sizes) {
        for (const ratio of pixelRatio) {
            for (const format of formats) {
                const optimizedHash = md5(`${fileHash}-${size}-${ratio}-${format}-${quality}`);
                if (cachingData[baseFilePath] && cachingData[baseFilePath].includes(optimizedHash)) {
                    if (progress) {
                        progress.increment();
                    }
                    continue;
                }
                try {
                    await optimizeImage(format, fileData, quality, size, ratio, fullOptimizationDir, fileName, metaWidth);
                }catch (e){
                    console.error('');
                    console.error(`Error while optimizing image: ${file}`.red);
                    console.error(e);
                }
                if(!cachingData[baseFilePath]){
                    cachingData[baseFilePath] = [];
                }
                cachingData[baseFilePath].push(optimizedHash);
                if (progress) {
                    progress.increment();
                }
            }
        }

    }
}

const optimizeImage = async function (format: ImageType, fileData: Buffer, quality: number, size: number, pixelRatio: number, path: string, baseName: string, metaWidth?: number) {
    const transformer = sharp(fileData, {
        animated: true,
        limitInputPixels: MAX_INPUT_PIXELS,
    });

    transformer.rotate();

    const finalWidth = size * pixelRatio;
    if(metaWidth && metaWidth > size) {
        transformer.resize(finalWidth);
    }

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
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    const optimizedFileNameAndPath = `${path}${baseName}-${size}w-${pixelRatio}x.${format}`;
    const info = await transformer.toFile(optimizedFileNameAndPath);
    if(config.enableUpload){
        await uploadFile(optimizedFileNameAndPath);
    }
}

/*
 * The object key must match the path that the CDN URL decodes to. VadImage
 * builds that URL by percent-encoding the leading slash (`/blogs/a.webp` ->
 * `%2Fblogs/a.webp`), so the key it resolves to keeps that leading slash.
 * Emit forward slashes so a Windows build uploads the same key as a POSIX one.
 */
const uploadKeyForFile = (basePath: string, file: string): string => {
    const relative = path.relative(basePath, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Upload refused: file ${file} is outside imagesPath ${basePath}`);
    }
    return '/' + relative.split(path.sep).join('/');
};

const uploadFile = async (file: string)=>{
    const S3 = new S3Client({
        region: "auto",
        endpoint: config.uploadEndpoint||'',
        credentials: {
            accessKeyId: config.uploadAccessKey||'',
            secretAccessKey: config.uploadSecretKey||'',
        },
    });

    const basePath = prepareImagesPath(config.imagesPath);

    const putObjectCommand = new PutObjectCommand({
        Bucket: config.uploadBucket,
        Key: uploadKeyForFile(basePath, file),
        Body: fs.readFileSync(file),
        ACL: 'public-read',
        ContentType: mime.lookup(file),
    });

    await S3.send(putObjectCommand);

    fs.unlinkSync(file);
}

const loadNextConfig = async function (): Promise<VadImageBlockConfig> {

    const nextConfigPathIndex = process.argv.indexOf("--nextConfigPath");
    const nextConfigPath =
        nextConfigPathIndex !== -1
            ? process.argv[nextConfigPathIndex + 1]
            : undefined;

    const nextConfigFolder = nextConfigPath
        ? path.dirname(path.isAbsolute(nextConfigPath) ? nextConfigPath : path.join(process.cwd(), nextConfigPath))
        : process.cwd();

    let loadConfig: typeof import("next/dist/server/config").default;
    try {
        loadConfig = (await import("next/dist/server/config")).default;
    } catch (e) {
        throw new Error(
            `Failed to load next/dist/server/config — this is an internal Next.js path and may have moved. ` +
            `vadimages-nextjs-image-optimizer is tested against Next.js 15 and 16; newer versions may require a package update. ` +
            `Original error: ${e instanceof Error ? e.message : String(e)}`
        );
    }

    const nextjsConfig = await loadConfig("phase-export", nextConfigFolder);

    if (typeof nextjsConfig !== "object" || nextjsConfig === null) {
        throw new Error("next.config is not an object");
    }
    // const legacyPath = nextjsConfig.images?.nextImageExportOptimizer;
    // const newPath = nextjsConfig.env;

    return {
        imagesSizes: nextjsConfig.env.vadImage_imagesSizes?.split(',').map((v) => Number(v)) ?? [320, 512, 480, 640, 787, 1024, 1280, 1440, 1920],
        pixelRatio: nextjsConfig.env.vadImage_pixelRatio?.split(',').map((v) => Number(v)) ?? [1, 2, 3],
        optimizationDirName: nextjsConfig.env.vadImage_optimizationDirName ?? '/opt/',
        formats: nextjsConfig.env.vadImage_formats?.split(',').map((v) => v as ImageType) ?? [ImageType.WEBP, ImageType.AVIF],
        quality: Number(nextjsConfig.env.vadImage_quality) || 75,
        imagesPath: nextjsConfig.env.vadImage_imagesPath ?? 'public/images',
        buildFolderPath: nextjsConfig.env.vadImage_buildFolderPath ?? 'build',
        enableUpload: nextjsConfig.env.vadImage_enableUpload === 'true',
        uploadBucket: nextjsConfig.env.vadImage_upload_bucket??'bucket',
        uploadAccessKey: nextjsConfig.env.vadImage_upload_accessKey,
        uploadSecretKey: nextjsConfig.env.vadImage_upload_secretKey,
        uploadDomain: nextjsConfig.env.vadImage_upload_domain,
        uploadEndpoint: nextjsConfig.env.vadImage_upload_endpoint,
        concurrency: Number(nextjsConfig.env.vadImage_concurrency) || 7,
    }
}

if (require.main === module) {
    vadimagesNextImageOptimizer();
}
module.exports = vadimagesNextImageOptimizer;
module.exports.uploadKeyForFile = uploadKeyForFile;
