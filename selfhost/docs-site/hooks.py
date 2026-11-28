"""MkDocs hook: links that leave docs/ (e.g. ../deploy/helm/ea-hub/values.yaml) point to GitHub."""
import posixpath
import re

REPO = "https://github.com/E20E-Tools/ea-hub-selfhost/blob/main/"
LINK = re.compile(r"\]\((?!https?:|#|mailto:)([^)\s]+)\)")


def on_page_markdown(markdown, page, config, files):
    base = posixpath.dirname("docs/" + page.file.src_uri)

    def fix(m):
        target = posixpath.normpath(posixpath.join(base, m.group(1)))
        if target.startswith("docs/"):
            return m.group(0)
        return "](" + REPO + target + ")"

    return LINK.sub(fix, markdown)
