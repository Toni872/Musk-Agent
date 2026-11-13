FROM python:3.15-slim

WORKDIR /app

# Install uv (the project's package manager).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies + the app package.
COPY pyproject.toml uv.lock ./
COPY app ./app
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import sys, urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
