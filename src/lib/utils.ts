/**
 * Utility functions for EPUB compression
 */

/**
 * Formats a file size in bytes to a human-readable string
 * @param bytes - The size in bytes
 * @param decimals - Number of decimal places to show
 */
export function formatFileSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Validates an EPUB file based on extension and MIME type
 * @param file - The file to validate
 * @returns An object containing validation result and any error message
 */
export function validateEpubFile(file: File): { isValid: boolean; error?: string } {
    // Check file extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (fileExtension !== 'epub') {
        return { isValid: false, error: 'Only EPUB files are supported.' };
    }

    // Check MIME type
    const validMimeTypes = ['application/epub+zip', 'application/octet-stream'];
    if (!validMimeTypes.includes(file.type) && file.type !== '') {
        return {
            isValid: false,
            error: `Invalid file type: ${file.type}. Only EPUB files are supported.`
        };
    }

    return { isValid: true };
}

/**
 * Checks if the browser supports WebP image format
 */
export function checkWebPSupport(): boolean {
    const canvas = document.createElement('canvas');
    if (canvas.getContext && canvas.getContext('2d')) {
        const data = canvas.toDataURL('image/webp');
        return data.indexOf('data:image/webp') === 0;
    }
    return false;
}

/**
 * Calculates compression ratio and returns formatted string
 * @param originalSize - Original file size in bytes
 * @param compressedSize - Compressed file size in bytes
 */
export function calculateCompressionStats(originalSize: number, compressedSize: number): {
    ratio: number;
    saved: number;
    savedFormatted: string;
} {
    const saved = originalSize - compressedSize;
    const ratio = Math.round((1 - compressedSize / originalSize) * 100);

    return {
        ratio,
        saved,
        savedFormatted: formatFileSize(saved)
    };
}

/**
 * Creates a download link for a blob with a specific filename
 * @param blob - The blob to download
 * @param filename - The name to save the file as
 */
export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}