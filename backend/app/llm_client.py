import os
import json
import httpx
from dotenv import load_dotenv

load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")


def _get_model() -> str:
    if LLM_MODEL:
        return LLM_MODEL
    if LLM_PROVIDER == "anthropic":
        return "claude-sonnet-4-20250514"
    return "gpt-4o"


async def call_llm(system_prompt: str, user_message: str) -> str:
    """Unified LLM call layer supporting OpenAI and Anthropic APIs via httpx."""
    model = _get_model()

    try:
        if LLM_PROVIDER == "anthropic":
            return await _call_anthropic(system_prompt, user_message, model)
        else:
            return await _call_openai(system_prompt, user_message, model)
    except Exception as e:
        return f"[LLM Error] {type(e).__name__}: {str(e)}"


async def _call_openai(system_prompt: str, user_message: str, model: str) -> str:
    url = "https://api.openai.com/v1/chat/completions"
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
