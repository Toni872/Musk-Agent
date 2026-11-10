FROM python:3.12-slim

WORKDIR /app

# Install uv (the project's package manager).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies + the app package.
COPY pyproject.toml uv.lock ./
COPY app ./app
RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
