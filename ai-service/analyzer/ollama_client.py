import re
import time

import httpx

THINK_BLOCK_RE = re.compile(
    r"<think>.*?(?:</think>|$)|<analysis>.*?(?:</analysis>|$)",
    re.DOTALL | re.IGNORECASE,
)
ORPHAN_END_THINK_RE = re.compile(r"^.*?</(?:think|analysis)>\s*", re.DOTALL | re.IGNORECASE)


def strip_thinking(text: str) -> str:
    """Remove thinking embutido, inclusive respostas malformadas."""
    text = THINK_BLOCK_RE.sub("", text)
    return ORPHAN_END_THINK_RE.sub("", text).strip()


class OllamaError(RuntimeError):
    pass


class OllamaClient:
    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: int,
        keep_alive: str,
        think: bool = False,
        max_retries: int = 2,
        retry_backoff_seconds: float = 3.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.keep_alive = keep_alive
        self.think = False
        self.max_retries = max(0, max_retries)
        self.retry_backoff_seconds = retry_backoff_seconds
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def chat(self, system: str, user: str, temperature: float = 0.1) -> str:
        if not system.strip().startswith(("/nothink", "/no_think")):
            system = f"/nothink\n{system}"

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": False,
            "keep_alive": self.keep_alive,
            "think": False,
            "options": {
                "temperature": temperature
            }
        }

        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self._client.post(f"{self.base_url}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
                break
            except httpx.HTTPError as exc:
                last_error = exc
                if attempt < self.max_retries:
                    time.sleep(self.retry_backoff_seconds * (attempt + 1))
                    continue
                raise OllamaError(
                    f"Não foi possível acessar o Ollama em {self.base_url} "
                    f"após {self.max_retries + 1} tentativa(s): {last_error}"
                ) from last_error

        content = data.get("message", {}).get("content", "")
        content = strip_thinking(content)
        if not content:
            raise OllamaError("O Ollama retornou uma resposta vazia.")
        return content

    def check(self) -> None:
        try:
            response = self._client.get(f"{self.base_url}/api/tags", timeout=10)
            response.raise_for_status()
            models = response.json().get("models", [])
        except httpx.HTTPError as exc:
            raise OllamaError(
                f"Ollama não está acessível em {self.base_url}: {exc}"
            ) from exc

        names = set()
        for item in models:
            for key in ("name", "model"):
                value = item.get(key)
                if value:
                    names.add(value)

        base = self.model.split(":")[0]
        if self.model not in names and not any(n.split(":")[0] == base for n in names):
            raise OllamaError(
                f"Modelo '{self.model}' não está instalado. "
                f"Execute: ollama pull {self.model}"
            )
