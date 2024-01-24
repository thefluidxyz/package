// SPDX-License-Identifier: MIT
pragma solidity ^0.6.11;


interface IPriceFeed {
    function latestAnswer() external view returns (int256);
}


contract LUSDUsdToLUSDSei is IPriceFeed {
    IPriceFeed public constant LUSD_USD = IPriceFeed(0x0cA429162aF53d5F5209F7DF4109c052A447EEE2);
    IPriceFeed public constant SEI_USD = IPriceFeed(0x11e4A6a60b4103e53Bc642c08bA18a4A5D20aa51);

    constructor() public {}

    function latestAnswer() external view override returns (int256) {
        return (LUSD_USD.latestAnswer() * 1 ether) / SEI_USD.latestAnswer();
    }
}
