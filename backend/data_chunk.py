from __future__ import annotations

"""
Chunk documentation text files and ingest chunks into a Pinecone integrated-embedding index.

Example:
    python backend/data_chunk.py --namespace docs-v1
    python backend/data_chunk.py --dry-run --max-records 200
"""

import argparse
import glob
import os
import re
import time
import unicodedata
from pathlib import Path
from typing import Dict, Iterable, Iterator, List, Tuple

from dotenv import load_dotenv
from pinecone import Pinecone

SEPARATOR_LINE = "-" * 80
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
MAX_UPSERT_BATCH_SIZE = 96


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Chunk docs and upsert records into Pinecone"
    )
    parser.add_argument(
        "--input-glob",
        default="datasets/datasets/docs_text/*.txt",
        help="Glob pattern for source text files",
    )
    parser.add_argument(
        "--namespace",
        default=os.getenv("PINECONE_NAMESPACE", "docs-v1"),
        help="Pinecone namespace for records",
    )
    parser.add_argument(
        "--index-name",
        default=os.getenv("PINECONE_INDEX_NAME", "killua-ai"),
        help="Pinecone index name",
    )
    parser.add_argument(
        "--index-host",
        default=os.getenv("PINECONE_INDEX_HOST", ""),
        help="Pinecone index host (preferred). If empty, host is resolved by index name.",
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=1200,
        help="Chunk size in characters",
    )
    parser.add_argument(
        "--chunk-overlap",
        type=int,
        default=200,
        help="Chunk overlap in characters",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=96,
        help="Records per upsert batch",
    )
    parser.add_argument(
        "--max-records",
        type=int,
        default=0,
        help="Optional cap for ingested records (0 = no cap)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build records and counts only; do not write to Pinecone",
    )
    parser.add_argument(
        "--create-index-if-missing",
        action="store_true",
        help="Create an integrated embedding index if index_name does not exist",
    )
    parser.add_argument(
        "--cloud",
        default=os.getenv("PINECONE_CLOUD", "aws"),
        help="Cloud provider for index creation",
    )
    parser.add_argument(
        "--region",
        default=os.getenv("PINECONE_REGION", "us-east-1"),
        help="Region for index creation",
    )
    parser.add_argument(
        "--embed-model",
        default=os.getenv("PINECONE_EMBED_MODEL", "llama-text-embed-v2"),
        help="Integrated embedding model for index creation",
    )
    parser.add_argument(
        "--record-text-field",
        default=os.getenv("PINECONE_RECORD_TEXT_FIELD", ""),
        help="Record field used as embedding input text. Auto-detected if empty.",
    )
    return parser.parse_args()


def to_dict(obj: object) -> Dict:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "to_dict"):
        return obj.to_dict()  # type: ignore[no-any-return]
    return {}


def read_source_files(input_glob: str) -> List[Path]:
    patterns: List[str] = []

    raw_pattern = Path(input_glob)
    if raw_pattern.is_absolute():
        patterns.append(str(raw_pattern))
    else:
        patterns.append(str(raw_pattern))
        patterns.append(str(PROJECT_ROOT / raw_pattern))

    seen: set[Path] = set()
    files: List[Path] = []
    for pattern in patterns:
        for path_str in glob.glob(pattern):
            path = Path(path_str).resolve()
            if path.is_file() and path not in seen:
                seen.add(path)
                files.append(path)

    files.sort()
    return files


def parse_pages(raw_text: str) -> Iterator[Tuple[int, str, str]]:
    pattern = rf"\r?\n{re.escape(SEPARATOR_LINE)}\r?\n"
    blocks = re.split(pattern, raw_text)

    for block in blocks:
        text = block.strip()
        if not text:
            continue

        lines = text.splitlines()
        page_number = 0
        url = ""
        start_line = 0

        if lines and lines[0].startswith("### Page"):
            match = re.match(r"### Page\s+(\d+)", lines[0].strip())
            if match:
                page_number = int(match.group(1))
            start_line = 1

        if start_line < len(lines) and lines[start_line].startswith("URL:"):
            url = lines[start_line][4:].strip()
            start_line += 1

        body = "\n".join(lines[start_line:]).strip()
        if body:
            yield page_number, url, body


def chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> Iterator[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if chunk_overlap < 0:
        raise ValueError("chunk_overlap must be >= 0")
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be smaller than chunk_size")

    clean = text.strip()
    if not clean:
        return

    start = 0
    text_len = len(clean)
    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunk = clean[start:end].strip()
        if chunk:
            yield chunk

        if end >= text_len:
            break
        start = end - chunk_overlap


def to_ascii_safe(text: str) -> str:
    # Normalize punctuation and force ASCII-only content to avoid transport encoding issues.
    translation = str.maketrans(
        {
            "\u2018": "'",
            "\u2019": "'",
            "\u201c": '"',
            "\u201d": '"',
            "\u2013": "-",
            "\u2014": "-",
            "\u2026": "...",
            "\xa0": " ",
        }
    )
    normalized = unicodedata.normalize("NFKC", text).translate(translation)
    # Keep tabs/newlines and printable ASCII only.
    normalized = re.sub(r"[^\x09\x0A\x0D\x20-\x7E]", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def iter_records(
    files: Iterable[Path],
    chunk_size: int,
    chunk_overlap: int,
    max_records: int,
    text_field: str,
) -> Iterator[Dict]:
    emitted = 0

    for file_path in files:
        source_name = file_path.stem
        raw_text = file_path.read_text(encoding="utf-8", errors="ignore")

        for page_number, url, page_text in parse_pages(raw_text):
            for chunk_index, chunk in enumerate(
                chunk_text(page_text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
            ):
                record_id = f"{source_name}-p{page_number:04d}-c{chunk_index:04d}"
                record = {
                    "_id": record_id,
                    "source": to_ascii_safe(source_name),
                    "url": to_ascii_safe(url),
                    "page": page_number,
                    "chunk_index": chunk_index,
                }
                record[text_field] = to_ascii_safe(chunk)
                yield record

                emitted += 1
                if max_records > 0 and emitted >= max_records:
                    return


def get_upserted_count(response: object, fallback: int) -> int:
    data = to_dict(response)
    if data:
        if "upsertedCount" in data and data["upsertedCount"] is not None:
            return int(data["upsertedCount"])
        if "upserted_count" in data and data["upserted_count"] is not None:
            return int(data["upserted_count"])

    if hasattr(response, "upserted_count"):
        value = getattr(response, "upserted_count")
        if value is not None:
            return int(value)

    return fallback


def resolve_text_field(index_info: Dict, explicit_field: str) -> str:
    if explicit_field:
        return explicit_field

    embed = index_info.get("embed", {})
    if isinstance(embed, dict):
        field_map = embed.get("field_map", {})
        if isinstance(field_map, dict):
            mapped = field_map.get("text")
            if isinstance(mapped, str) and mapped:
                return mapped

    return "chunk_text"


def resolve_index(pc: Pinecone, args: argparse.Namespace):
    if args.index_host:
        print(f"Using index host from input/env: {args.index_host}")
        text_field = args.record_text_field or "chunk_text"
        print(f"Using record text field: {text_field}")
        return pc.Index(host=args.index_host), text_field

    if not pc.has_index(args.index_name):
        if not args.create_index_if_missing:
            raise RuntimeError(
                f"Index '{args.index_name}' does not exist. "
                "Create it in Pinecone or use --create-index-if-missing."
            )

        print(f"Creating index '{args.index_name}' with model '{args.embed_model}'...")
        pc.create_index_for_model(
            name=args.index_name,
            cloud=args.cloud,
            region=args.region,
            embed={
                "model": args.embed_model,
                "field_map": {"text": "chunk_text"},
            },
        )

    index_info = pc.describe_index(args.index_name)
    info = to_dict(index_info)
    host = info.get("host", "")
    if not host:
        raise RuntimeError(
            f"Could not resolve host for index '{args.index_name}'. "
            "Set PINECONE_INDEX_HOST or pass --index-host."
        )

    status = info.get("status", {})
    state = status.get("state")
    ready = status.get("ready")
    if ready is False:
        print(f"Index status is '{state}'. Waiting until ready...")
        deadline = time.time() + 300
        while time.time() < deadline:
            info = to_dict(pc.describe_index(args.index_name))
            status = info.get("status", {})
            if status.get("ready") is True:
                host = info.get("host", host)
                break
            time.sleep(3)

    text_field = resolve_text_field(info, args.record_text_field)
    print(f"Resolved index host: {host}")
    print(f"Using record text field: {text_field}")
    return pc.Index(host=host), text_field


def upsert_batches(index, namespace: str, records: Iterable[Dict], batch_size: int, dry_run: bool) -> int:
    if batch_size <= 0:
        raise ValueError("batch_size must be > 0")
    if batch_size > MAX_UPSERT_BATCH_SIZE:
        print(
            f"Requested batch_size={batch_size} exceeds Pinecone limit. "
            f"Using {MAX_UPSERT_BATCH_SIZE}."
        )
        batch_size = MAX_UPSERT_BATCH_SIZE

    total = 0
    batch: List[Dict] = []

    def flush(current_batch: List[Dict]) -> int:
        if dry_run:
            print(f"[DRY RUN] Prepared batch with {len(current_batch)} records")
            return len(current_batch)

        response = index.upsert_records(namespace=namespace, records=current_batch)
        count = get_upserted_count(response, fallback=len(current_batch))
        print(f"Upserted {count} records")
        return count

    for record in records:
        batch.append(record)
        if len(batch) >= batch_size:
            total += flush(batch)
            batch = []

    if batch:
        total += flush(batch)

    return total


def main() -> None:
    load_dotenv()
    args = parse_args()

    files = read_source_files(args.input_glob)
    if not files:
        raise RuntimeError(f"No files matched input glob: {args.input_glob}")

    print(f"Found {len(files)} source files")
    for path in files:
        print(f" - {path}")

    records = iter_records(
        files=files,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        max_records=args.max_records,
        text_field=args.record_text_field or "chunk_text",
    )

    if args.dry_run:
        total = upsert_batches(
            index=None,
            namespace=args.namespace,
            records=records,
            batch_size=args.batch_size,
            dry_run=True,
        )
        print(f"Total records processed: {total}")
        return

    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("PINECONE_API_KEY is missing. Set it in .env")

    pc = Pinecone(api_key=api_key)
    index, text_field = resolve_index(pc, args)
    records = iter_records(
        files=files,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        max_records=args.max_records,
        text_field=text_field,
    )

    total = upsert_batches(
        index=index,
        namespace=args.namespace,
        records=records,
        batch_size=args.batch_size,
        dry_run=args.dry_run,
    )
    print(f"Total records processed: {total}")

    if not args.dry_run:
        stats = to_dict(index.describe_index_stats())
        namespace_stats = stats.get("namespaces", {}).get(args.namespace, {})
        vector_count = namespace_stats.get("vector_count", "unknown")
        print(f"Namespace '{args.namespace}' vector_count: {vector_count}")


if __name__ == "__main__":
    main()
