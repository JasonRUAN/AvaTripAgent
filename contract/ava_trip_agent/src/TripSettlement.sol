// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title TripSettlement
/// @notice 旅行订单的资金托管与分账。
///
/// 流程：
///   1. 用户 approve 本合约后调用 `createOrder`，tUSDC 进入托管，订单状态 Funded
///   2. Orchestrator 逐项调用 `settle`，每一笔都是一笔独立可查的 Fuji 交易
///   3. 全部分账完成后订单状态 Settled，并发出 OrderSettled
///   4. 尚未分账时用户可 `cancel` 取回全额
///
/// 分账刻意拆成 N 笔：演示时能在 Explorer 上一笔笔看到「Agent 给 Agent 付款」。
contract TripSettlement {
    enum OrderStatus {
        None,
        Funded,
        Settled,
        Cancelled
    }

    struct LineItem {
        /// 服务商 Agent 地址，必须是已注册且激活的 Agent
        address provider;
        /// 6 位小数 tUSDC 最小单位
        uint256 amount;
        /// 0 机票 / 1 酒店 / 2 门票 / 3 餐饮
        uint8 category;
        /// 报价明细 hash（航班号 / 酒店名 / 日期…）
        bytes32 itemHash;
    }

    struct Order {
        address traveler;
        uint256 total;
        uint256 settled;
        bytes32 itineraryHash;
        uint256 tripId;
        OrderStatus status;
    }

    address public owner;
    /// Orchestrator（旅行总管）地址，唯一有权发起分账
    address public operator;

    IERC20 public immutable usdc;
    AgentRegistry public immutable registry;

    uint256 public nextOrderId = 1;

    mapping(uint256 => Order) private _orders;
    mapping(uint256 => LineItem[]) private _items;
    mapping(uint256 => mapping(uint256 => bool)) private _settled;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed traveler,
        uint256 total,
        bytes32 itineraryHash
    );
    event ProviderPaid(
        uint256 indexed orderId,
        uint256 indexed itemIndex,
        address indexed provider,
        uint256 amount
    );
    event OrderSettled(uint256 indexed orderId, uint256 total);
    event OrderCancelled(uint256 indexed orderId, address indexed traveler, uint256 refunded);

    error NotOwner();
    error NotOperator();
    error NotTraveler();
    error ZeroAmount();
    error EmptyItems();
    error InactiveProvider(address provider);
    error ProviderIsTraveler(address provider);
    error UnknownOrder(uint256 orderId);
    error OrderNotFunded(uint256 orderId);
    error OrderAlreadySettled(uint256 orderId);
    error ItemAlreadySettled(uint256 itemIndex);
    error ItemOutOfRange(uint256 itemIndex);
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address usdc_, address registry_, address operator_) {
        usdc = IERC20(usdc_);
        registry = AgentRegistry(registry_);
        operator = operator_;
        owner = msg.sender;
    }

    // ------------------------------------------------------------------ 管理

    function setOperator(address newOperator) external onlyOwner {
        operator = newOperator;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ------------------------------------------------------------------ 订单

    /// @notice 创建订单并把 total 从用户转入托管。
    /// @dev total 由 items 求和得出，因此不可能出现「总额与明细不一致」。
    function createOrder(
        uint256 tripId,
        bytes32 itineraryHash,
        LineItem[] calldata items
    ) external returns (uint256 orderId) {
        if (items.length == 0) revert EmptyItems();

        uint256 total;
        for (uint256 i; i < items.length; ++i) {
            LineItem calldata item = items[i];
            if (item.amount == 0) revert ZeroAmount();
            // 先判「用户给自己付款」：这种情况下 provider 必然未注册，
            // 报 ProviderIsTraveler 比 InactiveProvider 更贴近真实原因
            if (item.provider == msg.sender) {
                revert ProviderIsTraveler(item.provider);
            }
            if (!registry.isActiveAgent(item.provider)) {
                revert InactiveProvider(item.provider);
            }
            total += item.amount;
        }

        orderId = nextOrderId++;

        Order storage order = _orders[orderId];
        order.traveler = msg.sender;
        order.total = total;
        order.itineraryHash = itineraryHash;
        order.tripId = tripId;
        order.status = OrderStatus.Funded;

        for (uint256 i; i < items.length; ++i) {
            _items[orderId].push(items[i]);
        }

        if (!usdc.transferFrom(msg.sender, address(this), total)) {
            revert TransferFailed();
        }

        emit OrderCreated(orderId, msg.sender, total, itineraryHash);
    }

    /// @notice Orchestrator 按明细索引分账，可一次一项（演示默认）或一次多项。
    function settle(uint256 orderId, uint256[] calldata itemIndexes) external {
        if (msg.sender != operator) revert NotOperator();

        Order storage order = _orders[orderId];
        if (order.traveler == address(0)) revert UnknownOrder(orderId);
        if (order.status != OrderStatus.Funded) revert OrderNotFunded(orderId);

        for (uint256 k; k < itemIndexes.length; ++k) {
            uint256 index = itemIndexes[k];
            if (index >= _items[orderId].length) revert ItemOutOfRange(index);
            if (_settled[orderId][index]) revert ItemAlreadySettled(index);

            LineItem storage item = _items[orderId][index];
            if (!registry.isActiveAgent(item.provider)) {
                revert InactiveProvider(item.provider);
            }

            _settled[orderId][index] = true;
            order.settled += item.amount;

            if (!usdc.transfer(item.provider, item.amount)) revert TransferFailed();

            emit ProviderPaid(orderId, index, item.provider, item.amount);
        }

        if (order.settled == order.total) {
            order.status = OrderStatus.Settled;
            emit OrderSettled(orderId, order.total);
        }
    }

    /// @notice 尚未分账时用户可取消订单，取回全额托管资金。
    function cancel(uint256 orderId) external {
        Order storage order = _orders[orderId];
        if (order.traveler == address(0)) revert UnknownOrder(orderId);
        if (order.traveler != msg.sender) revert NotTraveler();
        if (order.status != OrderStatus.Funded) revert OrderNotFunded(orderId);
        if (order.settled != 0) revert OrderAlreadySettled(orderId);

        uint256 refunded = order.total;
        order.status = OrderStatus.Cancelled;
        order.total = 0;

        if (!usdc.transfer(msg.sender, refunded)) revert TransferFailed();

        emit OrderCancelled(orderId, msg.sender, refunded);
    }

    // ------------------------------------------------------------------ 读取

    function getOrder(uint256 orderId) external view returns (Order memory) {
        return _orders[orderId];
    }

    function getItems(uint256 orderId) external view returns (LineItem[] memory) {
        return _items[orderId];
    }

    function isItemSettled(uint256 orderId, uint256 index) external view returns (bool) {
        return _settled[orderId][index];
    }

    function itemCount(uint256 orderId) external view returns (uint256) {
        return _items[orderId].length;
    }
}
