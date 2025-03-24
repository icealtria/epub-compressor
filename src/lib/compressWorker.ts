import JSZip from "jszip";
import { logger } from "./logger";
import { ImageConversionError, WorkerError, handleError } from "./errors";

/**
 * Converts an image (provided as an ArrayBuffer) to the specified format using a canvas.
 * @param imageArrayBuffer - The original image data.
 * @param quality - An integer between 0 and 100.
 * @param imgFormat - Either "image/webp" or "image/jpeg".
 * @returns A Promise that resolves to an ArrayBuffer of the converted image.
 */
async function convertImage(
    imageArrayBuffer: ArrayBuffer,
    quality: number,
    imgFormat: "image/webp" | "image/jpeg"
): Promise<ArrayBuffer> {
    logger.debug('Starting image conversion', { quality, format: imgFormat });
    const originalBlob = new Blob([imageArrayBuffer]);
    const originalSize = originalBlob.size;

    try {
        const imageBitmap = await createImageBitmap(originalBlob);
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
            throw new ImageConversionError("Failed to get canvas 2D context.");
        }

        ctx.drawImage(imageBitmap, 0, 0);

        const convertedArrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
            canvas.convertToBlob({
                type: imgFormat,
                quality: quality / 100
            }).then(async (convertedBlob) => {
                if (convertedBlob) {
                    const buffer = await convertedBlob.arrayBuffer();
                    resolve(buffer);
                } else {
                    reject(new ImageConversionError("Image conversion failed."));
                }
            }).catch(error => reject(new ImageConversionError("Image conversion failed.", error)));
        });

        const convertedBlob = new Blob([convertedArrayBuffer]);
        const compressionResult = convertedBlob.size < originalSize ? convertedArrayBuffer : imageArrayBuffer;

        logger.info('Image conversion completed', {
            originalSize,
            convertedSize: convertedBlob.size,
            usedConverted: convertedBlob.size < originalSize
        });

        return compressionResult;
    } catch (error) {
        const convertError = handleError(error);
        logger.error('Image conversion failed', { error: convertError });
        throw convertError;
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
 * @param filename - The file's path within the ZIP.
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

// Worker message handler
self.onmessage = async (e: MessageEvent) => {
    const { epubData, quality, imgFormat, batchMode, batchData } = e.data;
    logger.info('Worker received message', { batchMode, quality, imgFormat });

    try {
        // Handle batch mode (for parallel processing)
        if (batchMode && batchData) {
            const filenames = Object.keys(batchData);
            const totalFiles = filenames.length;
            let processedFiles = 0;
            let failedFiles = 0;

            logger.debug('Starting batch processing', { totalFiles });

            // Process files in parallel using Promise.all
            const processingPromises = filenames.map(async (filename) => {
                try {
                    const fileData = batchData[filename];
                    const processedData = await processFile(filename, fileData, quality, imgFormat);

                    // Send the processed file back to the main thread
                    self.postMessage({
                        type: "file_processed",
                        filename,
                        processedData
                    }, { transfer: [processedData] });

                    processedFiles++;
                    self.postMessage({
                        type: "progress",
                        progress: (processedFiles / totalFiles) * 100,
                        processedFiles,
                        totalFiles,
                        failedFiles
                    });
                } catch (error) {
                    failedFiles++;
                    const processError = handleError(error);
                    logger.error(`Error processing file ${filename}`, { error: processError });
                    self.postMessage({
                        type: "file_error",
                        filename,
                        error: processError.message
                    });
                }
            });

            await Promise.all(processingPromises);
            logger.info('Batch processing completed', { processedFiles, failedFiles, totalFiles });
            self.postMessage({
                type: "batch_complete",
                summary: {
                    totalFiles,
                    processedFiles,
                    failedFiles
                }
            });
        }
        // Handle original mode (single worker processing entire EPUB)
        else if (epubData) {
            const jszip = new JSZip();
            const loadedZip = await jszip.loadAsync(epubData);
            const newZip = new JSZip();

            const fileNames = Object.keys(loadedZip.files);
            const totalFiles = fileNames.length;
            let processedFiles = 0;

            // Process files in chunks to avoid memory issues
            const CHUNK_SIZE = 10; // Process 10 files at a time
            const chunks = [];

            for (let i = 0; i < fileNames.length; i += CHUNK_SIZE) {
                chunks.push(fileNames.slice(i, i + CHUNK_SIZE));
            }

            for (const chunk of chunks) {
                await Promise.all(chunk.map(async (filename) => {
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
                    processedFiles++;
                    self.postMessage({ type: "progress", progress: (processedFiles / totalFiles) * 100 });
                }));
            }

            const compressedBlob = await newZip.generateAsync({ type: "blob" });
            self.postMessage({ type: "complete", result: compressedBlob });
        } else {
            throw new Error("Invalid worker message: missing required data");
        }
    } catch (error) {
        if (error instanceof Error) {
            self.postMessage({ type: "error", error: error.message });
        } else {
            self.postMessage({ type: "error", error: "Unknown error occurred" });
        }
    }
};
