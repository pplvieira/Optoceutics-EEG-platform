from pathlib import Path

import markdown

def md_to_html(source: str | Path, dest: str | Path):
    """Convert a markdown file to HTML

    Args:
        source (str | Path): Source file (*.md) path
        dest (str | Path): Destination for HTML output
    """
    if not isinstance(source, str):
        source = source.as_posix()

    with open(source, 'r') as f:
        text = f.read()
        html = markdown.markdown(text)

    if not isinstance(dest, str):
        dest = dest.as_posix()

    with open(dest, 'w') as f:
        f.write(html)

if __name__ == "__main__":
    md_to_html('README.md', Path(__file__).parent.parent / "info" / "README.html")
