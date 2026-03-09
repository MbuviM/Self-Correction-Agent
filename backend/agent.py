from __future__ import annotations

import os
import re
import sys
from functools import lru_cache
from typing import Any, NotRequired, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langchain_aws import BedrockLLM, ChatBedrock, ChatBedrockConverse
from langgraph.graph import END, START, StateGraph
from pinecone import Pinecone

try:
    from dotenv import load_dotenv
except Exception:  # pragma: no cover - optional local env loading
    load_dotenv = None

"""
There will be four nodes one is the generator node.
Node 1 (Generator node) - Check intent and generate the first reply draft.
Node 2 (Retriever Node) - Retrieves the needed information from pinecone to generate an accurate response.
Node 3 (Evaluator Node) - Evaluates the draft reply and refines it based on the new information.
Node 4 (Output Node) - Outputs the final response.
"""

# create memory state
class ModelState(TypedDict):
    history: list[AnyMessage]
    query: str
    search_results: NotRequired[list[str]]
    draft_response: NotRequired[str]
    final_response: NotRequired[str]


if load_dotenv is not None:
    load_dotenv()


# llm instance function
def _get_model_config() -> tuple[str, str | None]:
    model_name = os.getenv("LLM_MODEL_ID", "").strip()
    if not model_name:
        raise ValueError("LLM_MODEL_ID is missing.")
    region_name = os.getenv("AWS_REGION", "").strip() or None
    return model_name, region_name


def _get_llm() -> ChatBedrock:
    model_name, region_name = _get_model_config()
    return ChatBedrock(model=model_name, region=region_name)


def _get_converse_llm() -> ChatBedrockConverse:
    model_name, region_name = _get_model_config()
    return ChatBedrockConverse(model=model_name, region_name=region_name)

# make every content a string
def _stringify_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(item) for item in content)
    return str(content)


def _invoke_generation(query: str) -> str:
    instructions = (
        "Generate a concise first-pass implementation draft. "
        "Do not invent library APIs. "
        "Format output as markdown with headings: "
        "'### Code' (single fenced code block) and "
        "'### Explanation' (short bullets or numbered points)."
    )
    messages = [SystemMessage(content=instructions), HumanMessage(content=query)]
    errors: list[str] = []

    try:
        llm = _get_converse_llm()
        response = llm.invoke(messages)
        return _stringify_content(response.content).strip()
    except Exception as exc:
        errors.append(f"Converse error: {type(exc).__name__}: {exc}")

    try:
        llm = _get_llm()
        response = llm.invoke(messages)
        return _stringify_content(response.content).strip()
    except Exception as exc:
        errors.append(f"Chat error: {type(exc).__name__}: {exc}")

    try:
        model_name, region_name = _get_model_config()
        llm = BedrockLLM(model_id=model_name, region_name=region_name)
        prompt = f"{instructions}\n\nUser request:\n{query}\n\nAnswer:"
        response = llm.invoke(prompt)
        return _stringify_content(response).strip()
    except Exception as exc:
        errors.append(f"Text error: {type(exc).__name__}: {exc}")

    raise RuntimeError(" | ".join(errors))


def _format_response(draft: str, snippets: list[str]) -> str:
    text = draft.strip()
    if not text:
        return ""

    code = ""
    code_lang = "text"
    explanation = text

    code_match = re.search(
        r"```(?P<lang>[a-zA-Z0-9_+-]*)\s*(?P<code>[\s\S]*?)```",
        text,
    )
    if code_match:
        code_lang = (code_match.group("lang") or "text").strip()
        code = code_match.group("code").strip()
        start, end = code_match.span()
        explanation = f"{text[:start]} {text[end:]}".strip()
    else:
        marker = re.search(r"\*\*Explanation:\*\*|Explanation:", text, flags=re.IGNORECASE)
        if marker and marker.start() > 0:
            candidate_code = text[: marker.start()].strip().strip("`")
            if candidate_code:
                code = candidate_code
                if "flutter" in text.lower() or "import 'package:flutter" in candidate_code:
                    code_lang = "dart"
                explanation = text[marker.start() :].strip()

    explanation = re.sub(r"^\*\*Explanation:\*\*\s*", "", explanation, flags=re.IGNORECASE).strip()
    explanation = re.sub(r"^Explanation:\s*", "", explanation, flags=re.IGNORECASE).strip()

    parts: list[str] = []
    if code:
        parts.append(f"### Code\n```{code_lang}\n{code}\n```")

    if explanation:
        parts.append(f"### Explanation\n{explanation}")

    if snippets:
        evidence = "\n".join(f"- {snippet}" for snippet in snippets[:3])
        parts.append(f"### Sources\n{evidence}")

    return "\n\n".join(parts) if parts else text


