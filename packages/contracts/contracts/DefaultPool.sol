// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import './Interfaces/IDefaultPool.sol';
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";

/*
 * The Default Pool holds the SEI and SAI debt (but not SAI tokens) from liquidations that have been redistributed
 * to active troves but not yet "applied", i.e. not yet recorded on a recipient active trove's struct.
 *
 * When a trove makes an operation that applies its pending SEI and SAI debt, its pending SEI and SAI debt is moved
 * from the Default Pool to the Active Pool.
 */
contract DefaultPool is Ownable, CheckContract, IDefaultPool {
    using SafeMath for uint256;

    string constant public NAME = "DefaultPool";

    address public troveManagerAddress;
    address public activePoolAddress;
    uint256 internal SEI;  // deposited SEI tracker
    uint256 internal SAIDebt;  // debt

    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event DefaultPoolSAIDebtUpdated(uint _SAIDebt);
    event DefaultPoolSEIBalanceUpdated(uint _SEI);

    // --- Dependency setters ---

    function setAddresses(
        address _troveManagerAddress,
        address _activePoolAddress
    )
        external
        onlyOwner
    {
        checkContract(_troveManagerAddress);
        checkContract(_activePoolAddress);

        troveManagerAddress = _troveManagerAddress;
        activePoolAddress = _activePoolAddress;

        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit ActivePoolAddressChanged(_activePoolAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
    * Returns the SEI state variable.
    *
    * Not necessarily equal to the the contract's raw SEI balance - sei can be forcibly sent to contracts.
    */
    function getSEI() external view override returns (uint) {
        return SEI;
    }

    function getSAIDebt() external view override returns (uint) {
        return SAIDebt;
    }

    // --- Pool functionality ---

    function sendSEIToActivePool(uint _amount) external override {
        _requireCallerIsTroveManager();
        address activePool = activePoolAddress; // cache to save an SLOAD
        SEI = SEI.sub(_amount);
        emit DefaultPoolSEIBalanceUpdated(SEI);
        emit SeiSent(activePool, _amount);

        (bool success, ) = activePool.call{ value: _amount }("");
        require(success, "DefaultPool: sending SEI failed");
    }

    function increaseSAIDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        SAIDebt = SAIDebt.add(_amount);
        emit DefaultPoolSAIDebtUpdated(SAIDebt);
    }

    function decreaseSAIDebt(uint _amount) external override {
        _requireCallerIsTroveManager();
        SAIDebt = SAIDebt.sub(_amount);
        emit DefaultPoolSAIDebtUpdated(SAIDebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "DefaultPool: Caller is not the ActivePool");
    }

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "DefaultPool: Caller is not the TroveManager");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsActivePool();
        SEI = SEI.add(msg.value);
        emit DefaultPoolSEIBalanceUpdated(SEI);
    }
}
