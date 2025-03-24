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
        const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Failed to get canvas 2D context.");
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
                    reject(new Error("Image conversion failed."));
                }
            }).catch(reject);
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

    try {
        // Handle batch mode (for parallel processing)
        if (batchMode && batchData) {
            // Process each file in the batch and send back individually
            const filenames = Object.keys(batchData);
            const totalFiles = filenames.length;
            let processedFiles = 0;
            
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
                        progress: (processedFiles / totalFiles) * 100
                    });
                } catch (fileError) {
                    console.error(`Error processing file ${filename}:`, fileError);
                    // Continue with other files even if one fails
                }
            });
            
            await Promise.all(processingPromises);
            self.postMessage({ type: "batch_complete" });
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
