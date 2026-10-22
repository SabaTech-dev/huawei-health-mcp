# ---- Stage 1: dependencies ----
FROM python:3.11-slim AS deps

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Stage 2: runtime ----
FROM python:3.11-slim AS runtime

# Card 3a64f98b (17-sep): apt upgrade → deb13u1 — limpia perl CRIT CVE-2026-13221/42496/8376 (SBOM 16-sep)
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd --create-home --shell /usr/sbin/nologin appuser

WORKDIR /app

# Copy installed Python dependencies from the deps stage
COPY --from=deps /install /usr/local

# Copy source
COPY src/ src/

# Create data directory and hand it to the runtime user
RUN mkdir -p /data/huawei-health && chown -R appuser:appuser /data/huawei-health /app

USER appuser

EXPOSE 8080

# Healthcheck (wget-free: uses the Python runtime already present)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r=httpx.get('http://localhost:8080/api/v1/health'); r.raise_for_status()"

# Production env file is optional; Coolify overrides with its own env vars
CMD ["sh", "-c", "if [ -f .env.production ]; then export $(grep -v '^#' .env.production | xargs); fi && uvicorn src.main:app --host 0.0.0.0 --port 8080"]

# Protected from Coolify DockerCleanupJob (incident run 105, 18-sep — GO Joker (a))
LABEL coolify.managed=true
