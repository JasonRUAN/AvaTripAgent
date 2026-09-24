#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 构建前把仓库根地址快照拷进镜像上下文
../scripts/sync-fuji-deployment.sh

docker build --platform linux/amd64 -t rzexin/avatrip-agents:v0.1.0 .
docker push rzexin/avatrip-agents:v0.1.0
