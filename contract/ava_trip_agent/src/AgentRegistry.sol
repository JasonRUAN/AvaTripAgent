// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title AgentRegistry
/// @notice 服务商 Agent 注册表。结算合约与凭证合约都用它校验「对方是不是已注册的 Agent」。
contract AgentRegistry {
    enum AgentCategory {
        Flight,
        Hotel,
        Attraction,
        Dining
    }

    struct AgentInfo {
        string name;
        AgentCategory category;
        string endpoint;
        bool active;
    }

    address public owner;

    mapping(address => AgentInfo) private _agents;
    mapping(address => bool) private _exists;
    address[] private _agentList;

    event AgentRegistered(
        address indexed agent,
        string name,
        AgentCategory category,
        string endpoint
    );
    event AgentStatusChanged(address indexed agent, bool active);

    error NotOwner();
    error ZeroAddress();
    error EmptyName();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ------------------------------------------------------------------ 写入

    function registerAgent(
        address agent,
        string calldata name,
        AgentCategory category,
        string calldata endpoint
    ) external onlyOwner {
        if (agent == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();

        if (!_exists[agent]) {
            _exists[agent] = true;
            _agentList.push(agent);
        }

        _agents[agent] = AgentInfo({
            name: name,
            category: category,
            endpoint: endpoint,
            active: true
        });

        emit AgentRegistered(agent, name, category, endpoint);
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

    function agentExists(address agent) external view returns (bool) {
        return _exists[agent];
    }

    function getAgents() external view returns (address[] memory) {
        return _agentList;
    }

    function agentCount() external view returns (uint256) {
        return _agentList.length;
    }
}
