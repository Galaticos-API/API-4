import re
import time
import json
from collections.abc import Callable

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
        num_predict: int = 1024,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.keep_alive = keep_alive
        self.think = False
        self.max_retries = max(0, max_retries)
        self.retry_backoff_seconds = retry_backoff_seconds
        self.num_predict = max(128, num_predict)
        self._client = httpx.Client(timeout=timeout)

    def close(self) -> None:
        self._client.close()

    def chat(
        self,
        system: str,
        user: str,
        temperature: float = 0.1,
        should_cancel: Callable[[], None] | None = None,
        num_predict: int | None = None,
    ) -> str:
        if not system.strip().startswith(("/nothink", "/no_think")):
            system = f"/nothink\n{system}"

        output_limit = max(128, num_predict or self.num_predict)
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "stream": True,
            "keep_alive": self.keep_alive,
            "think": False,
            "options": {
                "temperature": temperature,
                "num_predict": output_limit,
            }
        }

        last_error: Exception | None = None
        output_limit_retries = 0
        http_retries = 0
        while True:
            try:
                content_parts: list[str] = []
                done_reason = ""
                with self._client.stream("POST", f"{self.base_url}/api/chat", json=payload) as response:
                    response.raise_for_status()
                    for line in response.iter_lines():
                        if should_cancel:
                            should_cancel()
                        if not line:
                            continue
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            content_parts.append(content)
                        if data.get("done"):
                            done_reason = data.get("done_reason", "")
                            break
                if done_reason == "length":
                    if output_limit_retries < 4 and output_limit < 8192:
                        output_limit = min(8192, output_limit * 2)
                        output_limit_retries += 1
                        http_retries = 0
                        payload["options"]["num_predict"] = output_limit
                        continue
                    raise OllamaError(
                        f"A resposta do modelo atingiu o limite de {output_limit} tokens. "
                        "Aumente OLLAMA_FILE_NUM_PREDICT ou OLLAMA_SYNTHESIS_NUM_PREDICT."
                    )
                data = {"message": {"content": "".join(content_parts)}}
                break
            except httpx.HTTPError as exc:
                last_error = exc
                if http_retries < self.max_retries:
                    http_retries += 1
                    time.sleep(self.retry_backoff_seconds * http_retries)
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
