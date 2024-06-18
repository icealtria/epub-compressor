import logging
from typing import Literal, Tuple
import streamlit as st
from PIL import Image
import io
import concurrent.futures
import pillow_avif
import zipfile
import magic


def convert_image(
    image: bytes, quality: int, img_format: Literal["WEBP", "AVIF"]
) -> bytes:
    try:
        img = Image.open(io.BytesIO(image))
        output_io = io.BytesIO()
        img.save(output_io, format=img_format, quality=quality)
        return output_io.getvalue()
    except Exception as e:
        logging.error(f"Error converting image: {e}")
        return image


def process_file(
    item: zipfile.ZipInfo,
    book: zipfile.ZipFile,
    quality: int,
    img_format: Literal["WEBP", "AVIF"],
) -> Tuple[zipfile.ZipInfo, bytes]:
    file_content = book.read(item.filename)
    mime_type = magic.from_buffer(file_content, mime=True)
    if mime_type.startswith("image") and "cover" not in item.filename.lower():
        return item, convert_image(file_content, quality, img_format)
    else:
        return item, file_content


def compress_epub(
    epub, quality: int, img_format: Literal["WEBP", "AVIF"]
) -> io.BytesIO:
    book = zipfile.ZipFile(epub)
    file_list = book.infolist()
    file = io.BytesIO()

    with zipfile.ZipFile(file, "w") as epub_file:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [
                executor.submit(process_file, item, book, quality, img_format)
                for item in file_list
            ]

            for future in concurrent.futures.as_completed(futures):
                item, content = future.result()
                epub_file.writestr(item, content)

    return file


def main():
    st.title("EPUB Compressor")

    st.caption("Compress EPUB by converting images to WebP or AVIF.")

    epub_file = st.file_uploader("Upload your EPUB file", type="epub")

    if epub_file is not None:
        st.success("EPUB file uploaded and saved as temporary file.")

        quality = st.slider("Select quality (1-100)", 1, 100, 75)
        img_format = st.radio("Select image format", ("WEBP", "AVIF"))

        if st.button("Compress"):
            with st.spinner("Compressing..."):
                compressed = compress_epub(epub_file, quality, img_format)
                if compressed:
                    st.download_button(
                        label="Download",
                        data=compressed.getvalue(),
                        file_name=epub_file.name.replace(
                            ".epub", f"-{img_format}-{quality}.epub"
                        ),
                        mime="application/epub+zip",
                    )
                else:
                    st.error("Compression failed.")


if __name__ == "__main__":
    main()
