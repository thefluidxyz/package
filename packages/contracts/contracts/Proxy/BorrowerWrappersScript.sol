// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/SafeMath.sol";
import "../Dependencies/FluidMath.sol";
import "../Dependencies/IERC20.sol";
import "../Interfaces/IBorrowerOperations.sol";
import "../Interfaces/ITroveManager.sol";
import "../Interfaces/IStabilityPool.sol";
import "../Interfaces/IPriceFeed.sol";
import "../Interfaces/IFLOStaking.sol";
import "./BorrowerOperationsScript.sol";
import "./SEITransferScript.sol";
import "./FLOStakingScript.sol";
import "../Dependencies/console.sol";


contract BorrowerWrappersScript is BorrowerOperationsScript, SEITransferScript, FLOStakingScript {
    using SafeMath for uint;

    string constant public NAME = "BorrowerWrappersScript";

    ITroveManager immutable troveManager;
    IStabilityPool immutable stabilityPool;
    IPriceFeed immutable priceFeed;
    IERC20 immutable saiToken;
    IERC20 immutable floToken;
    IFLOStaking immutable floStaking;

    constructor(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _floStakingAddress
    )
        BorrowerOperationsScript(IBorrowerOperations(_borrowerOperationsAddress))
        FLOStakingScript(_floStakingAddress)
        public
    {
        checkContract(_troveManagerAddress);
        ITroveManager troveManagerCached = ITroveManager(_troveManagerAddress);
        troveManager = troveManagerCached;

        IStabilityPool stabilityPoolCached = troveManagerCached.stabilityPool();
        checkContract(address(stabilityPoolCached));
        stabilityPool = stabilityPoolCached;

        IPriceFeed priceFeedCached = troveManagerCached.priceFeed();
        checkContract(address(priceFeedCached));
        priceFeed = priceFeedCached;

        address saiTokenCached = address(troveManagerCached.saiToken());
        checkContract(saiTokenCached);
        saiToken = IERC20(saiTokenCached);

        address floTokenCached = address(troveManagerCached.floToken());
        checkContract(floTokenCached);
        floToken = IERC20(floTokenCached);

        IFLOStaking floStakingCached = troveManagerCached.floStaking();
        require(_floStakingAddress == address(floStakingCached), "BorrowerWrappersScript: Wrong FLOStaking address");
        floStaking = floStakingCached;
    }

    function claimCollateralAndOpenTrove(uint _maxFee, uint _SAIAmount, address _upperHint, address _lowerHint) external payable {
        uint balanceBefore = address(this).balance;

        // Claim collateral
        borrowerOperations.claimCollateral();

        uint balanceAfter = address(this).balance;

        // already checked in CollSurplusPool
        assert(balanceAfter > balanceBefore);

        uint totalCollateral = balanceAfter.sub(balanceBefore).add(msg.value);

        // Open trove with obtained collateral, plus collateral sent by user
        borrowerOperations.openTrove{ value: totalCollateral }(_maxFee, _SAIAmount, _upperHint, _lowerHint);
    }

    function claimSPRewardsAndRecycle(uint _maxFee, address _upperHint, address _lowerHint) external {
        uint collBalanceBefore = address(this).balance;
        uint floBalanceBefore = floToken.balanceOf(address(this));

        // Claim rewards
        stabilityPool.withdrawFromSP(0);

        uint collBalanceAfter = address(this).balance;
        uint floBalanceAfter = floToken.balanceOf(address(this));
        uint claimedCollateral = collBalanceAfter.sub(collBalanceBefore);

        // Add claimed SEI to trove, get more SAI and stake it into the Stability Pool
        if (claimedCollateral > 0) {
            _requireUserHasTrove(address(this));
            uint SAIAmount = _getNetSAIAmount(claimedCollateral);
            borrowerOperations.adjustTrove{ value: claimedCollateral }(_maxFee, 0, SAIAmount, true, _upperHint, _lowerHint);
            // Provide withdrawn SAI to Stability Pool
            if (SAIAmount > 0) {
                stabilityPool.provideToSP(SAIAmount, address(0));
            }
        }

        // Stake claimed FLO
        uint claimedFLO = floBalanceAfter.sub(floBalanceBefore);
        if (claimedFLO > 0) {
            floStaking.stake(claimedFLO);
        }
    }

    function claimStakingGainsAndRecycle(uint _maxFee, address _upperHint, address _lowerHint) external {
        uint collBalanceBefore = address(this).balance;
        uint saiBalanceBefore = saiToken.balanceOf(address(this));
        uint floBalanceBefore = floToken.balanceOf(address(this));

        // Claim gains
        floStaking.unstake(0);

        uint gainedCollateral = address(this).balance.sub(collBalanceBefore); // stack too deep issues :'(
        uint gainedSAI = saiToken.balanceOf(address(this)).sub(saiBalanceBefore);

        uint netSAIAmount;
        // Top up trove and get more SAI, keeping ICR constant
        if (gainedCollateral > 0) {
            _requireUserHasTrove(address(this));
            netSAIAmount = _getNetSAIAmount(gainedCollateral);
            borrowerOperations.adjustTrove{ value: gainedCollateral }(_maxFee, 0, netSAIAmount, true, _upperHint, _lowerHint);
        }

        uint totalSAI = gainedSAI.add(netSAIAmount);
        if (totalSAI > 0) {
            stabilityPool.provideToSP(totalSAI, address(0));

            // Providing to Stability Pool also triggers FLO claim, so stake it if any
            uint floBalanceAfter = floToken.balanceOf(address(this));
            uint claimedFLO = floBalanceAfter.sub(floBalanceBefore);
            if (claimedFLO > 0) {
                floStaking.stake(claimedFLO);
            }
        }

    }

    function _getNetSAIAmount(uint _collateral) internal returns (uint) {
        uint price = priceFeed.fetchPrice();
        uint ICR = troveManager.getCurrentICR(address(this), price);

        uint SAIAmount = _collateral.mul(price).div(ICR);
        uint borrowingRate = troveManager.getBorrowingRateWithDecay();
        uint netDebt = SAIAmount.mul(FluidMath.DECIMAL_PRECISION).div(FluidMath.DECIMAL_PRECISION.add(borrowingRate));

        return netDebt;
    }

    function _requireUserHasTrove(address _depositor) internal view {
        require(troveManager.getTroveStatus(_depositor) == 1, "BorrowerWrappersScript: caller must have an active trove");
    }
}
