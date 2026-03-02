# Self-Correction-Agent

This project is now focused on one benchmark scenarii introduce to you **Killua AI** : **The Synthetic Senior Engineer**.

The assistant is asked to generate a component that combines multiple advanced libraries (for example: Tailwind CSS, Pinecone SDK, and Framer Motion), while an internal **Auditor** verifies API correctness against stored documentation and forces rewrites until the output is valid.

## Core Goal

Build an AI workflow that can:

1. Generate implementation code from a prompt.
2. Detect hallucinated props, outdated methods, and version-mismatched syntax.
3. Retrieve grounded facts from a Pinecone docs index.
4. Self-correct and regenerate until the result is syntactically and semantically consistent.

## Why This Project

When one answer requires several libraries at once, LLMs commonly blend incompatible APIs.  
This repo exists to test whether a structured correction loop (Generator -> Auditor -> Generator) can reliably fix those errors before final output.

## System Outline

- **Generator node**: Produces first-pass code.
- **Auditor node**: Checks generated code against indexed docs.
- **Retriever node (Pinecone)**: Returns relevant documentation chunks for evidence-backed correction.
- **Finalizer node**: Returns corrected output with a short rationale.

## Repository Structure

```text
Self-Correction-Agent/
|-- backend/
|   |-- agent.py
|   |-- data_chunk.py
|   |-- server.ts
|   `-- package.json
|-- datasets/
|   |-- scrape.py
|   `-- datasets/docs_text/
|-- frontend/
|   |-- src/
|   |   |-- App.tsx
|   |   |-- main.tsx
|   |   `-- index.css
|   `-- package.json
|-- logic.txt
`-- README.md
```

## Data Layer (Pinecone Ingestion)

Documentation corpora are chunked and ingested using `backend/data_chunk.py`.

- Source files: `datasets/datasets/docs_text/*.txt`
- Index type: Integrated embedding index (Pinecone)
- Record flow: parse pages -> chunk text -> upsert records -> verify namespace stats

Run from repo root:

```bash
python backend/data_chunk.py --namespace docs-v1
```

Or from `backend/`:

```bash
python data_chunk.py --namespace docs-v1
```

## Frontend + Backend Runtime (Current)

- Frontend: React + TypeScript + Vite
- Realtime channel: WebSocket (`backend/server.ts`)
- Current stream behavior: status events followed by final response

## Next Milestones

1. Implement `backend/agent.py` as the Generator/Auditor orchestration layer.
2. Route retrieval calls to Pinecone namespace docs used during ingestion.
3. Surface correction traces in UI (`thinking -> verifying -> correcting -> final`).
4. Add evaluation prompts that require all target libraries in one answer.
