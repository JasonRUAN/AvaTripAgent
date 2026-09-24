// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

/// @title RegisterDemoAgents
/// @notice 一次把 4 家演示服务商写进已部署的 AgentRegistry（含 HTTP endpoint / 简介 / 官网）。
///         正式录入走前端 `/admin`；本脚本只方便测试期快速灌数据。
///
/// 用法：
///   export PRIVATE_KEY=0x...                    # registry owner
///   export AGENT_REGISTRY=0x...                 # 可省略，默认读 deployments/fuji.json
///   export FLIGHT_AGENT_ADDRESS=0x...
///   export HOTEL_AGENT_ADDRESS=0x...
///   export ATTRACTION_AGENT_ADDRESS=0x...
///   export DINING_AGENT_ADDRESS=0x...
///   export FLIGHT_AGENT_ENDPOINT=http://127.0.0.1:3011
///   export HOTEL_AGENT_ENDPOINT=http://127.0.0.1:3012
///   export ATTRACTION_AGENT_ENDPOINT=http://127.0.0.1:3013
///   export DINING_AGENT_ENDPOINT=http://127.0.0.1:3014
///   forge script script/RegisterDemoAgents.s.sol:RegisterDemoAgents --rpc-url fuji --broadcast
contract RegisterDemoAgents is Script {
    struct Agents {
        address flight;
        address hotel;
        address attraction;
        address dining;
        string flightEndpoint;
        string hotelEndpoint;
        string attractionEndpoint;
        string diningEndpoint;
    }

    function run() external {
        address registryAddr = _registry();
        Agents memory a = _loadAgents();

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        AgentRegistry registry = AgentRegistry(registryAddr);
        registry.registerAgent(
            a.flight,
            "AvaFlights Agent",
            _mask(AgentRegistry.AgentCategory.Flight),
            a.flightEndpoint,
            unicode"Avalanche 上的机票询价 Agent，覆盖亚太主要航线实时舱位与价格。",
            "https://avaflights.example"
        );
        registry.registerAgent(
            a.hotel,
            "AvaStays Agent",
            _mask(AgentRegistry.AgentCategory.Hotel),
            a.hotelEndpoint,
            unicode"精选酒店与民宿，按区域、星级与入住日期即时报价。",
            "https://avastays.example"
        );
        registry.registerAgent(
            a.attraction,
            "AvaTickets Agent",
            _mask(AgentRegistry.AgentCategory.Attraction),
            a.attractionEndpoint,
            unicode"景点门票与体验活动预订，支持当日与预售场次。",
            "https://avatickets.example"
        );
        registry.registerAgent(
            a.dining,
            "AvaTables Agent",
            _mask(AgentRegistry.AgentCategory.Dining),
            a.diningEndpoint,
            unicode"本地餐厅与特色料理预订，按人数与时段匹配空位。",
            "https://avatables.example"
        );
        vm.stopBroadcast();

        console2.log("Registry   ", registryAddr);
        console2.log("Flight     ", a.flight, a.flightEndpoint);
        console2.log("Hotel      ", a.hotel, a.hotelEndpoint);
        console2.log("Attraction ", a.attraction, a.attractionEndpoint);
        console2.log("Dining     ", a.dining, a.diningEndpoint);
    }

    function _registry() internal view returns (address registry) {
        registry = vm.envOr("AGENT_REGISTRY", address(0));
        if (registry != address(0)) return registry;

        string memory path = vm.envOr("DEPLOYMENT_OUT", string("../../deployments/fuji.json"));
        registry = vm.parseJsonAddress(vm.readFile(path), ".agentRegistry");
        require(registry != address(0), "missing AGENT_REGISTRY");
    }

    function _loadAgents() internal view returns (Agents memory a) {
        a.flight = vm.envAddress("FLIGHT_AGENT_ADDRESS");
        a.hotel = vm.envAddress("HOTEL_AGENT_ADDRESS");
        a.attraction = vm.envAddress("ATTRACTION_AGENT_ADDRESS");
        a.dining = vm.envAddress("DINING_AGENT_ADDRESS");
        a.flightEndpoint = vm.envOr("FLIGHT_AGENT_ENDPOINT", string("http://127.0.0.1:3011"));
        a.hotelEndpoint = vm.envOr("HOTEL_AGENT_ENDPOINT", string("http://127.0.0.1:3012"));
        a.attractionEndpoint = vm.envOr("ATTRACTION_AGENT_ENDPOINT", string("http://127.0.0.1:3013"));
        a.diningEndpoint = vm.envOr("DINING_AGENT_ENDPOINT", string("http://127.0.0.1:3014"));
    }

    function _mask(AgentRegistry.AgentCategory category) internal pure returns (uint8) {
        return uint8(1) << uint8(category);
    }
}
