const Decimal = require("decimal.js");
const deploymentHelper = require("../utils/deploymentHelpers.js")
const { BNConverter } = require("../utils/BNConverter.js")
const testHelpers = require("../utils/testHelpers.js")

const FLOStakingTester = artifacts.require('FLOStakingTester')
const TroveManagerTester = artifacts.require("TroveManagerTester")
const NonPayable = artifacts.require("./NonPayable.sol")

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const dec = th.dec
const assertRevert = th.assertRevert

const toBN = th.toBN
const ZERO = th.toBN('0')

const GAS_PRICE = 10000000

/* NOTE: These tests do not test for specific SEI and SAI gain values. They only test that the 
 * gains are non-zero, occur when they should, and are in correct proportion to the user's stake. 
 *
 * Specific SEI/SAI gain values will depend on the final fee schedule used, and the final choices for
 * parameters BETA and MINUTE_DECAY_FACTOR in the TroveManager, which are still TBD based on economic
 * modelling.
 * 
 */ 

contract('FLOStaking revenue share tests', async accounts => {

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)
  
  const [owner, A, B, C, D, E, F, G, whale] = accounts;

  let priceFeed
  let saiToken
  let sortedTroves
  let troveManager
  let activePool
  let stabilityPool
  let defaultPool
  let borrowerOperations
  let floStaking
  let floToken

  let contracts

  const openTrove = async (params) => th.openTrove(contracts, params)

  beforeEach(async () => {
    contracts = await deploymentHelper.deployFluidCore()
    contracts.troveManager = await TroveManagerTester.new()
    contracts = await deploymentHelper.deploySAITokenTester(contracts)
    const FLOContracts = await deploymentHelper.deployFLOTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisig)
    
    await deploymentHelper.connectFLOContracts(FLOContracts)
    await deploymentHelper.connectCoreContracts(contracts, FLOContracts)
    await deploymentHelper.connectFLOContractsToCore(FLOContracts, contracts)

    nonPayable = await NonPayable.new() 
    priceFeed = contracts.priceFeedTestnet
    saiToken = contracts.saiToken
    sortedTroves = contracts.sortedTroves
    troveManager = contracts.troveManager
    activePool = contracts.activePool
    stabilityPool = contracts.stabilityPool
    defaultPool = contracts.defaultPool
    borrowerOperations = contracts.borrowerOperations
    hintHelpers = contracts.hintHelpers

    floToken = FLOContracts.floToken
    floStaking = FLOContracts.floStaking
  })

  it('stake(): reverts if amount is zero', async () => {
    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // console.log(`A flo bal: ${await floToken.balanceOf(A)}`)

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await assertRevert(floStaking.stake(0, {from: A}), "FLOStaking: Amount must be non-zero")
  })

  it("SEI fee per FLO staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig, gasPrice: GAS_PRICE})

    // console.log(`A flo bal: ${await floToken.balanceOf(A)}`)

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floStaking.stake(dec(100, 18), {from: A})

    // Check SEI fee per unit staked is zero
    const F_SEI_Before = await floStaking.F_SEI()
    assert.equal(F_SEI_Before, '0')

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check SEI fee emitted in event is non-zero
    const emittedSEIFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3])
    assert.isTrue(emittedSEIFee.gt(toBN('0')))

    // Check SEI fee per unit staked has increased by correct amount
    const F_SEI_After = await floStaking.F_SEI()

    // Expect fee per unit staked = fee/100, since there is 100 SAI totalStaked
    const expected_F_SEI_After = emittedSEIFee.div(toBN('100')) 

    assert.isTrue(expected_F_SEI_After.eq(F_SEI_After))
  })

  it("SEI fee per FLO staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig, gasPrice: GAS_PRICE})

    // Check SEI fee per unit staked is zero
    const F_SEI_Before = await floStaking.F_SEI()
    assert.equal(F_SEI_Before, '0')

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check SEI fee emitted in event is non-zero
    const emittedSEIFee = toBN((await th.getEmittedRedemptionValues(redemptionTx))[3])
    assert.isTrue(emittedSEIFee.gt(toBN('0')))

    // Check SEI fee per unit staked has not increased 
    const F_SEI_After = await floStaking.F_SEI()
    assert.equal(F_SEI_After, '0')
  })

  it("SAI fee per FLO staked increases when a redemption fee is triggered and totalStakes > 0", async () => {
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floStaking.stake(dec(100, 18), {from: A})

    // Check SAI fee per unit staked is zero
    const F_SAI_Before = await floStaking.F_SEI()
    assert.equal(F_SAI_Before, '0')

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), gasPrice= GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate()
    assert.isTrue(baseRate.gt(toBN('0')))

    // D draws debt
    const tx = await borrowerOperations.withdrawSAI(th._100pct, dec(27, 18), D, D, {from: D})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee = toBN(th.getSAIFeeFromSAIBorrowingEvent(tx))
    assert.isTrue(emittedSAIFee.gt(toBN('0')))
    
    // Check SAI fee per unit staked has increased by correct amount
    const F_SAI_After = await floStaking.F_SAI()

    // Expect fee per unit staked = fee/100, since there is 100 SAI totalStaked
    const expected_F_SAI_After = emittedSAIFee.div(toBN('100')) 

    assert.isTrue(expected_F_SAI_After.eq(F_SAI_After))
  })

  it("SAI fee per FLO staked doesn't change when a redemption fee is triggered and totalStakes == 0", async () => {
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // Check SAI fee per unit staked is zero
    const F_SAI_Before = await floStaking.F_SEI()
    assert.equal(F_SAI_Before, '0')

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // Check base rate is now non-zero
    const baseRate = await troveManager.baseRate()
    assert.isTrue(baseRate.gt(toBN('0')))

    // D draws debt
    const tx = await borrowerOperations.withdrawSAI(th._100pct, dec(27, 18), D, D, {from: D})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee = toBN(th.getSAIFeeFromSAIBorrowingEvent(tx))
    assert.isTrue(emittedSAIFee.gt(toBN('0')))
    
    // Check SAI fee per unit staked did not increase, is still zero
    const F_SAI_After = await floStaking.F_SAI()
    assert.equal(F_SAI_After, '0')
  })

  it("FLO Staking: A single staker earns all SEI and FLO fees that occur", async () => {
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floStaking.stake(dec(100, 18), {from: A})

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check SEI fee 1 emitted in event is non-zero
    const emittedSEIFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedSEIFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await saiToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const C_BalAfterRedemption = await saiToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check SEI fee 2 emitted in event is non-zero
     const emittedSEIFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedSEIFee_2.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSAI(th._100pct, dec(104, 18), D, D, {from: D})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee_1 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedSAIFee_1.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSAI(th._100pct, dec(17, 18), B, B, {from: B})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee_2 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedSAIFee_2.gt(toBN('0')))

    const expectedTotalSEIGain = emittedSEIFee_1.add(emittedSEIFee_2)
    const expectedTotalSAIGain = emittedSAIFee_1.add(emittedSAIFee_2)

    const A_SEIBalance_Before = toBN(await web3.eth.getBalance(A))
    const A_SAIBalance_Before = toBN(await saiToken.balanceOf(A))

    // A un-stakes
    const GAS_Used = th.gasUsed(await floStaking.unstake(dec(100, 18), {from: A, gasPrice: GAS_PRICE }))

    const A_SEIBalance_After = toBN(await web3.eth.getBalance(A))
    const A_SAIBalance_After = toBN(await saiToken.balanceOf(A))


    const A_SEIGain = A_SEIBalance_After.sub(A_SEIBalance_Before).add(toBN(GAS_Used * GAS_PRICE))
    const A_SAIGain = A_SAIBalance_After.sub(A_SAIBalance_Before)

    assert.isAtMost(th.getDifference(expectedTotalSEIGain, A_SEIGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalSAIGain, A_SAIGain), 1000)
  })

  it("stake(): Top-up sends out all accumulated SEI and SAI gains to the staker", async () => { 
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floStaking.stake(dec(50, 18), {from: A})

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check SEI fee 1 emitted in event is non-zero
    const emittedSEIFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedSEIFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await saiToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const C_BalAfterRedemption = await saiToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check SEI fee 2 emitted in event is non-zero
     const emittedSEIFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedSEIFee_2.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSAI(th._100pct, dec(104, 18), D, D, {from: D})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee_1 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedSAIFee_1.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSAI(th._100pct, dec(17, 18), B, B, {from: B})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee_2 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedSAIFee_2.gt(toBN('0')))

    const expectedTotalSEIGain = emittedSEIFee_1.add(emittedSEIFee_2)
    const expectedTotalSAIGain = emittedSAIFee_1.add(emittedSAIFee_2)

    const A_SEIBalance_Before = toBN(await web3.eth.getBalance(A))
    const A_SAIBalance_Before = toBN(await saiToken.balanceOf(A))

    // A tops up
    const GAS_Used = th.gasUsed(await floStaking.stake(dec(50, 18), {from: A, gasPrice: GAS_PRICE }))

    const A_SEIBalance_After = toBN(await web3.eth.getBalance(A))
    const A_SAIBalance_After = toBN(await saiToken.balanceOf(A))

    const A_SEIGain = A_SEIBalance_After.sub(A_SEIBalance_Before).add(toBN(GAS_Used * GAS_PRICE))
    const A_SAIGain = A_SAIBalance_After.sub(A_SAIBalance_Before)

    assert.isAtMost(th.getDifference(expectedTotalSEIGain, A_SEIGain), 1000)
    assert.isAtMost(th.getDifference(expectedTotalSAIGain, A_SAIGain), 1000)
  })

  it("getPendingSEIGain(): Returns the staker's correct pending SEI gain", async () => { 
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floStaking.stake(dec(50, 18), {from: A})

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check SEI fee 1 emitted in event is non-zero
    const emittedSEIFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedSEIFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await saiToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const C_BalAfterRedemption = await saiToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check SEI fee 2 emitted in event is non-zero
     const emittedSEIFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedSEIFee_2.gt(toBN('0')))

    const expectedTotalSEIGain = emittedSEIFee_1.add(emittedSEIFee_2)

    const A_SEIGain = await floStaking.getPendingSEIGain(A)

    assert.isAtMost(th.getDifference(expectedTotalSEIGain, A_SEIGain), 1000)
  })

  it("getPendingSAIGain(): Returns the staker's correct pending SAI gain", async () => { 
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A
    await floToken.transfer(A, dec(100, 18), {from: multisig})

    // A makes stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floStaking.stake(dec(50, 18), {from: A})

    const B_BalBeforeREdemption = await saiToken.balanceOf(B)
    // B redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const B_BalAfterRedemption = await saiToken.balanceOf(B)
    assert.isTrue(B_BalAfterRedemption.lt(B_BalBeforeREdemption))

    // check SEI fee 1 emitted in event is non-zero
    const emittedSEIFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedSEIFee_1.gt(toBN('0')))

    const C_BalBeforeREdemption = await saiToken.balanceOf(C)
    // C redeems
    const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(100, 18), gasPrice = GAS_PRICE)
    
    const C_BalAfterRedemption = await saiToken.balanceOf(C)
    assert.isTrue(C_BalAfterRedemption.lt(C_BalBeforeREdemption))
 
     // check SEI fee 2 emitted in event is non-zero
     const emittedSEIFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedSEIFee_2.gt(toBN('0')))

    // D draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSAI(th._100pct, dec(104, 18), D, D, {from: D})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee_1 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedSAIFee_1.gt(toBN('0')))

    // B draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSAI(th._100pct, dec(17, 18), B, B, {from: B})
    
    // Check SAI fee value in event is non-zero
    const emittedSAIFee_2 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedSAIFee_2.gt(toBN('0')))

    const expectedTotalSAIGain = emittedSAIFee_1.add(emittedSAIFee_2)
    const A_SAIGain = await floStaking.getPendingSAIGain(A)

    assert.isAtMost(th.getDifference(expectedTotalSAIGain, A_SAIGain), 1000)
  })

  // - multi depositors, several rewards
  it("FLO Staking: Multiple stakers earn the correct share of all SEI and FLO fees, based on their stake size", async () => {
    await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: F } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: G } })

    // FF time one year so owner can transfer FLO
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A, B, C
    await floToken.transfer(A, dec(100, 18), {from: multisig})
    await floToken.transfer(B, dec(200, 18), {from: multisig})
    await floToken.transfer(C, dec(300, 18), {from: multisig})

    // A, B, C make stake
    await floToken.approve(floStaking.address, dec(100, 18), {from: A})
    await floToken.approve(floStaking.address, dec(200, 18), {from: B})
    await floToken.approve(floStaking.address, dec(300, 18), {from: C})
    await floStaking.stake(dec(100, 18), {from: A})
    await floStaking.stake(dec(200, 18), {from: B})
    await floStaking.stake(dec(300, 18), {from: C})

    // Confirm staking contract holds 600 FLO
    // console.log(`flo staking FLO bal: ${await floToken.balanceOf(floStaking.address)}`)
    assert.equal(await floToken.balanceOf(floStaking.address), dec(600, 18))
    assert.equal(await floStaking.totalFLOStaked(), dec(600, 18))

    // F redeems
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(F, contracts, dec(45, 18), gasPrice = GAS_PRICE)
    const emittedSEIFee_1 = toBN((await th.getEmittedRedemptionValues(redemptionTx_1))[3])
    assert.isTrue(emittedSEIFee_1.gt(toBN('0')))

     // G redeems
     const redemptionTx_2 = await th.redeemCollateralAndGetTxObject(G, contracts, dec(197, 18), gasPrice = GAS_PRICE)
     const emittedSEIFee_2 = toBN((await th.getEmittedRedemptionValues(redemptionTx_2))[3])
     assert.isTrue(emittedSEIFee_2.gt(toBN('0')))

    // F draws debt
    const borrowingTx_1 = await borrowerOperations.withdrawSAI(th._100pct, dec(104, 18), F, F, {from: F})
    const emittedSAIFee_1 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_1))
    assert.isTrue(emittedSAIFee_1.gt(toBN('0')))

    // G draws debt
    const borrowingTx_2 = await borrowerOperations.withdrawSAI(th._100pct, dec(17, 18), G, G, {from: G})
    const emittedSAIFee_2 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_2))
    assert.isTrue(emittedSAIFee_2.gt(toBN('0')))

    // D obtains FLO from owner and makes a stake
    await floToken.transfer(D, dec(50, 18), {from: multisig})
    await floToken.approve(floStaking.address, dec(50, 18), {from: D})
    await floStaking.stake(dec(50, 18), {from: D})

    // Confirm staking contract holds 650 FLO
    assert.equal(await floToken.balanceOf(floStaking.address), dec(650, 18))
    assert.equal(await floStaking.totalFLOStaked(), dec(650, 18))

     // G redeems
     const redemptionTx_3 = await th.redeemCollateralAndGetTxObject(C, contracts, dec(197, 18), gasPrice = GAS_PRICE)
     const emittedSEIFee_3 = toBN((await th.getEmittedRedemptionValues(redemptionTx_3))[3])
     assert.isTrue(emittedSEIFee_3.gt(toBN('0')))

     // G draws debt
    const borrowingTx_3 = await borrowerOperations.withdrawSAI(th._100pct, dec(17, 18), G, G, {from: G})
    const emittedSAIFee_3 = toBN(th.getSAIFeeFromSAIBorrowingEvent(borrowingTx_3))
    assert.isTrue(emittedSAIFee_3.gt(toBN('0')))
     
    /*  
    Expected rewards:

    A_SEI: (100* SEIFee_1)/600 + (100* SEIFee_2)/600 + (100*SEI_Fee_3)/650
    B_SEI: (200* SEIFee_1)/600 + (200* SEIFee_2)/600 + (200*SEI_Fee_3)/650
    C_SEI: (300* SEIFee_1)/600 + (300* SEIFee_2)/600 + (300*SEI_Fee_3)/650
    D_SEI:                                             (100*SEI_Fee_3)/650

    A_SAI: (100*SAIFee_1 )/600 + (100* SAIFee_2)/600 + (100*SAIFee_3)/650
    B_SAI: (200* SAIFee_1)/600 + (200* SAIFee_2)/600 + (200*SAIFee_3)/650
    C_SAI: (300* SAIFee_1)/600 + (300* SAIFee_2)/600 + (300*SAIFee_3)/650
    D_SAI:                                               (100*SAIFee_3)/650
    */

    // Expected SEI gains
    const expectedSEIGain_A = toBN('100').mul(emittedSEIFee_1).div( toBN('600'))
                            .add(toBN('100').mul(emittedSEIFee_2).div( toBN('600')))
                            .add(toBN('100').mul(emittedSEIFee_3).div( toBN('650')))

    const expectedSEIGain_B = toBN('200').mul(emittedSEIFee_1).div( toBN('600'))
                            .add(toBN('200').mul(emittedSEIFee_2).div( toBN('600')))
                            .add(toBN('200').mul(emittedSEIFee_3).div( toBN('650')))

    const expectedSEIGain_C = toBN('300').mul(emittedSEIFee_1).div( toBN('600'))
                            .add(toBN('300').mul(emittedSEIFee_2).div( toBN('600')))
                            .add(toBN('300').mul(emittedSEIFee_3).div( toBN('650')))

    const expectedSEIGain_D = toBN('50').mul(emittedSEIFee_3).div( toBN('650'))

    // Expected SAI gains:
    const expectedSAIGain_A = toBN('100').mul(emittedSAIFee_1).div( toBN('600'))
                            .add(toBN('100').mul(emittedSAIFee_2).div( toBN('600')))
                            .add(toBN('100').mul(emittedSAIFee_3).div( toBN('650')))

    const expectedSAIGain_B = toBN('200').mul(emittedSAIFee_1).div( toBN('600'))
                            .add(toBN('200').mul(emittedSAIFee_2).div( toBN('600')))
                            .add(toBN('200').mul(emittedSAIFee_3).div( toBN('650')))

    const expectedSAIGain_C = toBN('300').mul(emittedSAIFee_1).div( toBN('600'))
                            .add(toBN('300').mul(emittedSAIFee_2).div( toBN('600')))
                            .add(toBN('300').mul(emittedSAIFee_3).div( toBN('650')))
    
    const expectedSAIGain_D = toBN('50').mul(emittedSAIFee_3).div( toBN('650'))


    const A_SEIBalance_Before = toBN(await web3.eth.getBalance(A))
    const A_SAIBalance_Before = toBN(await saiToken.balanceOf(A))
    const B_SEIBalance_Before = toBN(await web3.eth.getBalance(B))
    const B_SAIBalance_Before = toBN(await saiToken.balanceOf(B))
    const C_SEIBalance_Before = toBN(await web3.eth.getBalance(C))
    const C_SAIBalance_Before = toBN(await saiToken.balanceOf(C))
    const D_SEIBalance_Before = toBN(await web3.eth.getBalance(D))
    const D_SAIBalance_Before = toBN(await saiToken.balanceOf(D))

    // A-D un-stake
    const A_GAS_Used = th.gasUsed(await floStaking.unstake(dec(100, 18), {from: A, gasPrice: GAS_PRICE }))
    const B_GAS_Used = th.gasUsed(await floStaking.unstake(dec(200, 18), {from: B, gasPrice: GAS_PRICE }))
    const C_GAS_Used = th.gasUsed(await floStaking.unstake(dec(400, 18), {from: C, gasPrice: GAS_PRICE }))
    const D_GAS_Used = th.gasUsed(await floStaking.unstake(dec(50, 18), {from: D, gasPrice: GAS_PRICE }))

    // Confirm all depositors could withdraw

    //Confirm pool Size is now 0
    assert.equal((await floToken.balanceOf(floStaking.address)), '0')
    assert.equal((await floStaking.totalFLOStaked()), '0')

    // Get A-D SEI and SAI balances
    const A_SEIBalance_After = toBN(await web3.eth.getBalance(A))
    const A_SAIBalance_After = toBN(await saiToken.balanceOf(A))
    const B_SEIBalance_After = toBN(await web3.eth.getBalance(B))
    const B_SAIBalance_After = toBN(await saiToken.balanceOf(B))
    const C_SEIBalance_After = toBN(await web3.eth.getBalance(C))
    const C_SAIBalance_After = toBN(await saiToken.balanceOf(C))
    const D_SEIBalance_After = toBN(await web3.eth.getBalance(D))
    const D_SAIBalance_After = toBN(await saiToken.balanceOf(D))

    // Get SEI and SAI gains
    const A_SEIGain = A_SEIBalance_After.sub(A_SEIBalance_Before).add(toBN(A_GAS_Used * GAS_PRICE))
    const A_SAIGain = A_SAIBalance_After.sub(A_SAIBalance_Before)
    const B_SEIGain = B_SEIBalance_After.sub(B_SEIBalance_Before).add(toBN(B_GAS_Used * GAS_PRICE))
    const B_SAIGain = B_SAIBalance_After.sub(B_SAIBalance_Before)
    const C_SEIGain = C_SEIBalance_After.sub(C_SEIBalance_Before).add(toBN(C_GAS_Used * GAS_PRICE))
    const C_SAIGain = C_SAIBalance_After.sub(C_SAIBalance_Before)
    const D_SEIGain = D_SEIBalance_After.sub(D_SEIBalance_Before).add(toBN(D_GAS_Used * GAS_PRICE))
    const D_SAIGain = D_SAIBalance_After.sub(D_SAIBalance_Before)

    // Check gains match expected amounts
    assert.isAtMost(th.getDifference(expectedSEIGain_A, A_SEIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSAIGain_A, A_SAIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSEIGain_B, B_SEIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSAIGain_B, B_SAIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSEIGain_C, C_SEIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSAIGain_C, C_SAIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSEIGain_D, D_SEIGain), 1000)
    assert.isAtMost(th.getDifference(expectedSAIGain_D, D_SAIGain), 1000)
  })
 
  it("unstake(): reverts if caller has SEI gains and can't receive SEI",  async () => {
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })  
    await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
    await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
    await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
    await openTrove({ extraSAIAmount: toBN(dec(50000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

    // multisig transfers FLO to staker A and the non-payable proxy
    await floToken.transfer(A, dec(100, 18), {from: multisig})
    await floToken.transfer(nonPayable.address, dec(100, 18), {from: multisig})

    //  A makes stake
    const A_stakeTx = await floStaking.stake(dec(100, 18), {from: A})
    assert.isTrue(A_stakeTx.receipt.status)

    //  A tells proxy to make a stake
    const proxystakeTxData = await th.getTransactionData('stake(uint256)', ['0x56bc75e2d63100000'])  // proxy stakes 100 FLO
    await nonPayable.forward(floStaking.address, proxystakeTxData, {from: A})


    // B makes a redemption, creating SEI gain for proxy
    const redemptionTx_1 = await th.redeemCollateralAndGetTxObject(B, contracts, dec(45, 18), gasPrice = GAS_PRICE)
    
    const proxy_SEIGain = await floStaking.getPendingSEIGain(nonPayable.address)
    assert.isTrue(proxy_SEIGain.gt(toBN('0')))

    // Expect this tx to revert: stake() tries to send nonPayable proxy's accumulated SEI gain (albeit 0),
    //  A tells proxy to unstake
    const proxyUnStakeTxData = await th.getTransactionData('unstake(uint256)', ['0x56bc75e2d63100000'])  // proxy stakes 100 FLO
    const proxyUnstakeTxPromise = nonPayable.forward(floStaking.address, proxyUnStakeTxData, {from: A})
   
    // but nonPayable proxy can not accept SEI - therefore stake() reverts.
    await assertRevert(proxyUnstakeTxPromise)
  })

  it("receive(): reverts when it receives SEI from an address that is not the Active Pool",  async () => { 
    const ethSendTxPromise1 = web3.eth.sendTransaction({to: floStaking.address, from: A, value: dec(1, 'ether')})
    const ethSendTxPromise2 = web3.eth.sendTransaction({to: floStaking.address, from: owner, value: dec(1, 'ether')})

    await assertRevert(ethSendTxPromise1)
    await assertRevert(ethSendTxPromise2)
  })

  it("unstake(): reverts if user has no stake",  async () => {  
    const unstakeTxPromise1 = floStaking.unstake(1, {from: A})
    const unstakeTxPromise2 = floStaking.unstake(1, {from: owner})

    await assertRevert(unstakeTxPromise1)
    await assertRevert(unstakeTxPromise2)
  })

  it('Test requireCallerIsTroveManager', async () => {
    const floStakingTester = await FLOStakingTester.new()
    await assertRevert(floStakingTester.requireCallerIsTroveManager(), 'FLOStaking: caller is not TroveM')
  })
})
