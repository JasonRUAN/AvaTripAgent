// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentRegistry
/// @notice 服务商 Agent 注册表。结算合约与凭证合约都用它校验「对方是不是已注册的 Agent」。
///         分类用 bitmask：bit0 机票 / bit1 酒店 / bit2 门票 / bit3 餐饮。综合型服务商可同时占用多 bit。
contract AgentRegistry {
    enum AgentCategory {
        Flight,
        Hotel,
        Attraction,
        Dining
    }

    uint8 public constant CATEGORY_BITS = 4;
    uint8 public constant ALL_CATEGORIES_MASK = 15; // 0b1111

    struct AgentInfo {
        string name;
        /// @dev 主分类：mask 中最低置位 bit，兼容旧 getAgent 读取方
        AgentCategory category;
        string endpoint;
        bool active;
        /// @dev 服务商简介，可留空
        string description;
        /// @dev 官网链接，可留空
        string website;
    }

    address public owner;

    mapping(address => AgentInfo) private _agents;
    mapping(address => uint8) private _categoryMask;
    mapping(address => bool) private _exists;
    address[] private _agentList;
    mapping(uint8 => address[]) private _byCategory;

    event AgentRegistered(
        address indexed agent,
        string name,
        uint8 categoryMask,
        string endpoint,
        string description,
        string website
    );
    event AgentStatusChanged(address indexed agent, bool active);

    error NotOwner();
    error ZeroAddress();
    error EmptyName();
    error EmptyCategories();
    error InvalidCategories();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ------------------------------------------------------------------ 写入

    /// @param categoryMask bit0=机票 bit1=酒店 bit2=门票 bit3=餐饮，须为 1–15
    /// @param description 服务商简介，可留空
    /// @param website 官网链接，可留空
    function registerAgent(
        address agent,
        string calldata name,
        uint8 categoryMask,
        string calldata endpoint,
        string calldata description,
        string calldata website
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();
        _assertMask(categoryMask);

        if (!_exists[agent]) {
            _exists[agent] = true;
            _agentList.push(agent);
        } else {
            _removeFromAllCategories(agent);
        }

        _addToCategories(agent, categoryMask);
        _categoryMask[agent] = categoryMask;

        _agents[agent] = AgentInfo({
            name: name,
            category: _primaryCategory(categoryMask),
            endpoint: endpoint,
            active: true,
            description: description,
            website: website
        });

        emit AgentRegistered(agent, name, categoryMask, endpoint, description, website);
    }

    function setActive(address agent, bool active) external onlyOwner {
        if (!_exists[agent]) revert ZeroAddress();
        _agents[agent].active = active;
        emit AgentStatusChanged(agent, active);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // ------------------------------------------------------------------ 读取

    function isActiveAgent(address agent) external view returns (bool) {
        return _exists[agent] && _agents[agent].active;
    }

    function getAgent(address agent) external view returns (AgentInfo memory) {
        return _agents[agent];
    }

    function getCategoryMask(address agent) external view returns (uint8) {
        return _categoryMask[agent];
    }

    function agentExists(address agent) external view returns (bool) {
        return _exists[agent];
    }

    function getAgents() external view returns (address[] memory) {
        return _agentList;
    }

    function agentCount() external view returns (uint256) {
        return _agentList.length;
    }

    function getAgentsByCategory(AgentCategory category) external view returns (address[] memory) {
        return _byCategory[uint8(category)];
    }

    function getAgentsByCategoryActive(AgentCategory category) external view returns (address[] memory) {
        address[] storage listed = _byCategory[uint8(category)];
        uint256 n;
        for (uint256 i; i < listed.length; ++i) {
            if (_agents[listed[i]].active) ++n;
        }
        address[] memory result = new address[](n);
        uint256 w;
        for (uint256 i; i < listed.length; ++i) {
            if (_agents[listed[i]].active) {
                result[w++] = listed[i];
            }
        }
        return result;
    }

    function _assertMask(uint8 mask) private pure {
        if (mask == 0) revert EmptyCategories();
        if (mask > ALL_CATEGORIES_MASK) revert InvalidCategories();
    }

    function _primaryCategory(uint8 mask) private pure returns (AgentCategory) {
        for (uint8 i; i < CATEGORY_BITS; ++i) {
            if (mask & (uint8(1) << i) != 0) {
                return AgentCategory(i);
            }
        }
        revert EmptyCategories();
    }

    function _addToCategories(address agent, uint8 mask) private {
        for (uint8 i; i < CATEGORY_BITS; ++i) {
            if (mask & (uint8(1) << i) != 0) {
                _byCategory[i].push(agent);
            }
        }
    }

    function _removeFromAllCategories(address agent) private {
        for (uint8 i; i < CATEGORY_BITS; ++i) {
            _removeFromCategory(i, agent);
        }
    }

    function _removeFromCategory(uint8 category, address agent) private {
        address[] storage listed = _byCategory[category];
        for (uint256 i; i < listed.length; ++i) {
            if (listed[i] == agent) {
                listed[i] = listed[listed.length - 1];
                listed.pop();
                return;
            }
        }
    }
}
