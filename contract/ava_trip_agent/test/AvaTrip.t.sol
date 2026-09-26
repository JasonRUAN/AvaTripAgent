// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {TripSettlement} from "../src/TripSettlement.sol";
import {TravelVoucher} from "../src/TravelVoucher.sol";
import {AgentReview} from "../src/AgentReview.sol";

contract AvaTripTest is Test {
    MockUSDC usdc;
    AgentRegistry registry;
    TripSettlement settlement;
    TravelVoucher voucher;
    AgentReview reviews;

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
        reviews = new AgentReview(address(voucher));
        settlement = new TripSettlement(address(usdc), address(registry), orchestrator);

        registry.registerAgent(
            flightAgent,
            "AvaFlights Agent",
            _mask(AgentRegistry.AgentCategory.Flight),
            "http://127.0.0.1:3011",
            unicode"Avalanche 上的机票询价 Agent，覆盖亚太主要航线。",
            "https://avaflights.example"
        );
        registry.registerAgent(
            hotelAgent,
            "AvaStays Agent",
            _mask(AgentRegistry.AgentCategory.Hotel),
            "http://127.0.0.1:3012",
            unicode"精选酒店与民宿，按区域与星级即时报价。",
            "https://avastays.example"
        );
        registry.registerAgent(
            attractionAgent,
            "AvaTickets Agent",
            _mask(AgentRegistry.AgentCategory.Attraction),
            "http://127.0.0.1:3013",
            unicode"景点门票与体验活动预订。",
            "https://avatickets.example"
        );
        registry.registerAgent(
            diningAgent,
            "AvaTables Agent",
            _mask(AgentRegistry.AgentCategory.Dining),
            "http://127.0.0.1:3014",
            unicode"本地餐厅与特色料理预订。",
            "https://avatables.example"
        );

        vm.prank(traveler);
        usdc.faucet();
    }

    function _mask(AgentRegistry.AgentCategory category) internal pure returns (uint8) {
        return uint8(1) << uint8(category);
    }

    function _contains(address[] memory listed, address agent) internal pure returns (bool) {
        for (uint256 i; i < listed.length; ++i) {
            if (listed[i] == agent) return true;
        }
        return false;
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
        assertEq(info.description, unicode"精选酒店与民宿，按区域与星级即时报价。");
        assertEq(info.website, "https://avastays.example");
    }

    function test_RegistryOnlyOwnerCanRegister() public {
        vm.prank(traveler);
        vm.expectRevert(AgentRegistry.NotOwner.selector);
        registry.registerAgent(traveler, "Rogue", _mask(AgentRegistry.AgentCategory.Flight), "x", "", "");
    }

    function test_RegistryCanDeactivate() public {
        registry.setActive(hotelAgent, false);
        assertFalse(registry.isActiveAgent(hotelAgent));
        address[] memory activeHotels = registry.getAgentsByCategoryActive(AgentRegistry.AgentCategory.Hotel);
        assertEq(activeHotels.length, 0);
    }

    function test_RegistryListsByCategory() public view {
        address[] memory flights = registry.getAgentsByCategory(AgentRegistry.AgentCategory.Flight);
        assertEq(flights.length, 1);
        assertEq(flights[0], flightAgent);
        address[] memory hotels = registry.getAgentsByCategoryActive(AgentRegistry.AgentCategory.Hotel);
        assertEq(hotels.length, 1);
        assertEq(hotels[0], hotelAgent);
    }

    function test_RegistryReregisterMovesCategory() public {
        registry.registerAgent(
            flightAgent, "Now Hotel", _mask(AgentRegistry.AgentCategory.Hotel), "http://127.0.0.1:3099", unicode"改挂酒店", "https://nowhotel.example"
        );
        address[] memory flights = registry.getAgentsByCategory(AgentRegistry.AgentCategory.Flight);
        address[] memory hotels = registry.getAgentsByCategory(AgentRegistry.AgentCategory.Hotel);
        assertEq(flights.length, 0);
        assertEq(hotels.length, 2);
        AgentRegistry.AgentInfo memory info = registry.getAgent(flightAgent);
        assertEq(uint8(info.category), uint8(AgentRegistry.AgentCategory.Hotel));
        assertEq(registry.getCategoryMask(flightAgent), _mask(AgentRegistry.AgentCategory.Hotel));
        assertEq(info.endpoint, "http://127.0.0.1:3099");
        assertEq(info.description, unicode"改挂酒店");
        assertEq(info.website, "https://nowhotel.example");
    }

    function test_RegistryMultiCategoryIndexedEverywhere() public {
        uint8 omni = 15;
        registry.registerAgent(flightAgent, "AvaOmni Agent", omni, "http://127.0.0.1:3088", unicode"综合服务商", "");
        assertEq(registry.getCategoryMask(flightAgent), omni);
        AgentRegistry.AgentInfo memory info = registry.getAgent(flightAgent);
        assertEq(uint8(info.category), uint8(AgentRegistry.AgentCategory.Flight));
        assertTrue(_contains(registry.getAgentsByCategory(AgentRegistry.AgentCategory.Flight), flightAgent));
        assertTrue(_contains(registry.getAgentsByCategory(AgentRegistry.AgentCategory.Hotel), flightAgent));
        assertTrue(_contains(registry.getAgentsByCategory(AgentRegistry.AgentCategory.Attraction), flightAgent));
        assertTrue(_contains(registry.getAgentsByCategory(AgentRegistry.AgentCategory.Dining), flightAgent));
        assertEq(registry.getAgentsByCategory(AgentRegistry.AgentCategory.Flight).length, 1);
        assertEq(registry.getAgentsByCategory(AgentRegistry.AgentCategory.Hotel).length, 2);
    }

    function test_RegistryRejectsEmptyMask() public {
        vm.expectRevert(AgentRegistry.EmptyCategories.selector);
        registry.registerAgent(makeAddr("empty"), "None", 0, "http://x", "", "");
    }

    function test_RegistryStoresDescriptionAndWebsite() public {
        address extra = makeAddr("extra");
        registry.registerAgent(
            extra,
            "AvaExtra Agent",
            _mask(AgentRegistry.AgentCategory.Dining),
            "http://127.0.0.1:3090",
            unicode"第一版简介",
            "https://extra.example"
        );
        AgentRegistry.AgentInfo memory first = registry.getAgent(extra);
        assertEq(first.description, unicode"第一版简介");
        assertEq(first.website, "https://extra.example");

        registry.registerAgent(
            extra,
            "AvaExtra Agent",
            _mask(AgentRegistry.AgentCategory.Dining),
            "http://127.0.0.1:3090",
            unicode"覆盖后的简介",
            ""
        );
        AgentRegistry.AgentInfo memory second = registry.getAgent(extra);
        assertEq(second.description, unicode"覆盖后的简介");
        assertEq(second.website, "");
    }

    // ------------------------------------------------------------------ 托管与分账

    function test_CreateOrderEscrowsFunds() public {
        uint256 orderId = _createOrder();

        TripSettlement.Order memory order = settlement.getOrder(orderId);
        assertEq(order.traveler, traveler);
        assertEq(order.total, 5752e6);
        assertEq(uint8(order.status), uint8(TripSettlement.OrderStatus.Funded));

        assertEq(usdc.balanceOf(address(settlement)), 5752e6);
        assertEq(usdc.balanceOf(traveler), 1_000_000e6 - 5752e6);
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

    // ------------------------------------------------------------------ 评价

    function _issueAndRedeemFlight() internal returns (uint256 tokenId) {
        uint256 orderId = _createOrder();
        vm.prank(flightAgent);
        tokenId = voucher.issueVoucher(traveler, orderId, 0, "PNR 7KQ2ZP", "NH959", keccak256("f"), 0, 0);
        vm.prank(flightAgent);
        voucher.redeem(tokenId);
    }

    function test_ReviewAfterRedeem() public {
        uint256 tokenId = _issueAndRedeemFlight();

        vm.prank(traveler);
        reviews.submitReview(tokenId, 5, unicode"准点舒适");

        (uint256 sum, uint256 count, uint256 avgX100) = reviews.getScore(flightAgent);
        assertEq(sum, 5);
        assertEq(count, 1);
        assertEq(avgX100, 500);
        assertTrue(reviews.hasReview(tokenId));
        AgentReview.Review memory r = reviews.getReview(tokenId);
        assertEq(r.score, 5);
        assertEq(r.reviewer, traveler);
        assertEq(r.provider, flightAgent);
    }

    function test_ReviewRejectsBeforeRedeem() public {
        uint256 orderId = _createOrder();
        vm.prank(flightAgent);
        uint256 tokenId = voucher.issueVoucher(traveler, orderId, 0, "PNR", "NH959", keccak256("f"), 0, 0);

        vm.prank(traveler);
        vm.expectRevert(AgentReview.VoucherNotRedeemed.selector);
        reviews.submitReview(tokenId, 5, "great");
    }

    function test_ReviewOnlyHolder() public {
        uint256 tokenId = _issueAndRedeemFlight();

        vm.prank(orchestrator);
        vm.expectRevert(AgentReview.NotHolder.selector);
        reviews.submitReview(tokenId, 4, "nope");
    }

    function test_ReviewRejectsDuplicateAndBadScore() public {
        uint256 tokenId = _issueAndRedeemFlight();

        vm.startPrank(traveler);
        vm.expectRevert(AgentReview.InvalidScore.selector);
        reviews.submitReview(tokenId, 0, "x");
        reviews.submitReview(tokenId, 4, "ok");
        vm.expectRevert(abi.encodeWithSelector(AgentReview.AlreadyReviewed.selector, tokenId));
        reviews.submitReview(tokenId, 5, "again");
        vm.stopPrank();
    }

    function test_ReviewAverageAcrossTwoTokens() public {
        uint256 tokenId1 = _issueAndRedeemFlight();
        uint256 orderId2 = _createOrder();
        vm.prank(flightAgent);
        uint256 tokenId2 = voucher.issueVoucher(traveler, orderId2, 0, "PNR2", "NH960", keccak256("f2"), 0, 0);
        vm.prank(flightAgent);
        voucher.redeem(tokenId2);

        vm.startPrank(traveler);
        reviews.submitReview(tokenId1, 5, "a");
        reviews.submitReview(tokenId2, 3, "b");
        vm.stopPrank();

        (uint256 sum, uint256 count, uint256 avgX100) = reviews.getScore(flightAgent);
        assertEq(sum, 8);
        assertEq(count, 2);
        assertEq(avgX100, 400);
        AgentReview.Review[] memory list = reviews.getReviewsByAgent(flightAgent);
        assertEq(list.length, 2);
    }

    // ------------------------------------------------------------------ 辅助

    function _single(uint256 index) internal pure returns (uint256[] memory indexes) {
        indexes = new uint256[](1);
        indexes[0] = index;
    }
}
