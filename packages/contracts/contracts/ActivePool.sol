// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import './Interfaces/IActivePool.sol';
import "./Dependencies/SafeMath.sol";
import "./Dependencies/Ownable.sol";
import "./Dependencies/CheckContract.sol";
import "./Dependencies/console.sol";

/*
 * The Active Pool holds the SEI collateral and SAI debt (but not SAI tokens) for all active troves.
 *
 * When a trove is liquidated, it's SEI and SAI debt are transferred from the Active Pool, to either the
 * Stability Pool, the Default Pool, or both, depending on the liquidation conditions.
 *
 */
contract ActivePool is Ownable, CheckContract, IActivePool {
    using SafeMath for uint256;

    string constant public NAME = "ActivePool";

    address public borrowerOperationsAddress;
    address public troveManagerAddress;
    address public stabilityPoolAddress;
    address public defaultPoolAddress;
    uint256 internal SEI;  // deposited sei tracker
    uint256 internal SAIDebt;

    // --- Events ---

    event BorrowerOperationsAddressChanged(address _newBorrowerOperationsAddress);
    event TroveManagerAddressChanged(address _newTroveManagerAddress);
    event ActivePoolSAIDebtUpdated(uint _SAIDebt);
    event ActivePoolSEIBalanceUpdated(uint _SEI);

    // --- Contract setters ---

    function setAddresses(
        address _borrowerOperationsAddress,
        address _troveManagerAddress,
        address _stabilityPoolAddress,
        address _defaultPoolAddress
    )
        external
        onlyOwner
    {
        checkContract(_borrowerOperationsAddress);
        checkContract(_troveManagerAddress);
        checkContract(_stabilityPoolAddress);
        checkContract(_defaultPoolAddress);

        borrowerOperationsAddress = _borrowerOperationsAddress;
        troveManagerAddress = _troveManagerAddress;
        stabilityPoolAddress = _stabilityPoolAddress;
        defaultPoolAddress = _defaultPoolAddress;

        emit BorrowerOperationsAddressChanged(_borrowerOperationsAddress);
        emit TroveManagerAddressChanged(_troveManagerAddress);
        emit StabilityPoolAddressChanged(_stabilityPoolAddress);
        emit DefaultPoolAddressChanged(_defaultPoolAddress);

        _renounceOwnership();
    }

    // --- Getters for public variables. Required by IPool interface ---

    /*
    * Returns the SEI state variable.
    *
    *Not necessarily equal to the the contract's raw SEI balance - sei can be forcibly sent to contracts.
    */
    function getSEI() external view override returns (uint) {
        return SEI;
    }

    function getSAIDebt() external view override returns (uint) {
        return SAIDebt;
    }

    // --- Pool functionality ---

    function sendSEI(address _account, uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        SEI = SEI.sub(_amount);
        emit ActivePoolSEIBalanceUpdated(SEI);
        emit SeiSent(_account, _amount);

        (bool success, ) = _account.call{ value: _amount }("");
        require(success, "ActivePool: sending SEI failed");
    }

    function increaseSAIDebt(uint _amount) external override {
        _requireCallerIsBOorTroveM();
        SAIDebt  = SAIDebt.add(_amount);
        ActivePoolSAIDebtUpdated(SAIDebt);
    }

    function decreaseSAIDebt(uint _amount) external override {
        _requireCallerIsBOorTroveMorSP();
        SAIDebt = SAIDebt.sub(_amount);
        ActivePoolSAIDebtUpdated(SAIDebt);
    }

    // --- 'require' functions ---

    function _requireCallerIsBorrowerOperationsOrDefaultPool() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == defaultPoolAddress,
            "ActivePool: Caller is neither BO nor Default Pool");
    }

    function _requireCallerIsBOorTroveMorSP() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress ||
            msg.sender == stabilityPoolAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager nor StabilityPool");
    }

    function _requireCallerIsBOorTroveM() internal view {
        require(
            msg.sender == borrowerOperationsAddress ||
            msg.sender == troveManagerAddress,
            "ActivePool: Caller is neither BorrowerOperations nor TroveManager");
    }

    // --- Fallback function ---

    receive() external payable {
        _requireCallerIsBorrowerOperationsOrDefaultPool();
        SEI = SEI.add(msg.value);
        emit ActivePoolSEIBalanceUpdated(SEI);
    }
}
