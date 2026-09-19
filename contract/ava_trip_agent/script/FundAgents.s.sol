// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {EtherAmount} from "./EtherAmount.sol";

/// @title FundAgents
/// @notice 部署后补发 gas：给 Orchestrator + 4 个服务商 Agent 各补足到 FUND_AGENT_AVAX。
///
/// 用法（Fuji）：
///   export PRIVATE_KEY=0x...              # 出资方，通常是 Orchestrator
///   export ORCHESTRATOR_ADDRESS=0x...
///   export FLIGHT_AGENT_ADDRESS=0x...
///   export HOTEL_AGENT_ADDRESS=0x...
///   export ATTRACTION_AGENT_ADDRESS=0x...
///   export DINING_AGENT_ADDRESS=0x...
///   export FUND_AGENT_AVAX=0.15           # 目标余额，已够的地址会跳过
///   forge script script/FundAgents.s.sol:FundAgents --rpc-url fuji --broadcast
contract FundAgents is Script {
    /// 每笔转账预留的 gas 上限，防止把出资方余额算干净后卡在最后一笔
    uint256 internal constant GAS_RESERVE = 0.005 ether;

    error InsufficientFunderBalance(address funder, uint256 balance, uint256 needed);

    function run() external {
        // 默认与部署时一致：每个地址 0.15 AVAX
        uint256 target = EtherAmount.toWei(vm.envOr("FUND_AGENT_AVAX", string("0.15")));

        address funder = vm.addr(vm.envUint("PRIVATE_KEY"));

        string[5] memory names = ["orchestrator", "flight", "hotel", "attraction", "dining"];
        address[5] memory recipients = [
            vm.envAddress("ORCHESTRATOR_ADDRESS"),
            vm.envAddress("FLIGHT_AGENT_ADDRESS"),
            vm.envAddress("HOTEL_AGENT_ADDRESS"),
            vm.envAddress("ATTRACTION_AGENT_ADDRESS"),
            vm.envAddress("DINING_AGENT_ADDRESS")
        ];

        console2.log("funder         ", funder);
        console2.log("target balance ", target);

        uint256 available = funder.balance;

        // 必须显式指定私钥：否则 forge 会用默认测试地址 0x1804c8AB... 当发送者
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        for (uint256 i; i < recipients.length; ++i) {
            address to = recipients[i];
            uint256 balance = to.balance;

            if (balance >= target) {
                console2.log("skip", names[i], to, balance);
                continue;
            }

            uint256 amount = target - balance;
            if (amount + GAS_RESERVE > available) {
                revert InsufficientFunderBalance(funder, available, amount + GAS_RESERVE);
            }

            _send(to, amount);
            available -= amount + GAS_RESERVE;
            console2.log("fund ", names[i], to, amount);
        }

        vm.stopBroadcast();
    }

    function _send(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "fund failed");
    }
}
