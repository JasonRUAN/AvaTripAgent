#!/usr/bin/env bash
set -euo pipefail

# forge 必须在 foundry 项目根目录运行：.env 读取、../../deployments 相对路径都依赖它
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

REQUIRED=(
    PRIVATE_KEY
    ORCHESTRATOR_ADDRESS
    FLIGHT_AGENT_ADDRESS
    HOTEL_AGENT_ADDRESS
    ATTRACTION_AGENT_ADDRESS
    DINING_AGENT_ADDRESS
)

missing=()
for var in "${REQUIRED[@]}"; do
    if [ -z "${!var:-}" ] && ! grep -qE "^${var}=" .env 2>/dev/null; then
        missing+=("$var")
    fi
done

if [ ${#missing[@]} -ne 0 ]; then
    echo "缺少环境变量: ${missing[*]}（写到 .env 或先 export）" >&2
    exit 1
fi

forge script script/Deploy.s.sol:Deploy --rpc-url fuji --broadcast

# forge 只写仓库根 deployments/fuji.json；前端 import 与后端 Docker 需要副本
"$SCRIPT_DIR/../../scripts/sync-fuji-deployment.sh"
