"""
Scrape official documentation pages into plain text files.

Targets:
- Flutter
- TypeScript
- Python
- React
- TailwindCSS

High-level flow:
1) `main()` reads CLI args.
2) For each target in `DOC_TARGETS`, `crawl_docs()` collects page text.
3) `write_output()` saves one text file per technology.
"""

from __future__ import annotations

import argparse
import re
import time
from collections import deque
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple
from urllib.parse import urldefrag, urljoin

import requests
from bs4 import BeautifulSoup


DOC_TARGETS: Dict[str, Dict[str, str]] = {
    # Keep crawl targets declarative so adding/removing a doc source is config-only.
    "flutter": {
        "start_url": "https://docs.flutter.dev/",
        "allowed_prefix": "https://docs.flutter.dev/",
    },
    "typescript": {
        "start_url": "https://www.typescriptlang.org/docs/",
        "allowed_prefix": "https://www.typescriptlang.org/docs/",
    },
    "python": {
        "start_url": "https://docs.python.org/3/",
        "allowed_prefix": "https://docs.python.org/3/",
    },
    "react": {
        "start_url": "https://react.dev/learn",
        "allowed_prefix": "https://react.dev/",
    },
    "tailwindcss": {
        "start_url": "https://tailwindcss.com/docs/installation",
        "allowed_prefix": "https://tailwindcss.com/docs/",
    },
}

DEFAULT_HEADERS = {
    "User-Agent": "DocScraperBot/1.0 (+https://example.com/docs-scraper)"
}


def clean_text(text: str) -> str:
    """
    Normalize extracted page text.

    Why:
    HTML-to-text extraction often produces too many blank lines.

    Args:
        text: Raw text extracted from HTML.

    Returns:
        A cleaned string with compact newlines and trimmed outer spaces.
    """
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def normalize_url(url: str) -> str:
    """
    Canonicalize URLs for deduplication.

    Why:
    The same page can appear as `.../page`, `.../page/`, or `.../page#section`.
    Normalizing avoids crawling the same content multiple times.

    Args:
        url: Input URL.

    Returns:
        URL without fragment and trailing slash.
    """
    # Remove page fragments and trailing slashes to reduce duplicate URLs.
    no_fragment, _ = urldefrag(url)
    return no_fragment.rstrip("/")


def is_allowed(url: str, allowed_prefix: str) -> bool:
    """
    Check whether a URL belongs to the allowed docs area.

    Args:
        url: Candidate URL to validate.
        allowed_prefix: URL prefix that defines the crawl boundary.

    Returns:
        True if URL starts with the allowed docs prefix, else False.
    """
    # Strict prefix check keeps crawling scoped to the intended docs section.
    return normalize_url(url).startswith(normalize_url(allowed_prefix))


def extract_links(soup: BeautifulSoup, base_url: str, allowed_prefix: str) -> Iterable[str]:
    """
    Extract crawlable links from one HTML page.

    Why:
    We only want links that are:
    - valid web URLs (not mailto/javascript/tel)
    - inside the docs section we are scraping

    Args:
        soup: Parsed HTML document.
        base_url: Page URL used to resolve relative links.
        allowed_prefix: URL prefix used to keep crawl in scope.

    Yields:
        Normalized absolute URLs that are safe to crawl next.
    """
    for anchor in soup.find_all("a", href=True):
        href = anchor["href"].strip()
        if not href or href.startswith(("mailto:", "javascript:", "tel:")):
            continue
        absolute = normalize_url(urljoin(base_url, href))
        if is_allowed(absolute, allowed_prefix):
            yield absolute


def extract_page_text(soup: BeautifulSoup) -> str:
    """
    Convert a docs HTML page into readable plain text.

    Why:
    Documentation pages include scripts/styles/navigation noise.
    This function removes obvious non-content tags and prefers semantic
    content containers (`main` or `article`) when present.

    Args:
        soup: Parsed HTML document.

    Returns:
        Cleaned plain text content for storage.
    """
    for tag in soup(["script", "style", "noscript", "svg"]):
        tag.decompose()

    # Prefer semantic content containers to avoid headers/sidebars when possible.
    main = soup.find("main")
    article = soup.find("article")
    content_root = main or article or soup.body or soup
    text = content_root.get_text(separator="\n", strip=True)
    return clean_text(text)


