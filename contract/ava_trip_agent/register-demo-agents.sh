#!/usr/bin/env bash
set -euo pipefail

# 测试期一次把 4 家演示服务商登记进 AgentRegistry。
# 正式环境请用前端 /admin 录入。
#
# 依赖 contract/ava_trip_agent/.env（与部署脚本同一套地址）：
#   PRIVATE_KEY
#   FLIGHT_AGENT_ADDRESS / HOTEL_AGENT_ADDRESS / ATTRACTION_AGENT_ADDRESS / DINING_AGENT_ADDRESS
#   可选 AGENT_REGISTRY（缺省读 ../../deployments/fuji.json）
#   可选 *_AGENT_ENDPOINT（缺省 127.0.0.1:3011–3014）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

REQUIRED=(
    PRIVATE_KEY
    FLIGHT_AGENT_ADDRESS
    HOTEL_AGENT_ADDRESS
    ATTRACTION_AGENT_ADDRESS
    DINING_AGENT_ADDRESS
)

missing=()
for var in "${REQUIRED[@]}"; do
    if [ -z "${!var:-}" ]; then
        missing+=("$var")
    fi
done

if [ ${#missing[@]} -ne 0 ]; then
    echo "缺少环境变量: ${missing[*]}（写到 .env 或先 export）" >&2
    exit 1
fi

if [ -x "${HOME}/.foundry/bin/forge" ]; then
    FORGE="${HOME}/.foundry/bin/forge"
else
    FORGE="$(command -v forge)"
fi

echo "使用 forge: $FORGE"
echo "Flight     ${FLIGHT_AGENT_ADDRESS}  ${FLIGHT_AGENT_ENDPOINT:-http://127.0.0.1:3011}"
echo "Hotel      ${HOTEL_AGENT_ADDRESS}  ${HOTEL_AGENT_ENDPOINT:-http://127.0.0.1:3012}"
echo "Attraction ${ATTRACTION_AGENT_ADDRESS}  ${ATTRACTION_AGENT_ENDPOINT:-http://127.0.0.1:3013}"
echo "Dining     ${DINING_AGENT_ADDRESS}  ${DINING_AGENT_ENDPOINT:-http://127.0.0.1:3014}"

"$FORGE" script script/RegisterDemoAgents.s.sol:RegisterDemoAgents --rpc-url fuji --broadcast
