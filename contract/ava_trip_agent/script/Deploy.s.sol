// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TripSettlement} from "../src/TripSettlement.sol";
import {TravelVoucher} from "../src/TravelVoucher.sol";

/// @title Deploy
/// @notice 部署 4 个合约 + 注册 4 个服务商 Agent，并把地址快照写入 deployments/fuji.json
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
    uint256 internal constant FUND_AMOUNT = 0.15 ether;

    function run() external {
        address orchestrator = vm.envAddress("ORCHESTRATOR_ADDRESS");
        address flightAgent = vm.envAddress("FLIGHT_AGENT_ADDRESS");
        address hotelAgent = vm.envAddress("HOTEL_AGENT_ADDRESS");
        address attractionAgent = vm.envAddress("ATTRACTION_AGENT_ADDRESS");
        address diningAgent = vm.envAddress("DINING_AGENT_ADDRESS");
        string memory baseURI = vm.envOr("VOUCHER_BASE_URI", string(""));
        uint256 fundEther = vm.envOr("FUND_AGENT_AVAX", uint256(0));

        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        AgentRegistry registry = new AgentRegistry();
        TravelVoucher voucher = new TravelVoucher(address(registry));
        TripSettlement settlement = new TripSettlement(
            address(usdc),
            address(registry),
            orchestrator
        );

        registry.registerAgent(flightAgent, "AvaFlights Agent", AgentRegistry.AgentCategory.Flight, "flight");
        registry.registerAgent(hotelAgent, "AvaStays Agent", AgentRegistry.AgentCategory.Hotel, "hotel");
        registry.registerAgent(
            attractionAgent,
            "AvaTickets Agent",
            AgentRegistry.AgentCategory.Attraction,
            "attraction"
        );
        registry.registerAgent(diningAgent, "AvaTables Agent", AgentRegistry.AgentCategory.Dining, "dining");

        if (bytes(baseURI).length > 0) {
            voucher.setBaseURI(baseURI);
        }

        // 5 个 Agent 地址各需要少量 AVAX 才能发交易（settle / issueVoucher / redeem）
        if (fundEther > 0) {
            _fund(orchestrator, fundEther * 1e18);
            _fund(flightAgent, fundEther * 1e18);
            _fund(hotelAgent, fundEther * 1e18);
            _fund(attractionAgent, fundEther * 1e18);
            _fund(diningAgent, fundEther * 1e18);
        }

        vm.stopBroadcast();

        console2.log("MockUSDC       ", address(usdc));
        console2.log("AgentRegistry  ", address(registry));
        console2.log("TripSettlement ", address(settlement));
        console2.log("TravelVoucher  ", address(voucher));

        _writeDeployment(
            address(usdc),
            address(registry),
            address(settlement),
            address(voucher),
            orchestrator,
            flightAgent,
            hotelAgent,
            attractionAgent,
            diningAgent
        );
    }

    function _fund(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "fund failed");
    }

    function _writeDeployment(
        address usdc,
        address registry,
        address settlement,
        address voucher,
        address orchestrator,
        address flightAgent,
        address hotelAgent,
        address attractionAgent,
        address diningAgent
    ) internal {
        string memory json = "deployment";

        vm.serializeUint(json, "chainId", block.chainid);
        vm.serializeAddress(json, "usdc", usdc);
        vm.serializeAddress(json, "agentRegistry", registry);
        vm.serializeAddress(json, "tripSettlement", settlement);
        vm.serializeAddress(json, "travelVoucher", voucher);
        vm.serializeAddress(json, "orchestrator", orchestrator);
        // 前端用它判断是否切出「演示模式」，缺失会导致部署后仍走模拟流程
        vm.serializeBool(json, "deployed", true);

        string memory agents = "agents";
        vm.serializeAddress(agents, "flight", flightAgent);
        vm.serializeAddress(agents, "hotel", hotelAgent);
        vm.serializeAddress(agents, "attraction", attractionAgent);
        string memory agentsJson = vm.serializeAddress(agents, "dining", diningAgent);

        string memory finalJson = vm.serializeString(json, "agents", agentsJson);
        vm.writeJson(finalJson, "../../deployments/fuji.json");
    }
}
