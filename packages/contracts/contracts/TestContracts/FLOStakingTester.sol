// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../FLO/FLOStaking.sol";


contract FLOStakingTester is FLOStaking {
    function requireCallerIsTroveManager() external view {
        _requireCallerIsTroveManager();
    }
}
