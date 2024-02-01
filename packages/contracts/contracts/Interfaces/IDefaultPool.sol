// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./IPool.sol";


interface IDefaultPool is IPool {
    // --- Events ---
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolSAIDebtUpdated(uint _SAIDebt);
    event DefaultPoolSEIBalanceUpdated(uint _SEI);

    // --- Functions ---
    function sendSEIToActivePool(uint _amount) external;
}
