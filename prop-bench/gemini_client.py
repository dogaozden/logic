"""Gemini API wrapper with caching, retry, and rate limiting."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Optional

from pydantic import ValidationError
from tenacity import RetryError, retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from . import config
from .models import ExtractionResponse, SynthesisResponse, USING_PYDANTIC
from .utils import ensure_dir, read_json, write_json

logger = logging.getLogger(__name__)


class GeminiClient:
    """Lightweight wrapper around Gemini with caching and structured output."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: str = config.GEMINI_MODEL,
        cache_dir: Path = config.CACHE_DIR,
        max_retries: int = config.MAX_RETRIES,
        requests_per_minute: int = config.REQUESTS_PER_MINUTE,
    ) -> None:
        self.api_key = api_key or os.getenv(config.GEMINI_API_KEY_ENV)
        if not self.api_key:
            raise RuntimeError(
                f"Missing API key. Set {config.GEMINI_API_KEY_ENV} in your environment."
            )

        # Prefer new SDK interface; fall back to google-generativeai.
        try:
            from google import genai  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "google.genai not available. Install the new Gemini SDK or use a compatible version."
            ) from exc

        self.genai = genai
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = model_name
        self.cache_dir = ensure_dir(Path(cache_dir))
        self.max_retries = max_retries
        self.requests_per_minute = requests_per_minute
        self._call_history: list[float] = []
        self._preflight_done = False
        self._rate_lock = threading.Lock()
        self._preflight_lock = threading.Lock()

    # --- Caching helpers -------------------------------------------------
    def _cache_path(self, namespace: str, key_material: str) -> Path:
        key_hash = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
        # Include model name in cache path so different models have separate caches
        model_slug = self.model_name.replace("/", "_").replace(":", "_")
        ns_dir = ensure_dir(self.cache_dir / model_slug / namespace)
        return ns_dir / f"{key_hash}.json"

    def _read_cache(self, path: Path) -> Optional[dict]:
        if path.exists():
            try:
                return read_json(path)
            except json.JSONDecodeError:
                logger.warning("Cache decode failed for %s; ignoring", path)
        return None

    # --- Rate limiting ---------------------------------------------------
    def _respect_rate_limit(self) -> None:
        sleep_for = 0.0
        with self._rate_lock:
            now = time.time()
            window_start = now - 60
            self._call_history = [t for t in self._call_history if t >= window_start]
            if len(self._call_history) >= self.requests_per_minute:
                sleep_for = 60 - (now - self._call_history[0])
                sleep_for = max(0, sleep_for)
            else:
                self._call_history.append(now)
                return

        if sleep_for:
            logger.debug("Rate limit reached; sleeping for %.2fs", sleep_for)
            time.sleep(sleep_for)

        with self._rate_lock:
            now = time.time()
            window_start = now - 60
            self._call_history = [t for t in self._call_history if t >= window_start]
            self._call_history.append(now)

    def preflight(self) -> None:
        """Validate API key and model access before heavy workloads."""
        with self._preflight_lock:
            if self._preflight_done:
                return
            try:
                self.client.models.generate_content(
                    model=self.model_name,
                    contents="ping",
                )
            except Exception as exc:
                raise RuntimeError(
                    "Gemini preflight failed. Check GEMINI_API_KEY and model access."
                ) from exc
            self._preflight_done = True

    # --- Core call helpers -----------------------------------------------
    def _generate_json(
        self, prompt: str, response_mime_type: str = "application/json"
    ) -> dict:
        @retry(
            stop=stop_after_attempt(self.max_retries),
            wait=wait_exponential(min=1, max=10),
            retry=retry_if_exception_type(Exception),
            reraise=True,
        )
        def _wrapped_call() -> dict:
            self._respect_rate_limit()
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={"response_mime_type": response_mime_type},
            )
            text = getattr(response, "text", None) or ""
            if not text and getattr(response, "candidates", None):
                # best-effort extraction from parts
                for candidate in response.candidates:
                    for part in getattr(candidate.content, "parts", []):
                        if getattr(part, "text", None):
                            text += part.text
            if not text:
                raise ValueError("Empty response from Gemini")
            try:
                return json.loads(text)
            except json.JSONDecodeError as exc:
                logger.error("Failed to parse JSON from Gemini response: %s", exc)
                logger.error("Raw response: %s", text)
                raise ValueError(f"Malformed JSON from Gemini: {exc}") from exc

        try:
            return _wrapped_call()
        except RetryError as exc:
            raise RuntimeError(f"Gemini request failed after retries: {exc}") from exc

    # --- Public methods --------------------------------------------------
    def extract(self, prompt: str, cache_key: Optional[str] = None) -> dict:
        """Extraction call with structured output + caching (opt-in)."""
        cache_path = self._cache_path("extract", cache_key or prompt)
        if config.USE_CACHE:
            cached = self._read_cache(cache_path)
            if cached:
                logger.info("Cache hit for %s", cache_key or "prompt")
                return cached
        if not USING_PYDANTIC:
            raise RuntimeError("Structured extraction requires pydantic to be installed.")

        @retry(
            stop=stop_after_attempt(self.max_retries),
            wait=wait_exponential(min=1, max=10),
            retry=retry_if_exception_type(Exception),
            reraise=True,
        )
        def _call_structured() -> dict:
            self._respect_rate_limit()
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_json_schema": ExtractionResponse.model_json_schema(),
                },
            )
            text = getattr(response, "text", None) or ""
            if not text and getattr(response, "candidates", None):
                for candidate in response.candidates:
                    for part in getattr(candidate.content, "parts", []):
                        if getattr(part, "text", None):
                            text += part.text
            if not text:
                raise ValueError("Empty response from Gemini")
            try:
                validated = ExtractionResponse.model_validate_json(text)
            except ValidationError as exc:
                logger.error("Structured validation failed: %s", exc)
                logger.error("Raw response: %s", text)
                raise ValueError(f"Malformed structured response: {exc}") from exc
            return validated.model_dump()

        try:
            result = _call_structured()
        except RetryError as exc:
            raise RuntimeError(f"Gemini request failed after retries: {exc}") from exc

        if config.USE_CACHE:
            write_json(result, cache_path)
        return result

    def synthesize(self, prompt: str, cache_key: Optional[str] = None) -> dict:
        """Synthesis call with structured output + caching (opt-in)."""
        cache_path = self._cache_path("synthesize", cache_key or prompt)
        if config.USE_CACHE:
            cached = self._read_cache(cache_path)
            if cached:
                if not USING_PYDANTIC:
                    return cached
                try:
                    validated = SynthesisResponse.model_validate(cached)
                    return validated.model_dump()
                except ValidationError as exc:
                    logger.warning("Cached synthesis payload invalid; regenerating: %s", exc)
        if not USING_PYDANTIC:
            raise RuntimeError("Structured synthesis requires pydantic to be installed.")

        @retry(
            stop=stop_after_attempt(self.max_retries),
            wait=wait_exponential(min=1, max=10),
            retry=retry_if_exception_type(Exception),
            reraise=True,
        )
        def _call_structured() -> dict:
            self._respect_rate_limit()
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_json_schema": SynthesisResponse.model_json_schema(),
                },
            )
            text = getattr(response, "text", None) or ""
            if not text and getattr(response, "candidates", None):
                for candidate in response.candidates:
                    for part in getattr(candidate.content, "parts", []):
                        if getattr(part, "text", None):
                            text += part.text
            if not text:
                raise ValueError("Empty response from Gemini")
            try:
                validated = SynthesisResponse.model_validate_json(text)
            except ValidationError as exc:
                logger.error("Structured validation failed: %s", exc)
                logger.error("Raw response: %s", text)
                raise ValueError(f"Malformed structured response: {exc}") from exc
            return validated.model_dump()

        try:
            result = _call_structured()
        except RetryError as exc:
            raise RuntimeError(f"Gemini request failed after retries: {exc}") from exc

        if config.USE_CACHE:
            write_json(result, cache_path)
        return result
