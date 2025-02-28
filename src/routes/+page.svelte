<script lang="ts">
    import { compressEpub } from "$lib";
    import { onMount } from "svelte";
  
    let epubFile: File | null = null;
    let quality: number = 75;
    // Use union type so we can fall back to JPEG if needed.
    let imageFormat: "image/webp" | "image/jpeg" = "image/webp";
    let supportsWebP = false;
  
    let isProcessing = false;
    let compressedBlob: Blob | null = null;
    let errorMessage = "";
  
    // Check if the browser supports WebP via canvas.toDataURL.
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
    });
  
    function handleFileSelected(event: Event) {
      const input = event.target as HTMLInputElement;
      if (input.files && input.files.length > 0) {
        epubFile = input.files[0];
        compressedBlob = null;
        errorMessage = "";
      }
    }
  
    function handleDrop(event: DragEvent) {
      event.preventDefault();
      if (event.dataTransfer?.files?.length) {
        epubFile = event.dataTransfer.files[0];
        compressedBlob = null;
        errorMessage = "";
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
      link.download = epubFile.name.replace(/\.epub$/i, "") + "-compressed.epub";
      link.click();
      URL.revokeObjectURL(url);
    }
  </script>
  
  <div class="container">
    <h2>EPUB Compressor</h2>
  
    <!-- Modern drag-and-drop area -->
    <div
      class="drop-zone"
      on:drop|preventDefault={handleDrop}
      on:dragover|preventDefault
    >
      {#if !epubFile}
        <p>Drag and drop an EPUB file here, or click to select</p>
      {:else}
        <p>{epubFile.name}</p>
      {/if}
    </div>
  
    <!-- File input -->
    <input type="file" accept=".epub" on:change={handleFileSelected} />
  
    <div class="controls">
      <label for="quality">Select quality: {quality}</label>
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
        <p>Your browser supports WebP. Using format: {imageFormat}</p>
      {:else}
        <p>Your browser does not support WebP. Falling back to JPEG.</p>
      {/if}
    </div>
  
    <div class="buttons">
      <button on:click={handleCompress} disabled={isProcessing}>
        {isProcessing ? "Processing..." : "Compress"}
      </button>
      <button on:click={handleDownload} disabled={!compressedBlob}>
        Download
      </button>
    </div>
  
    {#if errorMessage}
      <div class="error">{errorMessage}</div>
    {/if}
  </div>
  
  <style>
    .container {
      max-width: 600px;
      margin: 2rem auto;
      padding: 2rem;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
        Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    }
    h2 {
      text-align: center;
      margin-bottom: 1.5rem;
      color: #333;
    }
    .drop-zone {
      margin: 1rem 0;
      padding: 2rem;
      border: 2px dashed #00aaff;
      text-align: center;
      border-radius: 8px;
      background: #f5faff;
      cursor: pointer;
      transition: background 0.3s, border-color 0.3s;
    }
    .drop-zone:hover {
      background: #e0f7ff;
      border-color: #0088cc;
    }
    input[type="file"] {
      display: block;
      margin: 1rem auto;
      font-size: 1rem;
    }
    .controls {
      margin: 1rem 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .controls label {
      font-size: 0.9rem;
      color: #555;
    }
    .controls input[type="range"] {
      width: 100%;
      accent-color: #00aaff;
    }
    .format-info {
      text-align: center;
      margin-bottom: 1rem;
      font-size: 0.9rem;
      color: #666;
    }
    .buttons {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 1rem;
    }
    button {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      background: #00aaff;
      color: #fff;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.3s;
    }
    button:disabled {
      background: #cccccc;
      cursor: not-allowed;
    }
    button:hover:not(:disabled) {
      background: #0088cc;
    }
    .error {
      color: red;
      margin-top: 1rem;
      text-align: center;
    }
  </style>
  