// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;


interface IPriceFeed {
    function latestAnswer() external view returns (int256);
}


contract SAIUsdToSAISei is IPriceFeed {
    IPriceFeed public constant SAI_USD = IPriceFeed(0xAc86798f5612041a7763A5146fa47F967dc4b21B);
    IPriceFeed public constant SEI_USD = IPriceFeed(0x29A2ce0f6E5CB41b9BfB9205F89b7aa341520487);

    constructor() public {}

    function latestAnswer() external view override returns (int256) {
        return (SAI_USD.latestAnswer() * 1 ether) / SEI_USD.latestAnswer();
    }
}
