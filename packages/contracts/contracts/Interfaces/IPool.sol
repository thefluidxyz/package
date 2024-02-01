// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

// Common interface for the Pools.
interface IPool {
    
    // --- Events ---
    
    event SEIBalanceUpdated(uint _newBalance);
    event SAIBalanceUpdated(uint _newBalance);
    event ActivePoolAddressChanged(address _newActivePoolAddress);
    event DefaultPoolAddressChanged(address _newDefaultPoolAddress);
    event StabilityPoolAddressChanged(address _newStabilityPoolAddress);
    event SeiSent(address _to, uint _amount);

    // --- Functions ---
    
    function getSEI() external view returns (uint);

    function getSAIDebt() external view returns (uint);

    function increaseSAIDebt(uint _amount) external;

    function decreaseSAIDebt(uint _amount) external;
}
