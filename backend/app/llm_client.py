import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com").rstrip("/")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")


def _get_model() -> str:
    if LLM_MODEL:
        return LLM_MODEL
    if LLM_PROVIDER == "anthropic":
        return "claude-sonnet-4-20250514"
    return "gpt-4o"


async def call_llm(system_prompt: str, user_message: str) -> str:
    """Unified LLM call layer supporting OpenAI, Anthropic, and ModelScope APIs."""
    model = _get_model()

    try:
        if LLM_PROVIDER == "anthropic":
            return await _call_anthropic(system_prompt, user_message, model)
        elif LLM_PROVIDER == "modelscope":
            return await _call_modelscope(system_prompt, user_message, model)
        else:
            return await _call_openai(system_prompt, user_message, model)
    except Exception as e:
        return f"[LLM Error] {type(e).__name__}: {str(e)}"


async def call_llm_chat(system_prompt: str, messages: list[dict]) -> str:
    """Multi-turn chat call. messages is a list of {role: 'user'|'assistant', content: str}."""
    model = _get_model()

    try:
        if LLM_PROVIDER == "anthropic":
            return await _call_anthropic_chat(system_prompt, messages, model)
        elif LLM_PROVIDER == "modelscope":
            return await _call_modelscope_chat(system_prompt, messages, model)
        else:
            return await _call_openai_chat(system_prompt, messages, model)
    except Exception as e:
        return f"[LLM Error] {type(e).__name__}: {str(e)}"


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
        return data["choices"][0]["message"]["content"].strip()


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
        return data["content"][0]["text"].strip()


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
        if not content:
            raise ValueError(f"Empty content in response: {data}")
        return content.strip()


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
        return data["choices"][0]["message"]["content"].strip()


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
        return data["content"][0]["text"].strip()


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
        if not content:
            raise ValueError(f"Empty content in response: {data}")
        return content.strip()
