// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "./IPool.sol";


interface IActivePool is IPool {
    // --- Events ---
    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolSAIDebtUpdated(uint _SAIDebt);
    event ActivePoolSEIBalanceUpdated(uint _SEI);

    // --- Functions ---
    function sendSEI(address _account, uint _amount) external;
}
