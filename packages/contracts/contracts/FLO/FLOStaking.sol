// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

import "../Dependencies/BaseMath.sol";
import "../Dependencies/SafeMath.sol";
import "../Dependencies/Ownable.sol";
import "../Dependencies/CheckContract.sol";
import "../Dependencies/console.sol";
import "../Interfaces/IFLOToken.sol";
import "../Interfaces/IFLOStaking.sol";
import "../Dependencies/FluidMath.sol";
import "../Interfaces/ISAIToken.sol";

contract FLOStaking is IFLOStaking, Ownable, CheckContract, BaseMath {
    using SafeMath for uint;

    // --- Data ---
    string constant public NAME = "FLOStaking";

    mapping( address => uint) public stakes;
    uint public totalFLOStaked;

    uint public F_SEI;  // Running sum of SEI fees per-FLO-staked
    uint public F_SAI; // Running sum of FLO fees per-FLO-staked

    // User snapshots of F_SEI and F_SAI, taken at the point at which their latest deposit was made
    mapping (address => Snapshot) public snapshots; 

    struct Snapshot {
        uint F_SEI_Snapshot;
        uint F_SAI_Snapshot;
    }
    
    IFLOToken public floToken;
    ISAIToken public saiToken;

    address public troveManagerAddress;
    address public borrowerOperationsAddress;
    address public activePoolAddress;

    // --- Events ---

    event FLOTokenAddressSet(address _floTokenAddress);
    event SAITokenAddressSet(address _saiTokenAddress);
    event TroveManagerAddressSet(address _troveManager);
    event BorrowerOperationsAddressSet(address _borrowerOperationsAddress);
    event ActivePoolAddressSet(address _activePoolAddress);

    event StakeChanged(address indexed staker, uint newStake);
    event StakingGainsWithdrawn(address indexed staker, uint SAIGain, uint SEIGain);
    event F_SEIUpdated(uint _F_SEI);
    event F_SAIUpdated(uint _F_SAI);
    event TotalFLOStakedUpdated(uint _totalFLOStaked);
    event SeiSent(address _account, uint _amount);
    event StakerSnapshotsUpdated(address _staker, uint _F_SEI, uint _F_SAI);

    // --- Functions ---

    function setAddresses
    (
        address _floTokenAddress,
        address _saiTokenAddress,
        address _troveManagerAddress, 
        address _borrowerOperationsAddress,
        address _activePoolAddress
    ) 
        external 
        onlyOwner 
        override 
    {
        checkContract(_floTokenAddress);
        checkContract(_saiTokenAddress);
        checkContract(_troveManagerAddress);
        checkContract(_borrowerOperationsAddress);
        checkContract(_activePoolAddress);

        floToken = IFLOToken(_floTokenAddress);
        saiToken = ISAIToken(_saiTokenAddress);
        troveManagerAddress = _troveManagerAddress;
        borrowerOperationsAddress = _borrowerOperationsAddress;
        activePoolAddress = _activePoolAddress;

        emit FLOTokenAddressSet(_floTokenAddress);
        emit FLOTokenAddressSet(_saiTokenAddress);
        emit TroveManagerAddressSet(_troveManagerAddress);
        emit BorrowerOperationsAddressSet(_borrowerOperationsAddress);
        emit ActivePoolAddressSet(_activePoolAddress);

        _renounceOwnership();
    }

    // If caller has a pre-existing stake, send any accumulated SEI and SAI gains to them. 
    function stake(uint _FLOamount) external override {
        _requireNonZeroAmount(_FLOamount);

        uint currentStake = stakes[msg.sender];

        uint SEIGain;
        uint SAIGain;
        // Grab any accumulated SEI and SAI gains from the current stake
        if (currentStake != 0) {
            SEIGain = _getPendingSEIGain(msg.sender);
            SAIGain = _getPendingSAIGain(msg.sender);
        }
    
       _updateUserSnapshots(msg.sender);

        uint newStake = currentStake.add(_FLOamount);

        // Increase user’s stake and total FLO staked
        stakes[msg.sender] = newStake;
        totalFLOStaked = totalFLOStaked.add(_FLOamount);
        emit TotalFLOStakedUpdated(totalFLOStaked);

        // Transfer FLO from caller to this contract
        floToken.sendToFLOStaking(msg.sender, _FLOamount);

        emit StakeChanged(msg.sender, newStake);
        emit StakingGainsWithdrawn(msg.sender, SAIGain, SEIGain);

         // Send accumulated SAI and SEI gains to the caller
        if (currentStake != 0) {
            saiToken.transfer(msg.sender, SAIGain);
            _sendSEIGainToUser(SEIGain);
        }
    }

    // Unstake the FLO and send the it back to the caller, along with their accumulated SAI & SEI gains. 
    // If requested amount > stake, send their entire stake.
    function unstake(uint _FLOamount) external override {
        uint currentStake = stakes[msg.sender];
        _requireUserHasStake(currentStake);

        // Grab any accumulated SEI and SAI gains from the current stake
        uint SEIGain = _getPendingSEIGain(msg.sender);
        uint SAIGain = _getPendingSAIGain(msg.sender);
        
        _updateUserSnapshots(msg.sender);

        if (_FLOamount > 0) {
            uint FLOToWithdraw = FluidMath._min(_FLOamount, currentStake);

            uint newStake = currentStake.sub(FLOToWithdraw);

            // Decrease user's stake and total FLO staked
            stakes[msg.sender] = newStake;
            totalFLOStaked = totalFLOStaked.sub(FLOToWithdraw);
            emit TotalFLOStakedUpdated(totalFLOStaked);

            // Transfer unstaked FLO to user
            floToken.transfer(msg.sender, FLOToWithdraw);

            emit StakeChanged(msg.sender, newStake);
        }

        emit StakingGainsWithdrawn(msg.sender, SAIGain, SEIGain);

        // Send accumulated SAI and SEI gains to the caller
        saiToken.transfer(msg.sender, SAIGain);
        _sendSEIGainToUser(SEIGain);
    }

    // --- Reward-per-unit-staked increase functions. Called by Fluid core contracts ---

    function increaseF_SEI(uint _SEIFee) external override {
        _requireCallerIsTroveManager();
        uint SEIFeePerFLOStaked;
     
        if (totalFLOStaked > 0) {SEIFeePerFLOStaked = _SEIFee.mul(DECIMAL_PRECISION).div(totalFLOStaked);}

        F_SEI = F_SEI.add(SEIFeePerFLOStaked); 
        emit F_SEIUpdated(F_SEI);
    }

    function increaseF_SAI(uint _SAIFee) external override {
        _requireCallerIsBorrowerOperations();
        uint SAIFeePerFLOStaked;
        
        if (totalFLOStaked > 0) {SAIFeePerFLOStaked = _SAIFee.mul(DECIMAL_PRECISION).div(totalFLOStaked);}
        
        F_SAI = F_SAI.add(SAIFeePerFLOStaked);
        emit F_SAIUpdated(F_SAI);
    }

    // --- Pending reward functions ---

    function getPendingSEIGain(address _user) external view override returns (uint) {
        return _getPendingSEIGain(_user);
    }

    function _getPendingSEIGain(address _user) internal view returns (uint) {
        uint F_SEI_Snapshot = snapshots[_user].F_SEI_Snapshot;
        uint SEIGain = stakes[_user].mul(F_SEI.sub(F_SEI_Snapshot)).div(DECIMAL_PRECISION);
        return SEIGain;
    }

    function getPendingSAIGain(address _user) external view override returns (uint) {
        return _getPendingSAIGain(_user);
    }

    function _getPendingSAIGain(address _user) internal view returns (uint) {
        uint F_SAI_Snapshot = snapshots[_user].F_SAI_Snapshot;
        uint SAIGain = stakes[_user].mul(F_SAI.sub(F_SAI_Snapshot)).div(DECIMAL_PRECISION);
        return SAIGain;
    }

    // --- Internal helper functions ---

    function _updateUserSnapshots(address _user) internal {
        snapshots[_user].F_SEI_Snapshot = F_SEI;
        snapshots[_user].F_SAI_Snapshot = F_SAI;
        emit StakerSnapshotsUpdated(_user, F_SEI, F_SAI);
    }

    function _sendSEIGainToUser(uint SEIGain) internal {
        emit SeiSent(msg.sender, SEIGain);
        (bool success, ) = msg.sender.call{value: SEIGain}("");
        require(success, "FLOStaking: Failed to send accumulated SEIGain");
    }

    // --- 'require' functions ---

    function _requireCallerIsTroveManager() internal view {
        require(msg.sender == troveManagerAddress, "FLOStaking: caller is not TroveM");
    }

    function _requireCallerIsBorrowerOperations() internal view {
        require(msg.sender == borrowerOperationsAddress, "FLOStaking: caller is not BorrowerOps");
    }

     function _requireCallerIsActivePool() internal view {
        require(msg.sender == activePoolAddress, "FLOStaking: caller is not ActivePool");
    }

    function _requireUserHasStake(uint currentStake) internal pure {  
        require(currentStake > 0, 'FLOStaking: User must have a non-zero stake');  
    }

    function _requireNonZeroAmount(uint _amount) internal pure {
        require(_amount > 0, 'FLOStaking: Amount must be non-zero');
    }

    receive() external payable {
        _requireCallerIsActivePool();
    }
}
