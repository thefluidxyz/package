// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Interfaces/IFLOToken.sol";
import "../Interfaces/ICommunityIssuance.sol";
import "../Dependencies/BaseMath.sol";
import "../Dependencies/FluidMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/SafeMath.sol";


contract CommunityIssuance is ICommunityIssuance, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---

    string constant public NAME = "CommunityIssuance";

    uint constant public SECONDS_IN_ONE_MINUTE = 60;

   /* The issuance factor F determines the curvature of the issuance curve.
    *
    * Minutes in one year: 60*24*365 = 525600
    *
    * For 50% of remaining tokens issued each year, with minutes as time units, we have:
    * 
    * F ** 525600 = 0.5
    * 
    * Re-arranging:
    * 
    * 525600 * ln(F) = ln(0.5)
    * F = 0.5 ** (1/525600)
    * F = 0.999998681227695000 
    */
    uint constant public ISSUANCE_FACTOR = 999998681227695000;

    /* 
    * The community FLO supply cap is the starting balance of the Community Issuance contract.
    * It should be minted to this contract by FLOToken, when the token is deployed.
    * 
    * Set to 32M (slightly less than 1/3) of total FLO supply.
    */
    uint constant public FLOSupplyCap = 32e24; // 32 million

    IFLOToken public floToken;

    address public stabilityPoolAddress;

    uint public totalFLOIssued;
    uint public immutable deploymentTime;

    // --- Events ---

    event FLOTokenAddressSet(address _floTokenAddress);
    event StabilityPoolAddressSet(address _stabilityPoolAddress);
    event TotalFLOIssuedUpdated(uint _totalFLOIssued);

    // --- Functions ---

    constructor() public {
        deploymentTime = block.timestamp;
    }

    function setAddresses
    (
        address _floTokenAddress, 
        address _stabilityPoolAddress
    ) 
        external 
        onlyOwner 
        override 
    {
        checkContract(_floTokenAddress);
        checkContract(_stabilityPoolAddress);

        floToken = IFLOToken(_floTokenAddress);
        stabilityPoolAddress = _stabilityPoolAddress;

        // When FLOToken deployed, it should have transferred CommunityIssuance's FLO entitlement
        uint FLOBalance = floToken.balanceOf(address(this));
        assert(FLOBalance >= FLOSupplyCap);

        emit FLOTokenAddressSet(_floTokenAddress);
        emit StabilityPoolAddressSet(_stabilityPoolAddress);

        _renounceOwnership();
    }

    function issueFLO() external override returns (uint) {
        _requireCallerIsStabilityPool();

        uint latestTotalFLOIssued = FLOSupplyCap.mul(_getCumulativeIssuanceFraction()).div(DECIMAL_PRECISION);
        uint issuance = latestTotalFLOIssued.sub(totalFLOIssued);

        totalFLOIssued = latestTotalFLOIssued;
        emit TotalFLOIssuedUpdated(latestTotalFLOIssued);
        
        return issuance;
    }

    /* Gets 1-f^t    where: f < 1

    f: issuance factor that determines the shape of the curve
    t:  time passed since last FLO issuance event  */
    function _getCumulativeIssuanceFraction() internal view returns (uint) {
        // Get the time passed since deployment
        uint timePassedInMinutes = block.timestamp.sub(deploymentTime).div(SECONDS_IN_ONE_MINUTE);

        // f^t
        uint power = FluidMath._decPow(ISSUANCE_FACTOR, timePassedInMinutes);

        //  (1 - f^t)
        uint cumulativeIssuanceFraction = (uint(DECIMAL_PRECISION).sub(power));
        assert(cumulativeIssuanceFraction <= DECIMAL_PRECISION); // must be in range [0,1]

        return cumulativeIssuanceFraction;
    }

    function sendFLO(address _account, uint _FLOamount) external override {
        _requireCallerIsStabilityPool();

        floToken.transfer(_account, _FLOamount);
    }

    // --- 'require' functions ---

    function _requireCallerIsStabilityPool() internal view {
        require(msg.sender == stabilityPoolAddress, "CommunityIssuance: caller is not SP");
    }
}
