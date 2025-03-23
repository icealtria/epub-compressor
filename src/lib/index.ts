import JSZip from "jszip";

/**
 * Converts an image (provided as an ArrayBuffer) to the specified format using a canvas.
 * @param imageArrayBuffer - The original image data.
 * @param quality - An integer between 0 and 100.
 * @param imgFormat - Either "image/webp" or "image/avif".
 * @returns A Promise that resolves to an ArrayBuffer of the converted image.
 */
async function convertImage(
    imageArrayBuffer: ArrayBuffer,
    quality: number,
    imgFormat: "image/webp" | "image/jpeg"
): Promise<ArrayBuffer> {
    // Keep track of the original file size
    const originalBlob = new Blob([imageArrayBuffer]);
    const originalSize = originalBlob.size;

    try {
        // Convert to WebP
        const imageBitmap = await createImageBitmap(originalBlob);
        const canvas = document.createElement("canvas");
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to get canvas 2D context.");
        }
        ctx.drawImage(imageBitmap, 0, 0);

        const convertedArrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            canvas.toBlob(
                async (convertedBlob) => {
                    if (convertedBlob) {
                        const buffer = await convertedBlob.arrayBuffer();
                        resolve(buffer);
                    } else {
                        reject(new Error("Image conversion failed."));
                    }
                },
                imgFormat,
                quality / 100
            );
        });

        // Compare the size of the converted image with the original
        const convertedBlob = new Blob([convertedArrayBuffer]);
        if (convertedBlob.size < originalSize) {
            // Return the smaller (converted) version
            return convertedArrayBuffer;
        } else {
            // Return the original data if that is smaller
            return imageArrayBuffer;
        }
    } catch (error) {
        console.error("Error converting image:", error);
        // Fallback: return original image data if conversion fails
        return imageArrayBuffer;
    }
}

/**
 * Utility to determine MIME type based on file extension.
 * @param filename - The file name.
 * @returns The MIME type string or null.
 */
function getMimeType(filename: string): string | null {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext) return null;
    const mimeTypes: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
    };
    return mimeTypes[ext] || null;
}

/**
 * Processes a single file from the EPUB ZIP.
 * If the file is an image (excluding filenames containing "cover"), it is converted.
 * @param filename - The file’s path within the ZIP.
 * @param fileData - The file data as an ArrayBuffer.
 * @param quality - Conversion quality (0-100).
 * @param imgFormat - The desired image format ("image/webp" or "image/avif").
 * @returns A Promise that resolves to the processed file data as an ArrayBuffer.
 */
async function processFile(
    filename: string,
    fileData: ArrayBuffer,
    quality: number,
    imgFormat: "image/webp" | "image/jpeg"
): Promise<ArrayBuffer> {
    const mimeType = getMimeType(filename);
    if (
        mimeType &&
        mimeType.startsWith("image") &&
        !filename.toLowerCase().includes("cover")
    ) {
        return await convertImage(fileData, quality, imgFormat);
    }
    return fileData;
}

/**
 * Compresses an EPUB file by processing its images.
 * @param epubBlob - The EPUB file as a Blob.
 * @param quality - The quality for image conversion (0-100).
 * @param imgFormat - The target image format ("image/webp" or "image/avif").
 * @returns A Promise that resolves to a new EPUB Blob.
 */
export async function compressEpub(
    epubBlob: Blob,
    quality: number,
    imgFormat: "image/webp" | "image/jpeg"
): Promise<Blob> {
    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(epubBlob);
    const newZip = new JSZip();

    const fileNames = Object.keys(loadedZip.files);
    const promises = fileNames.map(async (filename) => {
        const file = loadedZip.files[filename];
        if (file.dir) {
            newZip.folder(filename);
        } else {
            const fileData = await file.async("arraybuffer");
            const processedData = await processFile(filename, fileData, quality, imgFormat);
            newZip.file(filename, processedData, {
                compression: "DEFLATE",
                compressionOptions: {
                    level: 9
                }
            });
        }
    });

    await Promise.all(promises);
    return await newZip.generateAsync({ type: "blob" });
}
