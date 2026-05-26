import os
import json
import asyncio
import logging
from collections import Counter
from datetime import datetime
import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com").rstrip("/")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
LLM_MAX_RETRIES = 2
LLM_RETRY_BASE_DELAY = 0.8
_LLM_STATS_STARTED_AT = datetime.now().isoformat()
_LLM_STATS: dict[str, Counter] = {
    "calls": Counter(),
    "attempts": Counter(),
    "success": Counter(),
    "success_by_attempt": Counter(),
    "success_after_retry": Counter(),
    "retryable_errors": Counter(),
    "non_retryable_errors": Counter(),
    "final_failures": Counter(),
}


def _get_model() -> str:
    if LLM_MODEL:
        return LLM_MODEL
    if LLM_PROVIDER == "anthropic":
        return "claude-sonnet-4-20250514"
    return "gpt-4o"


async def call_llm(system_prompt: str, user_message: str) -> str:
    """Unified LLM call layer supporting OpenAI, Anthropic, and ModelScope APIs."""
    model = _get_model()

    async def operation() -> str:
        if LLM_PROVIDER == "anthropic":
            return await _call_anthropic(system_prompt, user_message, model)
        elif LLM_PROVIDER == "modelscope":
            return await _call_modelscope(system_prompt, user_message, model)
        else:
            return await _call_openai(system_prompt, user_message, model)

    try:
        return await _call_with_retries("llm", operation)
    except Exception as e:
        return f"[LLM Error] {type(e).__name__}: {str(e)}"


async def call_llm_chat(system_prompt: str, messages: list[dict]) -> str:
    """Multi-turn chat call. messages is a list of {role: 'user'|'assistant', content: str}."""
    model = _get_model()

    async def operation() -> str:
        if LLM_PROVIDER == "anthropic":
            return await _call_anthropic_chat(system_prompt, messages, model)
        elif LLM_PROVIDER == "modelscope":
            return await _call_modelscope_chat(system_prompt, messages, model)
        else:
            return await _call_openai_chat(system_prompt, messages, model)

    try:
        return await _call_with_retries("llm_chat", operation)
    except Exception as e:
        return f"[LLM Error] {type(e).__name__}: {str(e)}"


def _is_retryable_llm_error(error: Exception) -> bool:
    if isinstance(error, (json.JSONDecodeError, httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(error, httpx.HTTPStatusError):
        return error.response.status_code in {408, 409, 425, 429, 500, 502, 503, 504}
    if isinstance(error, (KeyError, IndexError)):
        return True
    if isinstance(error, ValueError):
        message = str(error)
        return message.startswith("Empty choices") or message.startswith("Empty content")
    return False


def _require_nonempty_content(content, response_data: dict) -> str:
    if not isinstance(content, str) or not content.strip():
        raise ValueError(f"Empty content in response: {response_data}")
    return content.strip()


def _llm_error_key(error: Exception) -> str:
    if isinstance(error, httpx.HTTPStatusError):
        return f"HTTP_{error.response.status_code}"
    if isinstance(error, ValueError):
        message = str(error)
        if message.startswith("Empty content"):
            return "EmptyContent"
        if message.startswith("Empty choices"):
            return "EmptyChoices"
    return type(error).__name__


def get_llm_stats() -> dict:
    return {
        "started_at": _LLM_STATS_STARTED_AT,
        "provider": LLM_PROVIDER,
        "model": _get_model(),
        "max_attempts": LLM_MAX_RETRIES + 1,
        "retry_base_delay_seconds": LLM_RETRY_BASE_DELAY,
        **{key: dict(counter) for key, counter in _LLM_STATS.items()},
    }


async def _call_with_retries(label: str, operation) -> str:
    attempts = LLM_MAX_RETRIES + 1
    _LLM_STATS["calls"][label] += 1
    for attempt in range(1, attempts + 1):
        _LLM_STATS["attempts"][label] += 1
        try:
            result = await operation()
            _LLM_STATS["success"][label] += 1
            _LLM_STATS["success_by_attempt"][f"{label}:attempt_{attempt}"] += 1
            if attempt > 1:
                _LLM_STATS["success_after_retry"][label] += 1
                logger.info("%s succeeded after %s attempts", label, attempt)
            return result
        except Exception as error:
            retryable = _is_retryable_llm_error(error)
            error_key = _llm_error_key(error)
            stats_key = f"{label}:{error_key}"
            if retryable:
                _LLM_STATS["retryable_errors"][stats_key] += 1
            else:
                _LLM_STATS["non_retryable_errors"][stats_key] += 1

            if attempt >= attempts or not retryable:
                _LLM_STATS["final_failures"][stats_key] += 1
                logger.error(
                    "%s failed after %s/%s attempts with %s: %s",
                    label,
                    attempt,
                    attempts,
                    type(error).__name__,
                    error,
                )
                raise
            delay = LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1))
            logger.warning(
                "%s failed on attempt %s/%s with %s: %s; retrying in %.1fs",
                label,
                attempt,
                attempts,
                type(error).__name__,
                error,
                delay,
            )
            await asyncio.sleep(delay)

    raise RuntimeError(f"{label} failed unexpectedly")


async def _call_openai(system_prompt: str, user_message: str, model: str) -> str:
    url = f"{OPENAI_BASE_URL}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.7,
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return _require_nonempty_content(content, data)


async def _call_anthropic(system_prompt: str, user_message: str, model: str) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": user_message},
        ],
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data["content"][0]["text"]
        return _require_nonempty_content(content, data)


async def _call_modelscope(system_prompt: str, user_message: str, model: str) -> str:
    """Call ModelScope API (OpenAI-compatible chat completions format)."""
    url = "https://api-inference.modelscope.cn/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {MODELSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        "max_tokens": 1024,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices")
        if not choices:
            raise ValueError(f"Empty choices in response: {data}")
        content = (choices[0].get("message") or {}).get("content")
        return _require_nonempty_content(content, data)


# ── Multi-turn implementations ──────────────────────────────────────────────

async def _call_openai_chat(system_prompt: str, messages: list[dict], model: str) -> str:
    url = f"{OPENAI_BASE_URL}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "temperature": 0.7,
        "max_tokens": 1024,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return _require_nonempty_content(content, data)


async def _call_anthropic_chat(system_prompt: str, messages: list[dict], model: str) -> str:
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "max_tokens": 1024,
        "system": system_prompt,
        "messages": messages,
        "temperature": 0.7,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        content = data["content"][0]["text"]
        return _require_nonempty_content(content, data)


async def get_embedding(text: str) -> list[float]:
    """Get embedding vector via OpenAI-compatible embeddings API."""
    results = await get_embeddings_batch([text])
    return results[0]


async def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Get embedding vectors for a batch of texts."""
    url = f"{OPENAI_BASE_URL}/v1/embeddings"
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": EMBEDDING_MODEL, "input": texts}
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()["data"]
        data.sort(key=lambda x: x["index"])
        return [item["embedding"] for item in data]


async def _call_modelscope_chat(system_prompt: str, messages: list[dict], model: str) -> str:
    url = "https://api-inference.modelscope.cn/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {MODELSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system_prompt}] + messages,
        "max_tokens": 1024,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
        choices = data.get("choices")
        if not choices:
            raise ValueError(f"Empty choices in response: {data}")
        content = (choices[0].get("message") or {}).get("content")
        return _require_nonempty_content(content, data)
