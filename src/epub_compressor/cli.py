import argparse
from epub_compressor.compress import compress_epub


def main():
    parser = argparse.ArgumentParser(
        description="Compress EPUB by converting images to WebP or AVIF."
    )
    parser.add_argument("input_path", type=str, help="Path to the input EPUB file.")
    parser.add_argument(
        "-q",
        "--quality",
        type=int,
        default=75,
        help="Quality level for image compression (1-100).",
    )
    parser.add_argument(
        "-f",
        "--format",
        type=str,
        default="WEBP",
        choices=["WEBP", "AVIF"],
        help="Image format to convert.",
    )
    parser.add_argument(
        "-o", "--output_path", type=str, help="Path to save the compressed EPUB file."
    )
    args = parser.parse_args()

    out = compress_epub(args.input_path, args.quality, args.format)

    try:
        output_path = (
            args.output_path
            if args.output_path
            else f"{args.input_path}-compressed.epub"
        )
        with open(output_path, "wb") as f:
            f.write(out.getvalue())
    except:
        print("Error writing file.")


if __name__ == "__main__":
    main()
