/**
 * Custom error types for EPUB compression
 */

export class EpubCompressionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EpubCompressionError';
    }
}

export class ImageConversionError extends EpubCompressionError {
    constructor(message: string, public originalError?: Error) {
        super(message);
        this.name = 'ImageConversionError';
    }
}

export class FileValidationError extends EpubCompressionError {
    constructor(message: string) {
        super(message);
        this.name = 'FileValidationError';
    }
}

export class WorkerError extends EpubCompressionError {
    constructor(message: string, public workerIndex?: number) {
        super(message);
        this.name = 'WorkerError';
    }
}

export class CompressionAbortedError extends EpubCompressionError {
    constructor(message: string = 'Compression was aborted') {
        super(message);
        this.name = 'CompressionAbortedError';
    }
}

export function handleError(error: unknown): EpubCompressionError {
    if (error instanceof EpubCompressionError) {
        return error;
    }

    if (error instanceof Error) {
        return new EpubCompressionError(error.message);
    }

    return new EpubCompressionError('An unknown error occurred');
}