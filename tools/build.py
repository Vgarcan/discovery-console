#!/usr/bin/env python3
"""
Bundle the modular source into one self-contained HTML file.

index.html is the single source of truth for load order: this script reads the
<link> and <script src> tags between the build markers and inlines them in the
order they appear there. Add a module by adding its tag to index.html.

    python3 tools/build.py            -> dist/process-discovery-console.html
    python3 tools/build.py --check    -> verify dist matches the sources

The bundle is what gets published as a Claude Artifact, which must be a single
self-contained file. index.html is what you open while working on it.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
OUT = os.path.join(ROOT, "dist", "process-discovery-console.html")

CSS_BLOCK = re.compile(r"<!-- build:css -->.*?<!-- endbuild -->", re.S)
JS_BLOCK = re.compile(r"<!-- build:js -->.*?<!-- endbuild -->", re.S)


def read(rel):
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        sys.exit("missing source file: " + rel)
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def bundle():
    html = read("index.html")

    css_block = CSS_BLOCK.search(html)
    js_block = JS_BLOCK.search(html)
    if not css_block or not js_block:
        sys.exit("index.html is missing its build markers")

    css_files = re.findall(r'href="([^"]+\.css)"', css_block.group(0))
    js_files = re.findall(r'src="([^"]+\.js)"', js_block.group(0))
    if not css_files or not js_files:
        sys.exit("no source files listed between the build markers")

    css = "\n".join(read(f) for f in css_files)
    js = "\n".join(read(f) for f in js_files)

    html = CSS_BLOCK.sub(lambda _: "<style>\n" + css + "\n</style>", html, count=1)
    html = JS_BLOCK.sub(lambda _: "<script>\n" + js + "\n</script>", html, count=1)
    return html, css_files, js_files


def main():
    html, css_files, js_files = bundle()

    if "--check" in sys.argv:
        if not os.path.exists(OUT):
            sys.exit("dist bundle has not been built yet")
        with open(OUT, encoding="utf-8") as fh:
            current = fh.read()
        if current != html:
            sys.exit("dist is out of date, run: python3 tools/build.py")
        print("dist matches the sources")
        return

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(html)

    kb = len(html.encode("utf-8")) / 1024
    print("built %s" % os.path.relpath(OUT, ROOT))
    print("  %d css modules, %d js modules, %.0f KB single file" % (len(css_files), len(js_files), kb))


if __name__ == "__main__":
    main()
