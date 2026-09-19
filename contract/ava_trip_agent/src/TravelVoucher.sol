// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title TravelVoucher
/// @notice 机票 / 酒店 / 门票 / 餐饮凭证。服务商 Agent 收到分账后用自己的私钥签发。
///
/// 采用可转让 ERC-721（而非 SBT）：转赠、改签的叙事空间更大。
/// 链上只存 `metadataHash`，明细由后端 `tokenURI` 提供，兼顾体积与可修改性。
contract TravelVoucher is ERC721 {
    enum VoucherStatus {
        Issued,
        Redeemed,
        Voided
    }

    struct Voucher {
        uint256 orderId;
        /// 发行者（服务商 Agent）
        address provider;
        /// 持有者（用户）
        address holder;
        /// 0 机票 / 1 酒店 / 2 门票 / 3 餐饮
        uint8 category;
        /// "PNR 7KQ2ZP" / "CONF HX-88213"
        string code;
        /// "NH959 上海浦东 → 东京羽田"
        string title;
        bytes32 metadataHash;
        uint64 validFrom;
        uint64 validTo;
        VoucherStatus status;
    }

    address public owner;
    AgentRegistry public immutable registry;

    uint256 public nextTokenId = 1;
    string private _baseTokenURI;

    mapping(uint256 => Voucher) private _vouchers;

    event VoucherIssued(
        uint256 indexed tokenId,
        address indexed provider,
        address indexed holder,
        uint8 category,
        string code
    );
    event VoucherRedeemed(uint256 indexed tokenId, address indexed provider);
    event VoucherVoided(uint256 indexed tokenId, address indexed provider);

    error NotOwner();
    error NotRegisteredAgent(address caller);
    error NotProvider(uint256 tokenId);
    error UnknownVoucher(uint256 tokenId);
    error VoucherNotIssued(uint256 tokenId);
    error InvalidValidityWindow();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(
        address registry_
    ) ERC721("AvaTrip Voucher", "AVATRIP") {
        registry = AgentRegistry(registry_);
        owner = msg.sender;
    }

    // ------------------------------------------------------------------ 管理

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }

    // ------------------------------------------------------------------ 发券

    function issueVoucher(
        address holder,
        uint256 orderId,
        uint8 category,
        string calldata code,
        string calldata title,
        bytes32 metadataHash,
        uint64 validFrom,
        uint64 validTo
    ) external returns (uint256 tokenId) {
        if (!registry.isActiveAgent(msg.sender)) {
            revert NotRegisteredAgent(msg.sender);
        }
        if (validTo != 0 && validFrom > validTo) revert InvalidValidityWindow();

        tokenId = nextTokenId++;

        _vouchers[tokenId] = Voucher({
            orderId: orderId,
            provider: msg.sender,
            holder: holder,
            category: category,
            code: code,
            title: title,
            metadataHash: metadataHash,
            validFrom: validFrom,
            validTo: validTo,
            status: VoucherStatus.Issued
        });

        _safeMint(holder, tokenId);

        emit VoucherIssued(tokenId, msg.sender, holder, category, code);
    }

    // ------------------------------------------------------------------ 核销

    /// @notice 商户端核销：只有发行该凭证的 Agent 才能标记已使用，且不可重复使用。
    function redeem(uint256 tokenId) external {
        Voucher storage voucher = _vouchers[tokenId];
        if (voucher.provider == address(0)) revert UnknownVoucher(tokenId);
        if (voucher.provider != msg.sender) revert NotProvider(tokenId);
        if (voucher.status != VoucherStatus.Issued) revert VoucherNotIssued(tokenId);

        voucher.status = VoucherStatus.Redeemed;
        emit VoucherRedeemed(tokenId, msg.sender);
    }

    /// @notice 退票 / 作废。
    function void(uint256 tokenId) external {
        Voucher storage voucher = _vouchers[tokenId];
        if (voucher.provider == address(0)) revert UnknownVoucher(tokenId);
        if (voucher.provider != msg.sender) revert NotProvider(tokenId);
        if (voucher.status != VoucherStatus.Issued) revert VoucherNotIssued(tokenId);

        voucher.status = VoucherStatus.Voided;
        emit VoucherVoided(tokenId, msg.sender);
    }

    // ------------------------------------------------------------------ 读取

    function getVoucher(uint256 tokenId) external view returns (Voucher memory) {
        return _vouchers[tokenId];
    }

    /// @notice 验证页用：链上有效性 = 存在 + 未核销未作废 + 在有效期内。
    function isValid(uint256 tokenId) external view returns (bool) {
        Voucher storage voucher = _vouchers[tokenId];
        if (voucher.provider == address(0)) return false;
        if (voucher.status != VoucherStatus.Issued) return false;
        if (voucher.validFrom != 0 && block.timestamp < voucher.validFrom) return false;
        if (voucher.validTo != 0 && block.timestamp > voucher.validTo) return false;
        return true;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        if (bytes(_baseTokenURI).length == 0) return "";
        // base + tokenId + "/metadata" → 后端 GET /api/vouchers/:tokenId/metadata
        return string.concat(_baseTokenURI, _toString(tokenId), "/metadata");
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            ++digits;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
