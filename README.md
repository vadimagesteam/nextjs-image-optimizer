# Vadimages Next.js image optimizer

This is a simple image optimizer for Next.js projects. It uses the sharp library to optimize images and the next/image
component to display them.

## Installation

```bash
npm install vadimages-nextjs-image-optimizer
```

## Requirements

- Node.js 16 or higher
- Next.js 12 or higher
- Set meta tag `    <meta name="viewport" content="width=device-width, initial-scale=1">` in your layout head

## Usage

### 1. Set environment variables

```js
// In your next.config.js file
module.exports = {
    env: {
        vadImage_imagesPath: "public/assets",
        vadImage_buildFolderPath: "build",
        vadImage_quality: "92",
        vadImage_formats: ['webp', 'avif'].join(','),
        vadImage_optimizationDirName: "/opt/",
        vadImage_imagesSizes: [320, 480, 512, 640, 787, 1024, 1280, 1440, 1920].join(','),
        vadImage_pixelRatio: [1, 2, 3].join(','),

        vadImage_enableUpload: "true",
        vadImage_upload_accessKey: "YOUR_CF_ACCESS_KEY",
        vadImage_upload_secretKey: "YOUR_CF_SECRET_KEY",
        vadImage_upload_endpoint: "https://YOUR_CF_ACCOUNT_ID.r2.cloudflarestorage.com",
        vadImage_upload_domain: "https://pub-YOUR_CF_ACCOUNNT_ID.r2.dev/",
        vadImage_upload_bucket: "R2_BUCKET_NAME",
    },
}
```

| Variable                       | Description                                                       |
|--------------------------------|-------------------------------------------------------------------|
| `vadImage_imagesPath`          | The path to the images folder in your project.                    |
| `vadImage_buildFolderPath`     | The path to the build folder in your project.                     |
| `vadImage_quality`             | The quality of the optimized images.                              |
| `vadImage_formats`             | The formats of the optimized images.                              |
| `vadImage_optimizationDirName` | The name of the folder where the optimized images will be stored. |
| `vadImage_imagesSizes`         | The sizes of the optimized images.                                |
| `vadImage_pixelRatio`          | The pixel ratios of the optimized images.                         |
| `vadImage_enableUpload`        | Enable or disable image upload to Cloudflare.                     |
| `vadImage_upload_accessKey`    | The access key for the Cloudflare account.                        |
| `vadImage_upload_secretKey`    | The secret key for the Cloudflare account.                        |
| `vadImage_upload_endpoint`     | The endpoint for the Cloudflare account.                          |
| `vadImage_upload_domain`       | The domain for the Cloudflare account.                            |
| `vadImage_upload_bucket`       | The bucket name for the Cloudflare account.                       |

### 2. Setup and run images build command

```json
// In your package.json file
{
  "scripts": {
    "build:images": "vadimages-nextjs-image-optimizer --nextConfigPath ./next.config.js"
  }
}
```

```bash
npm run build:images
```

### 3. Use the VadImage component

```js
import VadImage from 'vadimages-nextjs-image-optimizer';

export default function Home() {
    return (
        <VadImage
            src="/assets/image.jpg"
            alt="Image"
            width={1920}
            height={1080}
            mobileSrc="/assets/mobile-image.jpg"
            mobileWidth={640}
            mobileHeight={360}
        />
    );
}
```

The `VadImage` component has all the same props as the `next/image` component, plus the following additional props:

| Prop           | Description                     |
|----------------|---------------------------------|
| `mobileSrc`    | The path to the mobile image.   |
| `mobileWidth`  | The width of the mobile image.  |
| `mobileHeight` | The height of the mobile image. |

