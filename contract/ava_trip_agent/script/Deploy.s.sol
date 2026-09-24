// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TripSettlement} from "../src/TripSettlement.sol";
import {TravelVoucher} from "../src/TravelVoucher.sol";
import {AgentReview} from "../src/AgentReview.sol";
import {EtherAmount} from "./EtherAmount.sol";

/// @title Deploy
/// @notice 部署 5 个合约；可选给 5 个 Agent 地址打 AVAX；把地址快照写入 deployments/fuji.json。
///         服务商登记（含 HTTP endpoint）不在这里做：上线后走前端 `/admin`，测试期用
///         `./register-demo-agents.sh` 一次录入 4 家。
///
/// 用法（Fuji）：
///   export PRIVATE_KEY=0x...
///   export ORCHESTRATOR_ADDRESS=0x...
///   export FLIGHT_AGENT_ADDRESS=0x...
///   export HOTEL_AGENT_ADDRESS=0x...
///   export ATTRACTION_AGENT_ADDRESS=0x...
///   export DINING_AGENT_ADDRESS=0x...
///   export VOUCHER_BASE_URI=https://<host>/api/vouchers/
///   forge script script/Deploy.s.sol:Deploy --rpc-url fuji --broadcast
///
/// `FUND_AGENT_AVAX`（单位 ether，可选）> 0 时，会给 5 个 Agent 地址各转一笔 AVAX 作为 gas。
contract Deploy is Script {
    /// @dev 打包成结构体而不是散落的局部变量，否则 run() 会触发 "Stack too deep"
    struct Config {
        address orchestrator;
        address flightAgent;
        address hotelAgent;
        address attractionAgent;
        address diningAgent;
        string baseURI;
        uint256 fundWei;
    }

    struct Deployment {
        address usdc;
        address registry;
        address settlement;
        address voucher;
        address reviews;
    }

    function run() external {
        Config memory cfg = _loadConfig();

        // 必须显式指定私钥：否则 forge 会用默认测试地址 0x1804c8AB... 当发送者，
        // 导致链上模拟以 lack of funds 失败、交易一笔都发不出去
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        Deployment memory out = _deployAll(cfg);
        vm.stopBroadcast();

        console2.log("MockUSDC       ", out.usdc);
        console2.log("AgentRegistry  ", out.registry);
        console2.log("TripSettlement ", out.settlement);
        console2.log("TravelVoucher  ", out.voucher);
        console2.log("AgentReview    ", out.reviews);

        _writeDeployment(out, cfg);
    }

    function _loadConfig() internal view returns (Config memory cfg) {
        cfg.orchestrator = vm.envAddress("ORCHESTRATOR_ADDRESS");
        cfg.flightAgent = vm.envAddress("FLIGHT_AGENT_ADDRESS");
        cfg.hotelAgent = vm.envAddress("HOTEL_AGENT_ADDRESS");
        cfg.attractionAgent = vm.envAddress("ATTRACTION_AGENT_ADDRESS");
        cfg.diningAgent = vm.envAddress("DINING_AGENT_ADDRESS");
        cfg.baseURI = vm.envOr("VOUCHER_BASE_URI", string(""));
        // 注意：不能用 vm.envOr(name, uint256) 读小数，0.15 会被截断成 0
        cfg.fundWei = EtherAmount.toWei(vm.envOr("FUND_AGENT_AVAX", string("0")));
    }

    function _deployAll(Config memory cfg) internal returns (Deployment memory out) {
        MockUSDC usdc = new MockUSDC();
        AgentRegistry registry = new AgentRegistry();
        TravelVoucher voucher = new TravelVoucher(address(registry));
        TripSettlement settlement = new TripSettlement(
            address(usdc),
            address(registry),
            cfg.orchestrator
        );
        AgentReview reviews = new AgentReview(address(voucher));

        out = Deployment({
            usdc: address(usdc),
            registry: address(registry),
            settlement: address(settlement),
            voucher: address(voucher),
            reviews: address(reviews)
        });

        if (bytes(cfg.baseURI).length > 0) {
            voucher.setBaseURI(cfg.baseURI);
        }

        // 5 个 Agent 地址各需要少量 AVAX 才能发交易（settle / issueVoucher / redeem）
        if (cfg.fundWei > 0) {
            _fund(cfg.orchestrator, cfg.fundWei);
            _fund(cfg.flightAgent, cfg.fundWei);
            _fund(cfg.hotelAgent, cfg.fundWei);
            _fund(cfg.attractionAgent, cfg.fundWei);
            _fund(cfg.diningAgent, cfg.fundWei);
        }
    }

    function _fund(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "fund failed");
    }

    function _writeDeployment(Deployment memory out, Config memory cfg) internal {
        string memory json = "deployment";

        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "usdc", out.usdc);
        vm.serializeAddress(json, "agentRegistry", out.registry);
        vm.serializeAddress(json, "tripSettlement", out.settlement);
        vm.serializeAddress(json, "travelVoucher", out.voucher);
        vm.serializeAddress(json, "agentReview", out.reviews);
        vm.serializeAddress(json, "orchestrator", cfg.orchestrator);
        // 前端用它判断是否切出「演示模式」，缺失会导致部署后仍走模拟流程
        vm.serializeBool(json, "deployed", true);

        string memory agents = "agents";
        vm.serializeAddress(agents, "flight", cfg.flightAgent);
        vm.serializeAddress(agents, "hotel", cfg.hotelAgent);
        vm.serializeAddress(agents, "attraction", cfg.attractionAgent);
        string memory agentsJson = vm.serializeAddress(agents, "dining", cfg.diningAgent);

        string memory finalJson = vm.serializeString(json, "agents", agentsJson);

        // 默认只写仓库根 deployments/fuji.json；前端/后端副本由 scripts/sync-fuji-deployment.sh 同步
        // 可用 DEPLOYMENT_OUT 覆盖做本地验证
        string memory outPath = vm.envOr(
            "DEPLOYMENT_OUT",
            string("../../deployments/fuji.json")
        );
        vm.writeJson(finalJson, outPath);
        console2.log("Deployment json", outPath);
    }
}
