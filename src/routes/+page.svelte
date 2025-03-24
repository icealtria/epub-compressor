<script lang="ts">
    import { compressEpub } from "$lib";
    import { onMount } from "svelte";
    import {
        formatFileSize,
        validateEpubFile,
        checkWebPSupport,
        downloadBlob,
    } from "$lib/utils";
    import "./styles.css";

    let epubFiles: File[] = [];
    let compressedBlobs: (Blob | null)[] = [];
    let originalSizes: number[] = [];
    let compressedSizes: number[] = [];
    let compressionRatios: number[] = [];
    let sizeDifferences: number[] = [];
    let processingStates: boolean[] = [];
    let errorMessages: string[] = [];
    let quality: number = 75;
    let imageFormat: "image/webp" | "image/jpeg" = "image/webp";
    let supportsWebP = false;

    let isProcessing = false;
    let isDragging = false;

    onMount(() => {
        supportsWebP = checkWebPSupport();
        if (!supportsWebP) {
            imageFormat = "image/jpeg";
        }

        // Add document-level drag and drop event listeners
        document.body.addEventListener("dragover", handleDocumentDragOver);
        document.body.addEventListener("dragleave", handleDocumentDragLeave);
        document.body.addEventListener("drop", handleDocumentDrop);

        return () => {
            // Clean up event listeners when component is destroyed
            document.body.removeEventListener(
                "dragover",
                handleDocumentDragOver,
            );
            document.body.removeEventListener(
                "dragleave",
                handleDocumentDragLeave,
            );
            document.body.removeEventListener("drop", handleDocumentDrop);
        };
    });

    function handleFileValidation(file: File): boolean {
        const validationResult = validateEpubFile(file);
        if (!validationResult.isValid && validationResult.error) {
            errorMessages.push(validationResult.error);
            return false;
        }
        return true;
    }

    function handleFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const files = Array.from(input.files);
            const validFiles = files.filter(handleFileValidation);
            addFiles(validFiles);
        }
    }

    function addFiles(files: File[]) {
        epubFiles = [...epubFiles, ...files];
        originalSizes = [...originalSizes, ...files.map((f) => f.size)];
        compressedBlobs = [...compressedBlobs, ...files.map(() => null)];
        compressedSizes = [...compressedSizes, ...files.map(() => 0)];
        compressionRatios = [...compressionRatios, ...files.map(() => 0)];
        sizeDifferences = [...sizeDifferences, ...files.map(() => 0)];
        processingStates = [...processingStates, ...files.map(() => false)];
        errorMessages = [...errorMessages, ...files.map(() => "")];
    }

    function handleDocumentDragOver(event: DragEvent) {
        event.preventDefault();
        isDragging = true;
    }

    function handleDocumentDragLeave(event: DragEvent) {
        // Only set isDragging to false if we're leaving the document
        // (not just moving between elements)
        if (
            !event.relatedTarget ||
            (event.relatedTarget as Node).nodeName === "HTML"
        ) {
            isDragging = false;
        }
    }

    function handleDocumentDrop(event: DragEvent) {
        event.preventDefault();
        isDragging = false;
        if (event.dataTransfer?.files?.length) {
            const files = Array.from(event.dataTransfer.files);
            const validFiles = files.filter(validateEpubFile);
            addFiles(validFiles);
        }
    }

    async function handleCompress() {
        if (epubFiles.length === 0) {
            errorMessages.push("No EPUB files selected.");
            return;
        }

        isProcessing = true;

        try {
            await Promise.all(
                epubFiles.map(async (file, index) => {
                    processingStates[index] = true;
                    try {
                        const compressed = await compressEpub(
                            file,
                            quality,
                            imageFormat,
                            (progress) => {
                                // Update progress
                                const progressElement = document.getElementById(
                                    `progress-${index}`,
                                );
                                if (progressElement) {
                                    progressElement.style.width = `${progress}%`;
                                }
                            },
                        );
                        compressedBlobs[index] = compressed;
                        compressedSizes[index] = compressed.size;
                        sizeDifferences[index] =
                            originalSizes[index] - compressed.size;
                        compressionRatios[index] = Math.round(
                            (1 -
                                sizeDifferences[index] / originalSizes[index]) *
                                100,
                        );
                        errorMessages[index] = "";
                    } catch (err) {
                        errorMessages[index] = "Compression failed";
                        console.error(`Error compressing ${file.name}:`, err);
                    } finally {
                        processingStates[index] = false;
                    }
                }),
            );
        } finally {
            isProcessing = false;
        }
    }

    function handleDownload() {
        epubFiles.forEach((file, index) => {
            const blob = compressedBlobs[index];
            if (!blob) return;
            const filename =
                file.name.replace(/\.epub$/i, "") + "-compressed.epub";
            downloadBlob(blob, filename);
        });
    }

    function removeFile(index: number, event: MouseEvent) {
        event.stopPropagation(); // 阻止事件冒泡
        epubFiles = epubFiles.filter((_, i) => i !== index);
        originalSizes = originalSizes.filter((_, i) => i !== index);
        compressedBlobs = compressedBlobs.filter((_, i) => i !== index);
        compressedSizes = compressedSizes.filter((_, i) => i !== index);
        compressionRatios = compressionRatios.filter((_, i) => i !== index);
        sizeDifferences = sizeDifferences.filter((_, i) => i !== index);
        processingStates = processingStates.filter((_, i) => i !== index);
        errorMessages = errorMessages.filter((_, i) => i !== index);
    }
