// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface ICommunityIssuance { 
    
    // --- Events ---
    
    event FLOTokenAddressSet(address _floTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalFLOIssuedUpdated(uint _totalFLOIssued);

    // --- Functions ---

    function setAddresses(address _floTokenAddress, address _stabilityPoolAddress) external;

    function issueFLO() external returns (uint);

    function sendFLO(address _account, uint _FLOamount) external;
}
