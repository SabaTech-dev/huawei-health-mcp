#!/bin/bash
# Huawei Health MCP — Deploy Script
# Deploys the Backend API as a Docker container

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="huawei-health-api"
CONTAINER_NAME="huawei-health-api"
DATA_DIR="/data/huawei-health"
PORT=8081

echo "🏥 Huawei Health MCP — Deploy"
echo "=============================="

# Create data directory
sudo mkdir -p "$DATA_DIR"

# Build image
echo "📦 Building Docker image..."
docker build -t "$IMAGE_NAME:latest" "$SCRIPT_DIR/api"

# Stop existing container if running
if docker ps -q -f name="$CONTAINER_NAME" | grep -q .; then
    echo "🛑 Stopping existing container..."
    docker stop "$CONTAINER_NAME" && docker rm "$CONTAINER_NAME"
fi

# Run container
echo "🚀 Starting container on port $PORT..."
docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "$PORT:8080" \
    -v "$DATA_DIR:/data/huawei-health" \
    -e HUAWEI_CLIENT_ID="${HUAWEI_CLIENT_ID}" \
    -e HUAWEI_CLIENT_SECRET="${HUAWEI_CLIENT_SECRET}" \
    -e HUAWEI_REDIRECT_URI="${HUAWEI_REDIRECT_URI:-http://$(hostname -I | awk '{print $1}'):${PORT}/api/v1/auth/callback}" \
    -e SECRET_KEY="${SECRET_KEY:-$(openssl rand -hex 32)}" \
    "$IMAGE_NAME:latest"

echo ""
echo "✅ Deployed successfully!"
echo ""
echo "📊 API: http://localhost:$PORT"
echo "🔍 Health: http://localhost:$PORT/api/v1/health"
echo "🔐 Auth: http://localhost:$PORT/api/v1/auth/authorize"
echo "📁 Data: $DATA_DIR"
echo ""
echo "⚠️  Next steps:"
echo "   1. Set HUAWEI_CLIENT_ID and HUAWEI_CLIENT_SECRET env vars"
echo "   2. Visit the Auth URL in your browser to complete OAuth"
echo "   3. The API will store your token automatically"
