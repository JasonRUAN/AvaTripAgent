// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {TravelVoucher} from "../src/TravelVoucher.sol";

/// @title SetBaseURI
/// @notice 补救脚本：修正已部署 TravelVoucher 的 baseURI。
///
/// 场景：部署时 `VOUCHER_BASE_URI` 填成了 localhost，导致 Explorer / 钱包
/// 拉 `tokenURI` 拿到不可达地址（Glacier 标记 INVALID_TOKEN_URI）。
/// `setBaseURI` 是 `onlyOwner` 的外部函数，改它不需要重新部署合约，
/// 也不会影响任何已签发的凭证。
///
/// 用法（Fuji）：
///   export PRIVATE_KEY=0x...                      # 必须等于 TravelVoucher.owner()
///   export VOUCHER_ADDRESS=0x...                  # TravelVoucher 合约地址
///   export VOUCHER_BASE_URI=https://<host>/api/vouchers/
///   forge script script/SetBaseURI.s.sol:SetBaseURI --rpc-url fuji --broadcast
///
/// 注意：baseURI 必须以 "/" 结尾，合约拼接方式是 `baseURI + tokenId + "/metadata"`。
contract SetBaseURI is Script {
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address voucher = vm.envAddress("VOUCHER_ADDRESS");
        string memory baseURI = vm.envString("VOUCHER_BASE_URI");

        // 先用可读错误失败，避免广播后才发现 revert NotOwner
        address signer = vm.addr(privateKey);
        address owner = TravelVoucher(voucher).owner();
        require(signer == owner, "signer is not TravelVoucher owner");
        require(bytes(baseURI).length > 0, "empty baseURI");
        require(_endsWith(baseURI, "/"), "baseURI must end with '/'");

        vm.startBroadcast(privateKey);

        TravelVoucher(voucher).setBaseURI(baseURI);

        vm.stopBroadcast();

        // view 调用，不会被广播；用最新一个 tokenId 验证拼接结果
        uint256 next = TravelVoucher(voucher).nextTokenId();
        if (next > 1) {
            console2.log("tokenURI(1) ->", TravelVoucher(voucher).tokenURI(next - 1));
        }
        console2.log("baseURI updated on", voucher);
    }

    function _endsWith(string memory text, string memory suffix)
        internal
        pure
        returns (bool)
    {
        bytes memory a = bytes(text);
        bytes memory b = bytes(suffix);
        if (b.length > a.length) return false;
        for (uint256 i = 0; i < b.length; i++) {
            if (a[a.length - b.length + i] != b[i]) return false;
        }
        return true;
    }
}