@lru_cache(maxsize=1)
def _get_pinecone_index() -> tuple[Any | None, str]:
    api_key = os.getenv("PINECONE_API_KEY", "").strip()
    if not api_key:
        return None, ""

    pc = Pinecone(api_key=api_key)
    text_field = os.getenv("PINECONE_RECORD_TEXT_FIELD", "").strip()
    index_host = os.getenv("PINECONE_INDEX_HOST", "").strip()

    if index_host:
        return pc.Index(host=index_host), text_field or "chunk_text"

    index_name = os.getenv("PINECONE_INDEX_NAME", "").strip()
    if not index_name:
        return None, text_field or "chunk_text"
    index_info = pc.describe_index(index_name)
    info = index_info.to_dict() if hasattr(index_info, "to_dict") else index_info
    if not isinstance(info, dict):
        return None, text_field or "chunk_text"

    host = str(info.get("host", "")).strip()
    if not host:
        return None, text_field or "chunk_text"

    if not text_field:
        embed = info.get("embed", {})
        if isinstance(embed, dict):
            field_map = embed.get("field_map", {})
            if isinstance(field_map, dict):
                mapped = field_map.get("text")
                if isinstance(mapped, str) and mapped.strip():
                    text_field = mapped.strip()

    return pc.Index(host=host), text_field or "chunk_text"

# generator node
def generator_node(state: ModelState) -> dict[str, Any]:
    query = state["query"].strip()
    if not query:
        raise ValueError("ModelState.query must be a non-empty string.")

    history = list(state.get("history", []))

    if not os.getenv("LLM_MODEL_ID"):
        draft = f"Draft response (placeholder): {query}"
    else:
        try:
            draft = _invoke_generation(query)
        except Exception as exc:
            draft = f"Draft response (fallback): {query}\n\nLLM error: {type(exc).__name__}: {exc}"

    return {
        "draft_response": draft,
        "history": [*history, HumanMessage(content=query), AIMessage(content=draft)],
    }


def retriever_node(state: ModelState) -> dict[str, Any]:
    query = state["query"].strip()
    if not query:
        return {"search_results": []}

    try:
        top_k = max(1, int(os.getenv("PINECONE_TOP_K", "4")))
    except ValueError:
        top_k = 4
    namespace = os.getenv("PINECONE_NAMESPACE", "docs-v1").strip() or "docs-v1"

    try:
        index, text_field = _get_pinecone_index()
        if index is None:
            return {"search_results": state.get("search_results", [])}

        response = index.search(
            namespace=namespace,
            query={"inputs": {"text": query}, "top_k": top_k},
            fields=[text_field, "source", "url", "page", "chunk_index"],
        )
    except Exception:
        return {"search_results": state.get("search_results", [])}

    payload = response.to_dict() if hasattr(response, "to_dict") else response
    if not isinstance(payload, dict):
        return {"search_results": []}

    hits = []
    result = payload.get("result", {})
    if isinstance(result, dict):
        raw_hits = result.get("hits", [])
        if isinstance(raw_hits, list):
            hits = raw_hits
    if not hits:
        raw_matches = payload.get("matches", [])
        if isinstance(raw_matches, list):
            hits = raw_matches

    snippets: list[str] = []
    seen: set[str] = set()
    for hit in hits:
        if not isinstance(hit, dict):
            continue

        fields = hit.get("fields", {})
        if not isinstance(fields, dict):
            fields = hit.get("metadata", {})
        if not isinstance(fields, dict):
            continue

        text = str(
            fields.get(text_field)
            or fields.get("chunk_text")
            or fields.get("text")
            or ""
        ).strip()
        if not text:
            continue

        source = str(fields.get("source", "")).strip()
        page = fields.get("page")
        prefix_parts = [part for part in [source, f"p.{page}" if page is not None else ""] if part]
        prefix = " | ".join(prefix_parts)
        snippet = f"{prefix}: {text}" if prefix else text

        if snippet in seen:
            continue
        seen.add(snippet)
        snippets.append(snippet)
        if len(snippets) >= top_k:
            break

    return {"search_results": snippets}


def evaluator_node(state: ModelState) -> dict[str, Any]:
    draft = state.get("draft_response", "").strip()
    snippets = state.get("search_results", [])

    if not draft:
        return {"final_response": ""}

    final = _format_response(draft, snippets)

    return {"final_response": final}


def output_node(state: ModelState) -> dict[str, Any]:
    return {"final_response": state.get("final_response", state.get("draft_response", ""))}


def build_graph():
    graph = StateGraph(ModelState)
    graph.add_node("generator", generator_node)
    graph.add_node("retriever", retriever_node)
    graph.add_node("evaluator", evaluator_node)
    graph.add_node("output", output_node)

    graph.add_edge(START, "generator")
    graph.add_edge("generator", "retriever")
    graph.add_edge("retriever", "evaluator")
    graph.add_edge("evaluator", "output")
    graph.add_edge("output", END)
    return graph.compile()


def run_query(query: str) -> str:
    cleaned_query = query.strip()
    if not cleaned_query:
        return ""

    app = build_graph()
    result = app.invoke({"history": [], "query": cleaned_query})
    return str(result.get("final_response", "")).strip()


if __name__ == "__main__":
    prompt = " ".join(sys.argv[1:]).strip()
    if not prompt:
        print("")
        raise SystemExit(0)

    print(run_query(prompt))