def fetch_page(session: requests.Session, url: str, timeout: int = 20) -> str:
    """
    Download one URL using the shared HTTP session.

    Args:
        session: Reused requests session (faster than new connections each time).
        url: Page URL to fetch.
        timeout: Request timeout in seconds.

    Returns:
        Raw HTML text.

    Raises:
        requests.RequestException: For network errors, timeouts, or bad status.
    """
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    return response.text


def crawl_docs(
    start_url: str,
    allowed_prefix: str,
    max_pages: int,
    delay_seconds: float,
) -> List[Tuple[str, str]]:
    """
    Breadth-first crawl of docs pages.
    BFS gives broad coverage early, which is useful when max_pages is capped.

    Args:
        start_url: First page to crawl.
        allowed_prefix: Crawl boundary; links outside this prefix are skipped.
        max_pages: Hard limit for number of stored pages.
        delay_seconds: Pause between requests to reduce server load.

    Returns:
        List of tuples `(url, extracted_text)` for successfully scraped pages.
    """
    visited: Set[str] = set()
    queue = deque([normalize_url(start_url)])
    pages: List[Tuple[str, str]] = []

    with requests.Session() as session:
        session.headers.update(DEFAULT_HEADERS)

        while queue and len(pages) < max_pages:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)

            try:
                html = fetch_page(session, current)
            except requests.RequestException as exc:
                print(f"[WARN] Failed to fetch {current}: {exc}")
                continue

            soup = BeautifulSoup(html, "html.parser")
            text = extract_page_text(soup)

            if text:
                pages.append((current, text))
                print(f"[OK] {len(pages):03d}/{max_pages} - {current}")

            # Continue exploring linked docs pages within allowed prefix.
            for link in extract_links(soup, current, allowed_prefix):
                if link not in visited:
                    queue.append(link)

            # Small delay is polite to doc servers and reduces rate-limit risk.
            if delay_seconds > 0:
                time.sleep(delay_seconds)

    return pages


def write_output(output_dir: Path, name: str, pages: List[Tuple[str, str]]) -> Path:
    """
    Persist scraped pages to one text file per technology.

    Format:
    - Page marker
    - Source URL
    - Extracted content
    - Separator line

    Args:
        output_dir: Destination folder.
        name: Technology name used as the file name stem.
        pages: Scraped `(url, text)` entries.

    Returns:
        Path to the written `.txt` file.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{name}.txt"
    with output_path.open("w", encoding="utf-8") as file:
        for index, (url, text) in enumerate(pages, start=1):
            file.write(f"### Page {index}\n")
            file.write(f"URL: {url}\n\n")
            file.write(text)
            file.write("\n\n" + ("-" * 80) + "\n\n")
    return output_path


def parse_args() -> argparse.Namespace:
    """
    Parse CLI options for scrape size, pacing, and output location.

    Returns:
        Parsed argparse namespace with `max_pages`, `delay`, and `output_dir`.
    """
    parser = argparse.ArgumentParser(
        description="Scrape documentation pages and save each technology into separate txt files."
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=40,
        help="Maximum pages to scrape per documentation site (default: 40).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.25,
        help="Delay in seconds between requests (default: 0.25).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("datasets") / "docs_text",
        help="Directory where text files will be written.",
    )
    return parser.parse_args()


def main() -> None:
    """
    Orchestrate the full scrape job for all configured technologies.

    Steps:
    1) Read CLI settings.
    2) Crawl each docs target.
    3) Write one `.txt` corpus file per target.
    """
    args = parse_args()

    print(f"Saving files to: {args.output_dir.resolve()}")
    for tech, config in DOC_TARGETS.items():
        print(f"\n=== Scraping {tech} docs ===")
        pages = crawl_docs(
            start_url=config["start_url"],
            allowed_prefix=config["allowed_prefix"],
            max_pages=args.max_pages,
            delay_seconds=args.delay,
        )

        output_path = write_output(args.output_dir, tech, pages)
        print(f"[DONE] {tech}: {len(pages)} pages -> {output_path}")


if __name__ == "__main__":
    main()
