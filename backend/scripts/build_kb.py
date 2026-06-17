"""One-time script to build the BATD-R manual knowledge base.

Usage:
    cd backend
    python scripts/build_kb.py
"""

import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

PDF_PATH = Path(__file__).parent.parent / "data" / (
    "2011-Ten-Year-Revision-of-the-Brief-Behavioral-Activation-Treatment-for-"
    "Depression-Revised-Treatment-Manual-Lejuez-et-al.pdf"
)
KB_PATH = Path(__file__).parent.parent / "data" / "batdr_kb.json"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


def extract_text(pdf_path: Path) -> str:
    from pypdf import PdfReader
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text and text.strip():
            pages.append(text.strip())
    return "\n\n".join(pages)


def split_chunks(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        chunk = text[start:start + CHUNK_SIZE].strip()
        if chunk:
            chunks.append(chunk)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def build():
    from app.llm_client import get_embeddings_batch

    print(f"Reading PDF: {PDF_PATH}")
    if not PDF_PATH.exists():
        print(f"ERROR: PDF not found at {PDF_PATH}")
        sys.exit(1)

    text = extract_text(PDF_PATH)
    print(f"Extracted {len(text):,} characters")

    chunks = split_chunks(text)
    print(f"Split into {len(chunks)} chunks")

    print("Embedding chunks in batches of 10...")
    records = []
    batch_size = 10
    for batch_start in range(0, len(chunks), batch_size):
        batch = chunks[batch_start:batch_start + batch_size]
        # retry up to 3 times on network error
        for attempt in range(3):
            try:
                embeddings = await get_embeddings_batch(batch)
                break
            except Exception as e:
                if attempt == 2:
                    raise
                print(f"  Retry {attempt + 1} for batch {batch_start // batch_size + 1}: {e}")
                await asyncio.sleep(3)
        for j, (chunk, embedding) in enumerate(zip(batch, embeddings)):
            records.append({"id": batch_start + j, "text": chunk, "embedding": embedding})
        done = min(batch_start + batch_size, len(chunks))
        print(f"  {done}/{len(chunks)}")

    with open(KB_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False)

    print(f"\nDone. Knowledge base saved to {KB_PATH}")
    print(f"Total chunks: {len(records)}")


if __name__ == "__main__":
    asyncio.run(build())
