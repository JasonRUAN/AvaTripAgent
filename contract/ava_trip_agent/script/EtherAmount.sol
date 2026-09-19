// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EtherAmount
/// @notice 把 ".env 里人类可读的 ether 字符串" 转成 wei。
/// forge-std 的 `vm.envOr(name, uint256)` 不支持小数（`0.15` 会被截断成 0），
/// 因此统一用本库解析 FUND_AGENT_AVAX。
library EtherAmount {
    error InvalidAmount(string value);

    /// @dev 支持 "0.15" / "1" / ".5" / "0"；超过 18 位的小数直接截断。
    function toWei(string memory value) internal pure returns (uint256) {
        bytes memory raw = bytes(value);
        if (raw.length == 0) return 0;

        uint256 digits;
        uint256 decimals;
        bool seenDot;

        for (uint256 i; i < raw.length; ++i) {
            uint8 c = uint8(raw[i]);

            if (c == uint8(bytes1("."))) {
                if (seenDot) revert InvalidAmount(value);
                seenDot = true;
                continue;
            }
            if (c < 48 || c > 57) revert InvalidAmount(value);

            if (seenDot) {
                // 只保留 18 位小数，多余部分丢弃（不会溢出）
                if (decimals < 18) {
                    digits = digits * 10 + (c - 48);
                    ++decimals;
                }
            } else {
                digits = digits * 10 + (c - 48);
            }
        }

        return digits * 10 ** (18 - decimals);
    }
}
