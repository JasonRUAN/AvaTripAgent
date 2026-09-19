// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TripSettlement} from "../src/TripSettlement.sol";
import {TravelVoucher} from "../src/TravelVoucher.sol";

contract AvaTripTest is Test {
    MockUSDC usdc;
    AgentRegistry registry;
    TripSettlement settlement;
    TravelVoucher voucher;

    address owner = address(this);
    address orchestrator = makeAddr("orchestrator");
    address flightAgent = makeAddr("flightAgent");
    address hotelAgent = makeAddr("hotelAgent");
    address attractionAgent = makeAddr("attractionAgent");
    address diningAgent = makeAddr("diningAgent");
    address traveler = makeAddr("traveler");

    function setUp() public {
        usdc = new MockUSDC();
        registry = new AgentRegistry();
        voucher = new TravelVoucher(address(registry));
        settlement = new TripSettlement(address(usdc), address(registry), orchestrator);

        registry.registerAgent(flightAgent, "AvaFlights Agent", AgentRegistry.AgentCategory.Flight, "flight");
        registry.registerAgent(hotelAgent, "AvaStays Agent", AgentRegistry.AgentCategory.Hotel, "hotel");
        registry.registerAgent(
            attractionAgent, "AvaTickets Agent", AgentRegistry.AgentCategory.Attraction, "attraction"
        );
        registry.registerAgent(diningAgent, "AvaTables Agent", AgentRegistry.AgentCategory.Dining, "dining");

        vm.prank(traveler);
        usdc.faucet();
    }

    function _lineItems() internal view returns (TripSettlement.LineItem[] memory items) {
        items = new TripSettlement.LineItem[](3);
        items[0] = TripSettlement.LineItem(flightAgent, 4760e6, 0, keccak256("flight"));
        items[1] = TripSettlement.LineItem(hotelAgent, 672e6, 1, keccak256("hotel"));
        items[2] = TripSettlement.LineItem(attractionAgent, 320e6, 2, keccak256("attraction"));
    }

    function _createOrder() internal returns (uint256 orderId) {
        TripSettlement.LineItem[] memory items = _lineItems();

        uint256 total;
        for (uint256 i; i < items.length; ++i) {
            total += items[i].amount;
        }

        vm.startPrank(traveler);
        usdc.approve(address(settlement), total);
        orderId = settlement.createOrder(1, keccak256("itinerary"), items);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ 注册表

    function test_RegistryRegistersAgents() public view {
        assertTrue(registry.isActiveAgent(flightAgent));
        assertFalse(registry.isActiveAgent(traveler));
        assertEq(registry.agentCount(), 4);

        AgentRegistry.AgentInfo memory info = registry.getAgent(hotelAgent);
        assertEq(info.name, "AvaStays Agent");
        assertTrue(info.active);
    }

    function test_RegistryOnlyOwnerCanRegister() public {
        vm.prank(traveler);
        vm.expectRevert(AgentRegistry.NotOwner.selector);
        registry.registerAgent(traveler, "Rogue", AgentRegistry.AgentCategory.Flight, "x");
    }

    function test_RegistryCanDeactivate() public {
        registry.setActive(hotelAgent, false);
        assertFalse(registry.isActiveAgent(hotelAgent));
    }

    // ------------------------------------------------------------------ 托管与分账

    function test_CreateOrderEscrowsFunds() public {
        uint256 orderId = _createOrder();

        TripSettlement.Order memory order = settlement.getOrder(orderId);
        assertEq(order.traveler, traveler);
        assertEq(order.total, 5752e6);
        assertEq(uint8(order.status), uint8(TripSettlement.OrderStatus.Funded));

        assertEq(usdc.balanceOf(address(settlement)), 5752e6);
        assertEq(usdc.balanceOf(traveler), 10_000e6 - 5752e6);
    }

    function test_CreateOrderRejectsInactiveProvider() public {
        registry.setActive(hotelAgent, false);
        TripSettlement.LineItem[] memory items = _lineItems();

        vm.startPrank(traveler);
        usdc.approve(address(settlement), 5752e6);
        vm.expectRevert(abi.encodeWithSelector(TripSettlement.InactiveProvider.selector, hotelAgent));
        settlement.createOrder(1, keccak256("itinerary"), items);
        vm.stopPrank();
    }

    function test_CreateOrderRejectsProviderEqualToTraveler() public {
        TripSettlement.LineItem[] memory items = new TripSettlement.LineItem[](1);
        items[0] = TripSettlement.LineItem(traveler, 100e6, 0, keccak256("self"));

        vm.startPrank(traveler);
        usdc.approve(address(settlement), 100e6);
        vm.expectRevert(abi.encodeWithSelector(TripSettlement.ProviderIsTraveler.selector, traveler));
        settlement.createOrder(1, keccak256("itinerary"), items);
        vm.stopPrank();
    }

    function test_SettlePaysEachProvider() public {
        uint256 orderId = _createOrder();

        // 演示里是一笔一项，每笔都是独立交易
        vm.prank(orchestrator);
        settlement.settle(orderId, _single(0));

        assertEq(usdc.balanceOf(flightAgent), 4760e6);

        vm.prank(orchestrator);
        settlement.settle(orderId, _single(1));

        vm.prank(orchestrator);
        settlement.settle(orderId, _single(2));

        assertEq(usdc.balanceOf(hotelAgent), 672e6);
        assertEq(usdc.balanceOf(attractionAgent), 320e6);
        assertEq(usdc.balanceOf(address(settlement)), 0);

        TripSettlement.Order memory order = settlement.getOrder(orderId);
        assertEq(order.settled, 5752e6);
        assertEq(uint8(order.status), uint8(TripSettlement.OrderStatus.Settled));
    }

    function test_SettleEmitsProviderPaid() public {
        uint256 orderId = _createOrder();

        vm.prank(orchestrator);
        vm.expectEmit(true, true, true, true);
        emit TripSettlement.ProviderPaid(orderId, 0, flightAgent, 4760e6);
        settlement.settle(orderId, _single(0));
    }

    function test_SettleOnlyOperator() public {
        uint256 orderId = _createOrder();

        vm.prank(traveler);
        vm.expectRevert(TripSettlement.NotOperator.selector);
        settlement.settle(orderId, _single(0));
    }

    function test_SettleRejectsDuplicateItem() public {
        uint256 orderId = _createOrder();

        vm.startPrank(orchestrator);
        settlement.settle(orderId, _single(0));
        vm.expectRevert(abi.encodeWithSelector(TripSettlement.ItemAlreadySettled.selector, 0));
        settlement.settle(orderId, _single(0));
        vm.stopPrank();
    }

    function test_CancelRefundsBeforeSettlement() public {
        uint256 orderId = _createOrder();
        uint256 before = usdc.balanceOf(traveler);

        vm.prank(traveler);
        settlement.cancel(orderId);

        assertEq(usdc.balanceOf(traveler), before + 5752e6);
        TripSettlement.Order memory order = settlement.getOrder(orderId);
        assertEq(uint8(order.status), uint8(TripSettlement.OrderStatus.Cancelled));
    }

    function test_CancelRejectedAfterPartialSettlement() public {
        uint256 orderId = _createOrder();

        vm.prank(orchestrator);
        settlement.settle(orderId, _single(0));

        vm.prank(traveler);
        vm.expectRevert(abi.encodeWithSelector(TripSettlement.OrderAlreadySettled.selector, orderId));
        settlement.cancel(orderId);
    }

    // ------------------------------------------------------------------ 凭证

    function test_IssueVoucherMintsToHolder() public {
        uint256 orderId = _createOrder();

        vm.prank(flightAgent);
        uint256 tokenId = voucher.issueVoucher(
            traveler,
            orderId,
            0,
            "PNR 7KQ2ZP",
            unicode"NH959 上海浦东 → 东京羽田",
            keccak256("meta"),
            uint64(block.timestamp),
            uint64(block.timestamp + 30 days)
        );

        assertEq(voucher.ownerOf(tokenId), traveler);
        assertTrue(voucher.isValid(tokenId));

        TravelVoucher.Voucher memory v = voucher.getVoucher(tokenId);
        assertEq(v.provider, flightAgent);
        assertEq(v.code, "PNR 7KQ2ZP");
        assertEq(v.orderId, orderId);
    }

    function test_IssueVoucherOnlyRegisteredAgent() public {
        vm.prank(traveler);
        vm.expectRevert(
            abi.encodeWithSelector(TravelVoucher.NotRegisteredAgent.selector, traveler)
        );
        voucher.issueVoucher(traveler, 1, 0, "X", "Y", bytes32(0), 0, 0);
    }

    function test_RedeemOnlyByProviderAndOnlyOnce() public {
        uint256 orderId = _createOrder();

        vm.prank(flightAgent);
        uint256 tokenId = voucher.issueVoucher(
            traveler, orderId, 0, "PNR 7KQ2ZP", "NH959", keccak256("meta"), 0, 0
        );

        vm.prank(hotelAgent);
        vm.expectRevert(abi.encodeWithSelector(TravelVoucher.NotProvider.selector, tokenId));
        voucher.redeem(tokenId);

        vm.prank(flightAgent);
        voucher.redeem(tokenId);

        assertFalse(voucher.isValid(tokenId));
        assertEq(uint8(voucher.getVoucher(tokenId).status), uint8(TravelVoucher.VoucherStatus.Redeemed));

        vm.prank(flightAgent);
        vm.expectRevert(abi.encodeWithSelector(TravelVoucher.VoucherNotIssued.selector, tokenId));
        voucher.redeem(tokenId);
    }

    function test_VoidMarksVoucherVoided() public {
        uint256 orderId = _createOrder();

        vm.prank(hotelAgent);
        uint256 tokenId = voucher.issueVoucher(
            traveler, orderId, 1, "CONF HX-88213", unicode"新宿格拉斯丽酒店", keccak256("meta"), 0, 0
        );

        vm.prank(hotelAgent);
        voucher.void(tokenId);

        assertEq(uint8(voucher.getVoucher(tokenId).status), uint8(TravelVoucher.VoucherStatus.Voided));
        assertFalse(voucher.isValid(tokenId));
    }

    function test_VoucherIsExpiredOutsideWindow() public {
        uint256 orderId = _createOrder();

        vm.prank(attractionAgent);
        uint256 tokenId = voucher.issueVoucher(
            traveler,
            orderId,
            2,
            "TCK-9021",
            "teamLab Planets",
            keccak256("meta"),
            uint64(block.timestamp + 10 days),
            uint64(block.timestamp + 20 days)
        );

        // 有效期尚未开始
        assertFalse(voucher.isValid(tokenId));
    }

    // ------------------------------------------------------------------ 端到端

    function test_EndToEndFlow() public {
        uint256 orderId = _createOrder();

        uint256[] memory all = new uint256[](3);
        all[0] = 0;
        all[1] = 1;
        all[2] = 2;

        vm.prank(orchestrator);
        settlement.settle(orderId, all);

        // 各服务商收到款后立刻发券
        vm.prank(flightAgent);
        uint256 flightToken = voucher.issueVoucher(
            traveler, orderId, 0, "PNR 7KQ2ZP", "NH959", keccak256("f"), 0, 0
        );
        vm.prank(hotelAgent);
        uint256 hotelToken = voucher.issueVoucher(
            traveler, orderId, 1, "CONF HX-88213", unicode"新宿格拉斯丽酒店", keccak256("h"), 0, 0
        );
        vm.prank(attractionAgent);
        uint256 attractionToken = voucher.issueVoucher(
            traveler, orderId, 2, "TCK-9021", "teamLab Planets", keccak256("a"), 0, 0
        );

        assertEq(voucher.ownerOf(flightToken), traveler);
        assertEq(voucher.ownerOf(hotelToken), traveler);
        assertEq(voucher.ownerOf(attractionToken), traveler);

        // 商户核销
        vm.prank(attractionAgent);
        voucher.redeem(attractionToken);
        assertFalse(voucher.isValid(attractionToken));
        assertTrue(voucher.isValid(flightToken));
    }

    // ------------------------------------------------------------------ 辅助

    function _single(uint256 index) internal pure returns (uint256[] memory indexes) {
        indexes = new uint256[](1);
        indexes[0] = index;
    }
}
