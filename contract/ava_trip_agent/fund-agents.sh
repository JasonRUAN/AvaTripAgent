#!/usr/bin/env bash
set -euo pipefail

# 部署后（或 Agent 钱包 gas 用完时）给 5 个 Agent 地址补 AVAX。
# forge 必须在 foundry 项目根目录运行：.env 读取依赖它
cd "$(dirname "$0")"

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

# FUND_AGENT_AVAX：每个地址的目标余额（单位 ether），已够的地址会跳过
forge script script/FundAgents.s.sol:FundAgents --rpc-url fuji --broadcast
