// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

/// @title RegisterAgent
/// @notice 对已部署的 AgentRegistry 注册或更新一个服务商（含 HTTP endpoint / 简介 / 官网）。
///
/// 用法：
///   export PRIVATE_KEY=0x...          # registry owner
///   export AGENT_REGISTRY=0x...
///   export AGENT_ADDRESS=0x...
///   export AGENT_NAME="AvaFlights B"
///   export AGENT_CATEGORY=0           # 0–3 单类；或 1–15 直接当 bitmask
///   export AGENT_CATEGORY_MASK=15     # 可选，覆盖 AGENT_CATEGORY（综合型 15=机票+酒店+门票+餐饮）
///   export AGENT_ENDPOINT=http://127.0.0.1:3021
///   export AGENT_DESCRIPTION="..."    # 可选
///   export AGENT_WEBSITE=https://...  # 可选
///   forge script script/RegisterAgent.s.sol:RegisterAgent --rpc-url fuji --broadcast
contract RegisterAgent is Script {
    function run() external {
        address registryAddr = vm.envAddress("AGENT_REGISTRY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        string memory name = vm.envString("AGENT_NAME");
        uint8 categoryMask = _resolveMask();
        string memory endpoint = vm.envString("AGENT_ENDPOINT");
        string memory description = vm.envOr("AGENT_DESCRIPTION", string(""));
        string memory website = vm.envOr("AGENT_WEBSITE", string(""));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        AgentRegistry(registryAddr).registerAgent(
            agent, name, categoryMask, endpoint, description, website
        );
        vm.stopBroadcast();

        console2.log("Registered", agent);
        console2.log("Registry  ", registryAddr);
        console2.log("Mask      ", categoryMask);
        console2.log("Endpoint  ", endpoint);
        console2.log("Website   ", website);
    }

    function _resolveMask() internal view returns (uint8) {
        uint256 overrideMask = vm.envOr("AGENT_CATEGORY_MASK", uint256(0));
        if (overrideMask > 0) return uint8(overrideMask);
        uint8 raw = uint8(vm.envUint("AGENT_CATEGORY"));
        if (raw <= 3) return uint8(1) << raw;
        return raw;
    }
}
