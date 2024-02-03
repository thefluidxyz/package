// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;


interface IPriceFeed {
    function latestAnswer() external view returns (int256);
}


contract SAIUsdToSAISei is IPriceFeed {
    IPriceFeed public constant SAI_USD = IPriceFeed(0x58B29a5b43B295561efB0fC7d2cd2619d4C404a8);
    IPriceFeed public constant SEI_USD = IPriceFeed(0x1E7e89BBEBd18E727548010A739116184fb82Ed4);

    constructor() public {}

    function latestAnswer() external view override returns (int256) {
        return (SAI_USD.latestAnswer() * 1 ether) / SEI_USD.latestAnswer();
    }
}
