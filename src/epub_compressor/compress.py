import logging
import mimetypes
from typing import Literal, Tuple
from PIL import Image
import io
import concurrent.futures
import pillow_avif
import zipfile


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
    mime_type, _ = mimetypes.guess_type(item.filename)

    if (
        mime_type
        and mime_type.startswith("image")
        and "cover" not in item.filename.lower()
    ):
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
