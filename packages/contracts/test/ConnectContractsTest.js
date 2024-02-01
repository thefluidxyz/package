const deploymentHelper = require("../utils/deploymentHelpers.js")

contract('Deployment script - Sets correct contract addresses dependencies after deployment', async accounts => {
  const [owner] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)
  
  let priceFeed
  let saiToken
  let sortedTroves
  let troveManager
  let activePool
  let stabilityPool
  let defaultPool
  let functionCaller
  let borrowerOperations
  let floStaking
  let floToken
  let communityIssuance
  let lockupContractFactory

  before(async () => {
    const coreContracts = await deploymentHelper.deployFluidCore()
    const FLOContracts = await deploymentHelper.deployFLOContracts(bountyAddress, lpRewardsAddress, multisig)

    priceFeed = coreContracts.priceFeedTestnet
    saiToken = coreContracts.saiToken
    sortedTroves = coreContracts.sortedTroves
    troveManager = coreContracts.troveManager
    activePool = coreContracts.activePool
    stabilityPool = coreContracts.stabilityPool
    defaultPool = coreContracts.defaultPool
    functionCaller = coreContracts.functionCaller
    borrowerOperations = coreContracts.borrowerOperations

    floStaking = FLOContracts.floStaking
    floToken = FLOContracts.floToken
    communityIssuance = FLOContracts.communityIssuance
    lockupContractFactory = FLOContracts.lockupContractFactory

    await deploymentHelper.connectFLOContracts(FLOContracts)
    await deploymentHelper.connectCoreContracts(coreContracts, FLOContracts)
    await deploymentHelper.connectFLOContractsToCore(FLOContracts, coreContracts)
  })

  it('Sets the correct PriceFeed address in TroveManager', async () => {
    const priceFeedAddress = priceFeed.address

    const recordedPriceFeedAddress = await troveManager.priceFeed()

    assert.equal(priceFeedAddress, recordedPriceFeedAddress)
  })

  it('Sets the correct SAIToken address in TroveManager', async () => {
    const saiTokenAddress = saiToken.address

    const recordedClvTokenAddress = await troveManager.saiToken()

    assert.equal(saiTokenAddress, recordedClvTokenAddress)
  })

  it('Sets the correct SortedTroves address in TroveManager', async () => {
    const sortedTrovesAddress = sortedTroves.address

    const recordedSortedTrovesAddress = await troveManager.sortedTroves()

    assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress)
  })

  it('Sets the correct BorrowerOperations address in TroveManager', async () => {
    const borrowerOperationsAddress = borrowerOperations.address

    const recordedBorrowerOperationsAddress = await troveManager.borrowerOperationsAddress()

    assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
  })

  // ActivePool in TroveM
  it('Sets the correct ActivePool address in TroveManager', async () => {
    const activePoolAddress = activePool.address

    const recordedActivePoolAddresss = await troveManager.activePool()

    assert.equal(activePoolAddress, recordedActivePoolAddresss)
  })

  // DefaultPool in TroveM
  it('Sets the correct DefaultPool address in TroveManager', async () => {
    const defaultPoolAddress = defaultPool.address

    const recordedDefaultPoolAddresss = await troveManager.defaultPool()

    assert.equal(defaultPoolAddress, recordedDefaultPoolAddresss)
  })

  // StabilityPool in TroveM
  it('Sets the correct StabilityPool address in TroveManager', async () => {
    const stabilityPoolAddress = stabilityPool.address

    const recordedStabilityPoolAddresss = await troveManager.stabilityPool()

    assert.equal(stabilityPoolAddress, recordedStabilityPoolAddresss)
  })

  // FLO Staking in TroveM
  it('Sets the correct FLOStaking address in TroveManager', async () => {
    const floStakingAddress = floStaking.address

    const recordedFLOStakingAddress = await troveManager.floStaking()
    assert.equal(floStakingAddress, recordedFLOStakingAddress)
  })

  // Active Pool

  it('Sets the correct StabilityPool address in ActivePool', async () => {
    const stabilityPoolAddress = stabilityPool.address

    const recordedStabilityPoolAddress = await activePool.stabilityPoolAddress()

    assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress)
  })

  it('Sets the correct DefaultPool address in ActivePool', async () => {
    const defaultPoolAddress = defaultPool.address

    const recordedDefaultPoolAddress = await activePool.defaultPoolAddress()

    assert.equal(defaultPoolAddress, recordedDefaultPoolAddress)
  })

  it('Sets the correct BorrowerOperations address in ActivePool', async () => {
    const borrowerOperationsAddress = borrowerOperations.address

    const recordedBorrowerOperationsAddress = await activePool.borrowerOperationsAddress()

    assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
  })

  it('Sets the correct TroveManager address in ActivePool', async () => {
    const troveManagerAddress = troveManager.address

    const recordedTroveManagerAddress = await activePool.troveManagerAddress()
    assert.equal(troveManagerAddress, recordedTroveManagerAddress)
  })

  // Stability Pool

  it('Sets the correct ActivePool address in StabilityPool', async () => {
    const activePoolAddress = activePool.address

    const recordedActivePoolAddress = await stabilityPool.activePool()
    assert.equal(activePoolAddress, recordedActivePoolAddress)
  })

  it('Sets the correct BorrowerOperations address in StabilityPool', async () => {
    const borrowerOperationsAddress = borrowerOperations.address

    const recordedBorrowerOperationsAddress = await stabilityPool.borrowerOperations()

    assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
  })

  it('Sets the correct SAIToken address in StabilityPool', async () => {
    const saiTokenAddress = saiToken.address

    const recordedClvTokenAddress = await stabilityPool.saiToken()

    assert.equal(saiTokenAddress, recordedClvTokenAddress)
  })

  it('Sets the correct TroveManager address in StabilityPool', async () => {
    const troveManagerAddress = troveManager.address

    const recordedTroveManagerAddress = await stabilityPool.troveManager()
    assert.equal(troveManagerAddress, recordedTroveManagerAddress)
  })

  // Default Pool

  it('Sets the correct TroveManager address in DefaultPool', async () => {
    const troveManagerAddress = troveManager.address

    const recordedTroveManagerAddress = await defaultPool.troveManagerAddress()
    assert.equal(troveManagerAddress, recordedTroveManagerAddress)
  })

  it('Sets the correct ActivePool address in DefaultPool', async () => {
    const activePoolAddress = activePool.address

    const recordedActivePoolAddress = await defaultPool.activePoolAddress()
    assert.equal(activePoolAddress, recordedActivePoolAddress)
  })

  it('Sets the correct TroveManager address in SortedTroves', async () => {
    const borrowerOperationsAddress = borrowerOperations.address

    const recordedBorrowerOperationsAddress = await sortedTroves.borrowerOperationsAddress()
    assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
  })

  it('Sets the correct BorrowerOperations address in SortedTroves', async () => {
    const troveManagerAddress = troveManager.address

    const recordedTroveManagerAddress = await sortedTroves.troveManager()
    assert.equal(troveManagerAddress, recordedTroveManagerAddress)
  })

  //--- BorrowerOperations ---

  // TroveManager in BO
  it('Sets the correct TroveManager address in BorrowerOperations', async () => {
    const troveManagerAddress = troveManager.address

    const recordedTroveManagerAddress = await borrowerOperations.troveManager()
    assert.equal(troveManagerAddress, recordedTroveManagerAddress)
  })

  // setPriceFeed in BO
  it('Sets the correct PriceFeed address in BorrowerOperations', async () => {
    const priceFeedAddress = priceFeed.address

    const recordedPriceFeedAddress = await borrowerOperations.priceFeed()
    assert.equal(priceFeedAddress, recordedPriceFeedAddress)
  })

  // setSortedTroves in BO
  it('Sets the correct SortedTroves address in BorrowerOperations', async () => {
    const sortedTrovesAddress = sortedTroves.address

    const recordedSortedTrovesAddress = await borrowerOperations.sortedTroves()
    assert.equal(sortedTrovesAddress, recordedSortedTrovesAddress)
  })

  // setActivePool in BO
  it('Sets the correct ActivePool address in BorrowerOperations', async () => {
    const activePoolAddress = activePool.address

    const recordedActivePoolAddress = await borrowerOperations.activePool()
    assert.equal(activePoolAddress, recordedActivePoolAddress)
  })

  // setDefaultPool in BO
  it('Sets the correct DefaultPool address in BorrowerOperations', async () => {
    const defaultPoolAddress = defaultPool.address

    const recordedDefaultPoolAddress = await borrowerOperations.defaultPool()
    assert.equal(defaultPoolAddress, recordedDefaultPoolAddress)
  })

  // FLO Staking in BO
  it('Sets the correct FLOStaking address in BorrowerOperations', async () => {
    const floStakingAddress = floStaking.address

    const recordedFLOStakingAddress = await borrowerOperations.floStakingAddress()
    assert.equal(floStakingAddress, recordedFLOStakingAddress)
  })


  // --- FLO Staking ---

  // Sets FLOToken in FLOStaking
  it('Sets the correct FLOToken address in FLOStaking', async () => {
    const floTokenAddress = floToken.address

    const recordedFLOTokenAddress = await floStaking.floToken()
    assert.equal(floTokenAddress, recordedFLOTokenAddress)
  })

  // Sets ActivePool in FLOStaking
  it('Sets the correct ActivePool address in FLOStaking', async () => {
    const activePoolAddress = activePool.address

    const recordedActivePoolAddress = await floStaking.activePoolAddress()
    assert.equal(activePoolAddress, recordedActivePoolAddress)
  })

  // Sets SAIToken in FLOStaking
  it('Sets the correct ActivePool address in FLOStaking', async () => {
    const saiTokenAddress = saiToken.address

    const recordedSAITokenAddress = await floStaking.saiToken()
    assert.equal(saiTokenAddress, recordedSAITokenAddress)
  })

  // Sets TroveManager in FLOStaking
  it('Sets the correct ActivePool address in FLOStaking', async () => {
    const troveManagerAddress = troveManager.address

    const recordedTroveManagerAddress = await floStaking.troveManagerAddress()
    assert.equal(troveManagerAddress, recordedTroveManagerAddress)
  })

  // Sets BorrowerOperations in FLOStaking
  it('Sets the correct BorrowerOperations address in FLOStaking', async () => {
    const borrowerOperationsAddress = borrowerOperations.address

    const recordedBorrowerOperationsAddress = await floStaking.borrowerOperationsAddress()
    assert.equal(borrowerOperationsAddress, recordedBorrowerOperationsAddress)
  })

  // ---  FLOToken ---

  // Sets CI in FLOToken
  it('Sets the correct CommunityIssuance address in FLOToken', async () => {
    const communityIssuanceAddress = communityIssuance.address

    const recordedcommunityIssuanceAddress = await floToken.communityIssuanceAddress()
    assert.equal(communityIssuanceAddress, recordedcommunityIssuanceAddress)
  })

  // Sets FLOStaking in FLOToken
  it('Sets the correct FLOStaking address in FLOToken', async () => {
    const floStakingAddress = floStaking.address

    const recordedFLOStakingAddress =  await floToken.floStakingAddress()
    assert.equal(floStakingAddress, recordedFLOStakingAddress)
  })

  // Sets LCF in FLOToken
  it('Sets the correct LockupContractFactory address in FLOToken', async () => {
    const LCFAddress = lockupContractFactory.address

    const recordedLCFAddress =  await floToken.lockupContractFactory()
    assert.equal(LCFAddress, recordedLCFAddress)
  })

  // --- LCF  ---

  // Sets FLOToken in LockupContractFactory
  it('Sets the correct FLOToken address in LockupContractFactory', async () => {
    const floTokenAddress = floToken.address

    const recordedFLOTokenAddress = await lockupContractFactory.floTokenAddress()
    assert.equal(floTokenAddress, recordedFLOTokenAddress)
  })

  // --- CI ---

  // Sets FLOToken in CommunityIssuance
  it('Sets the correct FLOToken address in CommunityIssuance', async () => {
    const floTokenAddress = floToken.address

    const recordedFLOTokenAddress = await communityIssuance.floToken()
    assert.equal(floTokenAddress, recordedFLOTokenAddress)
  })

  it('Sets the correct StabilityPool address in CommunityIssuance', async () => {
    const stabilityPoolAddress = stabilityPool.address

    const recordedStabilityPoolAddress = await communityIssuance.stabilityPoolAddress()
    assert.equal(stabilityPoolAddress, recordedStabilityPoolAddress)
  })
})
