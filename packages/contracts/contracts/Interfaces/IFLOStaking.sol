// SPDX-License-Identifier: MIT

pragma solidity 0.6.11;

interface IFLOStaking {

    // --- Events --
    
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
    )  external;

    function stake(uint _FLOamount) external;

    function unstake(uint _FLOamount) external;

    function increaseF_SEI(uint _SEIFee) external; 

    function increaseF_SAI(uint _FLOFee) external;  

    function getPendingSEIGain(address _user) external view returns (uint);

    function getPendingSAIGain(address _user) external view returns (uint);
}
