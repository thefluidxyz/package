// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../ActivePool.sol";

contract ActivePoolTester is ActivePool {
    
    function unprotectedIncreaseSAIDebt(uint _amount) external {
        SAIDebt  = SAIDebt.add(_amount);
    }

    function unprotectedPayable() external payable {
        SEI = SEI.add(msg.value);
    }
}
