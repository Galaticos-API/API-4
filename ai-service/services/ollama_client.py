import httpx
from typing import Any
from config import settings


class OllamaClient:
    """Async client for interacting with the local Ollama runtime."""

    def __init__(self, base_url: str = settings.OLLAMA_BASE_URL):
        self.base_url = base_url.rstrip("/")

    async def check_health(self) -> bool:
        """Check if Ollama server is responsive."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                return res.status_code == 200
        except Exception:
            return False

    async def get_embedding(self, text: str, model: str = settings.OLLAMA_EMBEDDING_MODEL) -> list[float]:
        """Generate text embedding vector using Ollama."""
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{self.base_url}/api/embeddings",
                json={"model": model, "prompt": text},
            )
            res.raise_for_status()
            data = res.json()
            return data.get("embedding", [])

    async def generate_response(
        self,
        prompt: str,
        system_prompt: str | None = None,
        model: str = settings.OLLAMA_LLM_MODEL,
        temperature: float = 0.2,
    ) -> str:
        """Generate text response using Ollama LLM."""
        payload: dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if system_prompt:
            payload["system"] = system_prompt

        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(f"{self.base_url}/api/generate", json=payload)
            res.raise_for_status()
            data = res.json()
            return data.get("response", "")


ollama_client = OllamaClient()
