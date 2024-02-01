// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/CheckContract.sol";
import "../Interfaces/IFLOStaking.sol";


contract FLOStakingScript is CheckContract {
    IFLOStaking immutable FLOStaking;

    constructor(address _floStakingAddress) public {
        checkContract(_floStakingAddress);
        FLOStaking = IFLOStaking(_floStakingAddress);
    }

    function stake(uint _FLOamount) external {
        FLOStaking.stake(_FLOamount);
    }
}
