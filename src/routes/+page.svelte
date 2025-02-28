<script lang="ts">
    import { compressEpub } from "$lib";
    import { onMount } from "svelte";
    import './styles.css';

    let epubFile: File | null = null;
    let quality: number = 75;
    let imageFormat: "image/webp" | "image/jpeg" = "image/webp";
    let supportsWebP = false;

    let isProcessing = false;
    let compressedBlob: Blob | null = null;
    let errorMessage = "";
    let isDragging = false;

    // File size tracking
    let originalSize: number = 0;
    let compressedSize: number = 0;
    let compressionRatio: number = 0;
    let sizeDifference: number = 0;

    function checkWebPSupport(): boolean {
        const canvas = document.createElement("canvas");
        if (canvas.getContext && canvas.getContext("2d")) {
            const data = canvas.toDataURL("image/webp");
            return data.indexOf("data:image/webp") === 0;
        }
        return false;
    }

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

    function validateEpubFile(file: File): boolean {
        // Check file extension
        const fileExtension = file.name.split(".").pop()?.toLowerCase();
        if (fileExtension !== "epub") {
            errorMessage = "Only EPUB files are supported.";
            return false;
        }

        // Check MIME type
        const validMimeTypes = [
            "application/epub+zip",
            "application/octet-stream",
        ];
        if (!validMimeTypes.includes(file.type) && file.type !== "") {
            errorMessage = `Invalid file type: ${file.type}. Only EPUB files are supported.`;
            return false;
        }

        return true;
    }

    function handleFileSelected(event: Event) {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];
            if (validateEpubFile(file)) {
                epubFile = file;
                originalSize = file.size;
                compressedBlob = null;
                compressedSize = 0;
                compressionRatio = 0;
                sizeDifference = 0;
                errorMessage = "";
            }
        }
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
            const file = event.dataTransfer.files[0];
            if (validateEpubFile(file)) {
                epubFile = file;
                originalSize = file.size;
                compressedBlob = null;
                compressedSize = 0;
                compressionRatio = 0;
                sizeDifference = 0;
                errorMessage = "";
            }
        }
    }

    function handleDrop(event: DragEvent) {
        event.preventDefault();
        if (event.dataTransfer?.files?.length) {
            const file = event.dataTransfer.files[0];
            if (validateEpubFile(file)) {
                epubFile = file;
                originalSize = file.size;
                compressedBlob = null;
                compressedSize = 0;
                compressionRatio = 0;
                sizeDifference = 0;
                errorMessage = "";
            }
        }
    }

    async function handleCompress() {
        if (!epubFile) {
            errorMessage = "No EPUB file selected.";
            return;
        }

        isProcessing = true;
        errorMessage = "";
        try {
            // Pass imageFormat along with quality if your compressEpub supports it.
            compressedBlob = await compressEpub(epubFile, quality, imageFormat);

            // Calculate compression statistics
            if (compressedBlob) {
                compressedSize = compressedBlob.size;
                sizeDifference = originalSize - compressedSize;
                compressionRatio = Math.round(
                    (1 - sizeDifference / originalSize) * 100,
                );
            }
        } catch (err) {
            errorMessage = "Compression failed. Check console for details.";
            console.error(err);
            compressedBlob = null;
        } finally {
            isProcessing = false;
        }
    }

    function handleDownload() {
        if (!compressedBlob || !epubFile) return;
        const url = URL.createObjectURL(compressedBlob);
        const link = document.createElement("a");
        link.href = url;
        link.download =
            epubFile.name.replace(/\.epub$/i, "") + "-compressed.epub";
        link.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="container" class:dragging={isDragging}>
    <div class="content-wrapper">
        <h2 class="title">EPUB COMPRESSOR</h2>

        <label
            for="fileInput"
            class="drop-zone"
            on:drop|preventDefault={handleDrop}
            on:dragover|preventDefault
        >
            {#if !epubFile}
                <div class="drop-icon">📚</div>
                <p>DRAG & DROP EPUB FILE HERE<br />OR CLICK TO SELECT</p>
            {:else}
                <p class="filename">{epubFile.name}</p>
            {/if}
            <input
                id="fileInput"
                type="file"
                accept=".epub"
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
                    Your browser does not support WebP encoding ✗<br />Falling back to
                    JPEG.
                </p>
            {/if}
        </div>

        <div class="buttons">
            <button
                class="compress-btn"
                on:click={handleCompress}
                disabled={isProcessing}
            >
                {isProcessing ? "PROCESSING..." : "COMPRESS"}
            </button>
            <button
                class="download-btn"
                on:click={handleDownload}
                disabled={!compressedBlob}
            >
                DOWNLOAD
            </button>
        </div>

        {#if compressedBlob}
            <div class="file-size-comparison">
                <h3 class="comparison-title">FILE SIZE COMPARISON</h3>
                <div class="size-details">
                    <div class="size-item">
                        <span class="size-label">ORIGINAL:</span>
                        <span class="size-value"
                            >{(originalSize / 1024 / 1024).toFixed(2)} MB</span
                        >
                    </div>
                    <div class="size-item">
                        <span class="size-label">COMPRESSED:</span>
                        <span class="size-value"
                            >{(compressedSize / 1024 / 1024).toFixed(2)} MB</span
                        >
                    </div>
                    <div class="size-item highlight">
                        <span class="size-label">SAVED:</span>
                        <span class="size-value"
                            >{(sizeDifference / 1024 / 1024).toFixed(2)} MB ({compressionRatio}%)</span
                        >
                    </div>
                </div>
                <div class="progress-container">
                    <div class="progress-bar">
                        <div
                            class="progress"
                            style="width: {compressionRatio}%"
                        ></div>
                    </div>
                    <div class="progress-labels">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                    </div>
                </div>
            </div>
        {/if}

        {#if errorMessage}
            <div class="error">{errorMessage}</div>
        {/if}
    </div>
</div>
