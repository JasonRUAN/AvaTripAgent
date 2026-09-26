// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TravelVoucher} from "./TravelVoucher.sol";
import {AgentRegistry} from "./AgentRegistry.sol";

/// @title AgentReview
/// @notice 用户在凭证核销后对服务商 Agent 打分。链上存短评，供后续询价按均分选商。
contract AgentReview {
    uint8 public constant MIN_SCORE = 1;
    uint8 public constant MAX_SCORE = 5;
    uint256 public constant MAX_COMMENT_BYTES = 280;

    struct Review {
        uint256 tokenId;
        address reviewer;
        address provider;
        uint8 score;
        string comment;
        uint64 timestamp;
    }

    TravelVoucher public immutable voucher;
    AgentRegistry public immutable registry;

    mapping(uint256 => Review) private _byToken;
    mapping(uint256 => bool) private _reviewed;
    mapping(address => uint256[]) private _tokensByAgent;
    mapping(address => uint256) public ratingSum;
    mapping(address => uint256) public ratingCount;

    event ReviewSubmitted(
        uint256 indexed tokenId,
        address indexed reviewer,
        address indexed provider,
        uint8 score,
        string comment
    );

    error UnknownVoucher();
    error NotHolder();
    error VoucherNotRedeemed();
    error AlreadyReviewed(uint256 tokenId);
    error InvalidScore();
    error CommentTooLong();
    error InactiveProvider(address provider);

    constructor(address voucher_) {
        voucher = TravelVoucher(voucher_);
        registry = voucher.registry();
    }

    function submitReview(uint256 tokenId, uint8 score, string calldata comment) external {
        if (score < MIN_SCORE || score > MAX_SCORE) revert InvalidScore();
        if (bytes(comment).length > MAX_COMMENT_BYTES) revert CommentTooLong();
        if (_reviewed[tokenId]) revert AlreadyReviewed(tokenId);

        TravelVoucher.Voucher memory v = voucher.getVoucher(tokenId);
        if (v.provider == address(0)) revert UnknownVoucher();
        if (v.holder != msg.sender) revert NotHolder();
        if (v.status != TravelVoucher.VoucherStatus.Redeemed) revert VoucherNotRedeemed();
        if (!registry.isActiveAgent(v.provider)) revert InactiveProvider(v.provider);

        _reviewed[tokenId] = true;
        _byToken[tokenId] = Review({
            tokenId: tokenId,
            reviewer: msg.sender,
            provider: v.provider,
            score: score,
            comment: comment,
            timestamp: uint64(block.timestamp)
        });
        _tokensByAgent[v.provider].push(tokenId);
        ratingSum[v.provider] += score;
        ratingCount[v.provider] += 1;

        emit ReviewSubmitted(tokenId, msg.sender, v.provider, score, comment);
    }

    function getReview(uint256 tokenId) external view returns (Review memory) {
        return _byToken[tokenId];
    }

    function hasReview(uint256 tokenId) external view returns (bool) {
        return _reviewed[tokenId];
    }

    function getReviewsByAgent(address agent) external view returns (Review[] memory reviews) {
        uint256[] storage ids = _tokensByAgent[agent];
        reviews = new Review[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            reviews[i] = _byToken[ids[i]];
        }
    }

    /// @return sum 评分总和
    /// @return count 评价条数
    /// @return avgX100 均分 * 100（无评价时为 0）
    function getScore(address agent) external view returns (uint256 sum, uint256 count, uint256 avgX100) {
        sum = ratingSum[agent];
        count = ratingCount[agent];
        if (count != 0) avgX100 = (sum * 100) / count;
    }
}
