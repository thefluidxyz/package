// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/FluidSafeMath128.sol";

/* Tester contract for math functions in FluidSafeMath128.sol library. */

contract FluidSafeMath128Tester {
    using FluidSafeMath128 for uint128;

    function add(uint128 a, uint128 b) external pure returns (uint128) {
        return a.add(b);
    }

    function sub(uint128 a, uint128 b) external pure returns (uint128) {
        return a.sub(b);
    }
}
