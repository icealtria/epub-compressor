from typing import Literal
import streamlit as st
from PIL import Image
import io
import concurrent.futures
import pillow_avif
import zipfile
import magic


def convert_image(image, quality: int, format: Literal["WEBP", "AVIF"]) -> bytes:
    image = Image.open(io.BytesIO(image))
    output_io = io.BytesIO()
    image.save(output_io, format=format, quality=quality)
    return output_io.getvalue()


def process_file(item, book, quality, format):
    file_content = book.read(item.filename)
    if magic.from_buffer(file_content, mime=True).startswith("image/"):
        return item, convert_image(file_content, quality, format)
    else:
        return item, file_content


def compress_epub(epub, quality: int, format: str) -> io.BytesIO:
    book = zipfile.ZipFile(epub)
    file_list = book.infolist()
    file = io.BytesIO()

    with zipfile.ZipFile(file, "w") as epub_file:
        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [
                executor.submit(process_file, item, book, quality, format)
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
        format = st.radio("Select image format", ("WEBP", "AVIF"))
        if st.button("Compress"):
            compressed = compress_epub(epub_file, quality, format)
            st.download_button(
                label="Download",
                data=compressed.getvalue(),
                file_name=epub_file.name.replace(".epub", f"-{format}-{quality}.epub"),
                mime="application/epub+zip",
            )


if __name__ == "__main__":
    main()