</script>

<div class="container" class:dragging={isDragging}>
    <div class="content-wrapper">
        <h2 class="title">EPUB COMPRESSOR</h2>

        <label for="fileInput" class="drop-zone" on:dragover|preventDefault>
            {#if epubFiles.length === 0}
                <div class="drop-icon">📚</div>
                <p>DRAG & DROP EPUB FILES HERE<br />OR CLICK TO SELECT</p>
            {:else}
                <div class="file-list">
                    {#each epubFiles as file, i}
                        <div class="file-item">
                            <span>{file.name}</span>
                        </div>
                    {/each}
                </div>
            {/if}
            <input
                id="fileInput"
                type="file"
                accept=".epub"
                multiple
                on:change={handleFileSelected}
                class="hidden-input"
            />
        </label>

        <div class="controls">
            <label for="quality">QUALITY: {quality}%</label>
            <input
                id="quality"
                type="range"
                min="1"
                max="100"
                bind:value={quality}
            />
        </div>

        <div class="format-info">
            {#if supportsWebP}
                <p>
                    Your browser supports WebP encoding ✓<br />Using format: {imageFormat}
                </p>
            {:else}
                <p>
                    Your browser does not support WebP encoding ✗<br />Falling
                    back to JPEG.
                </p>
            {/if}
        </div>

        <div class="buttons">
            <button
                class="compress-btn"
                on:click={handleCompress}
                disabled={isProcessing || epubFiles.length === 0}
            >
                {isProcessing
                    ? "PROCESSING..."
                    : epubFiles.length > 1
                      ? "COMPRESS ALL"
                      : "COMPRESS"}
            </button>
            <button
                class="download-btn"
                on:click={handleDownload}
                disabled={compressedBlobs.every((blob) => !blob)}
            >
                {epubFiles.length > 1 ? "DOWNLOAD ALL" : "DOWNLOAD"}
            </button>
        </div>

        {#each epubFiles as file, i}
            <div class="file-compression-status">
                <h3>{file.name}</h3>
                {#if compressedBlobs[i]}
                    <div class="file-size-comparison">
                        <div class="size-details">
                            <div class="size-item">
                                <span class="size-label">ORIGINAL:</span>
                                <span class="size-value">
                                    {formatFileSize(originalSizes[i])}
                                </span>
                            </div>
                            <div class="size-item">
                                <span class="size-label">COMPRESSED:</span>
                                <span class="size-value">
                                    {formatFileSize(compressedSizes[i])}
                                </span>
                            </div>
                            <div class="size-item highlight">
                                <span class="size-label">SAVED:</span>
                                <span class="size-value">
                                    {formatFileSize(sizeDifferences[i])} ({compressionRatios[
                                        i
                                    ]}%)
                                </span>
                            </div>
                        </div>
                    </div>
                {/if}
                {#if processingStates[i]}
                    <div class="processing">Processing...</div>
                {/if}
                {#if errorMessages[i]}
                    <div class="error">{errorMessages[i]}</div>
                {/if}
            </div>
        {/each}
        <a href="https://epub-compress.streamlit.app/" style="font-size: small;"
            >Another EPUB Compressor</a
        >
    </div>
</div>
