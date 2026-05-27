# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS frontend

WORKDIR /app/frontent

RUN corepack enable

COPY frontent/package.json frontent/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontent/ ./
RUN pnpm build


FROM python:3.13-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    DJANGO_SETTINGS_MODULE=config.settings \
    DEBUG=false \
    SECURE_SSL_REDIRECT=false

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY manage.py uwsgi.ini ./
COPY config/ ./config/
COPY chat/ ./chat/
COPY --from=frontend /app/static/frontend ./static/frontend

RUN uv run python manage.py collectstatic --noinput


EXPOSE 8000/tcp

CMD ["uwsgi", "--show-config"]
