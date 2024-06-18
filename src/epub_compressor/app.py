import streamlit as st

from epub_compressor.compress import compress_epub


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
