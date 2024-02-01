// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../FLO/CommunityIssuance.sol";

contract CommunityIssuanceTester is CommunityIssuance {
    function obtainFLO(uint _amount) external {
        floToken.transfer(msg.sender, _amount);
    }

    function getCumulativeIssuanceFraction() external view returns (uint) {
       return _getCumulativeIssuanceFraction();
    }

    function unprotectedIssueFLO() external returns (uint) {
        // No checks on caller address
       
        uint latestTotalFLOIssued = FLOSupplyCap.mul(_getCumulativeIssuanceFraction()).div(DECIMAL_PRECISION);
        uint issuance = latestTotalFLOIssued.sub(totalFLOIssued);
      
        totalFLOIssued = latestTotalFLOIssued;
        return issuance;
    }
}
