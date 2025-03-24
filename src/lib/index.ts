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

import { logger } from "./logger";
import { WorkerError, handleError } from "./errors";

/**
 * Compresses an EPUB file by processing its images using multiple workers for parallel processing.
 * @param epubBlob - The EPUB file as a Blob.
 * @param quality - The quality for image conversion (0-100).
 * @param imgFormat - The target image format ("image/webp" or "image/jpeg").
 * @returns A Promise that resolves to a new EPUB Blob.
 */
export async function compressEpub(
    epubBlob: Blob,
    quality: number,
    imgFormat: "image/webp" | "image/jpeg",
    onProgress?: (progress: number) => void
): Promise<Blob> {
    logger.info('Starting EPUB compression', { quality, imgFormat });

    return new Promise(async (resolve, reject) => {
        const workers: Worker[] = [];

        try {
            // Determine optimal number of workers
            const numWorkers = Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8));
            logger.debug('Initializing workers', { numWorkers });

            // Extract EPUB data
            const arrayBuffer = await epubBlob.arrayBuffer();
            const jszip = new JSZip();
            const loadedZip = await jszip.loadAsync(arrayBuffer.slice(0));

            const fileNames = Object.keys(loadedZip.files);
            const totalFiles = fileNames.length;
            logger.info('EPUB file loaded', { totalFiles });

            // Prepare worker batches
            const batchSize = Math.ceil(fileNames.length / numWorkers);
            const batches: string[][] = [];
            for (let i = 0; i < fileNames.length; i += batchSize) {
                batches.push(fileNames.slice(i, i + batchSize));
            }

            const newZip = new JSZip();
            let totalProcessed = 0;
            let totalFailed = 0;

            const updateProgress = () => {
                totalProcessed++;
                const progress = (totalProcessed / totalFiles) * 100;
                onProgress?.(progress);
                logger.debug('Processing progress', { totalProcessed, totalFiles, progress });
            };

            // Process batches with workers
            const workerPromises = batches.map(async (batch, workerIndex) => {
                return new Promise(async (resolveWorker, rejectWorker) => {
                    try {
                        const worker = new Worker(new URL('./compressWorker.ts', import.meta.url), {
                            type: 'module'
                        });
                        workers.push(worker);

                        // Prepare batch data
                        const batchData: Record<string, ArrayBuffer> = {};
                        for (const filename of batch) {
                            const file = loadedZip.files[filename];
                            if (!file.dir) {
                                batchData[filename] = await file.async("arraybuffer");
                            }
                        }

                        worker.onmessage = (e) => {
                            const { type, filename, processedData, error, summary } = e.data;

                            switch (type) {
                                case 'file_processed':
                                    newZip.file(filename, processedData, {
                                        compression: "DEFLATE",
                                        compressionOptions: { level: 9 }
                                    });
                                    updateProgress();
                                    break;

                                case 'file_error':
                                    totalFailed++;
                                    logger.error(`Worker ${workerIndex} failed to process file`, {
                                        filename,
                                        error
                                    });
                                    updateProgress(); // Still update progress even for failed files
                                    break;

                                case 'batch_complete':
                                    logger.info(`Worker ${workerIndex} completed batch`, summary);
                                    worker.terminate();
                                    resolveWorker(null);
                                    break;

                                case 'error':
                                    throw new WorkerError(error, workerIndex);
                            }
                        };

                        worker.onerror = (error) => {
                            const workerError = new WorkerError(
                                `Worker ${workerIndex} encountered an error: ${error.message}`,
                                workerIndex
                            );
                            logger.error('Worker error', { error: workerError, workerIndex });
                            worker.terminate();
                            rejectWorker(workerError);
                        };

                        // Start processing
                        worker.postMessage({
                            batchMode: true,
                            batchData,
                            quality,
                            imgFormat
                        }, Object.values(batchData).map(buffer => buffer.slice(0)));

                    } catch (error) {
                        const workerError = handleError(error);
                        logger.error(`Error in worker ${workerIndex}`, { error: workerError });
                        rejectWorker(workerError);
                    }
                });
            });

            // Wait for all workers
            await Promise.all(workerPromises);

            logger.info('All workers completed', {
                totalProcessed,
                totalFailed,
                totalFiles
            });

            // Generate final EPUB
            const compressedBlob = await newZip.generateAsync({ type: "blob" });
            logger.info('EPUB compression completed', {
                originalSize: epubBlob.size,
                compressedSize: compressedBlob.size
            });

            resolve(compressedBlob);

        } catch (error) {
            const compressionError = handleError(error);
            logger.error('EPUB compression failed', { error: compressionError });

            // Clean up workers
            workers.forEach(worker => worker.terminate());

            reject(compressionError);
        }
    });
}
