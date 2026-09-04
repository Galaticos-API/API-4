from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv, find_dotenv

# Load root .env if available
load_dotenv(find_dotenv(usecwd=True))


class Settings(BaseSettings):
    AI_SERVICE_PORT: int = 8000
    AI_SERVICE_HOST: str = "0.0.0.0"
    
    # Ollama integration
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_LLM_MODEL: str = "qwen2.5:1.5b"
    OLLAMA_EMBEDDING_MODEL: str = "bge-m3"

    # PostgreSQL / pgvector connection
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "sinapse"
    POSTGRES_PASSWORD: str = "sinapse_dev_password"
    POSTGRES_DB: str = "sinapse"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
