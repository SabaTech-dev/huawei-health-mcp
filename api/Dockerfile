FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ src/

# Copy production env (Coolify will override with its own env vars)
COPY .env.production .env.production

# Create data directory
RUN mkdir -p /data/huawei-health

# Expose port
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; r=httpx.get('http://localhost:8080/api/v1/health'); r.raise_for_status()"

# Run
CMD ["sh", "-c", "if [ -f .env.production ]; then export $(grep -v '^#' .env.production | xargs); fi && uvicorn src.main:app --host 0.0.0.0 --port 8080"]
