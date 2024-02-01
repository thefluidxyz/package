const deploymentHelper = require("../utils/deploymentHelpers.js")
const testHelpers = require("../utils/testHelpers.js")

const TroveManagerTester = artifacts.require("TroveManagerTester")
const FLOTokenTester = artifacts.require("FLOTokenTester")

const th = testHelpers.TestHelper

const dec = th.dec
const toBN = th.toBN
const mv = testHelpers.MoneyValues
const timeValues = testHelpers.TimeValues

const ZERO_ADDRESS = th.ZERO_ADDRESS
const assertRevert = th.assertRevert

const GAS_PRICE = 10000000


const {
  buildUserProxies,
  BorrowerOperationsProxy,
  BorrowerWrappersProxy,
  TroveManagerProxy,
  StabilityPoolProxy,
  SortedTrovesProxy,
  TokenProxy,
  FLOStakingProxy
} = require('../utils/proxyHelpers.js')

contract('BorrowerWrappers', async accounts => {

  const [
    owner, alice, bob, carol, dennis, whale,
    A, B, C, D, E,
    defaulter_1, defaulter_2,
    // frontEnd_1, frontEnd_2, frontEnd_3
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

  let priceFeed
  let saiToken
  let sortedTroves
  let troveManagerOriginal
  let troveManager
  let activePool
  let stabilityPool
  let defaultPool
  let collSurplusPool
  let borrowerOperations
  let borrowerWrappers
  let floTokenOriginal
  let floToken
  let floStaking

  let contracts

  let SAI_GAS_COMPENSATION

  const getOpenTroveSAIAmount = async (totalDebt) => th.getOpenTroveSAIAmount(contracts, totalDebt)
  const getActualDebtFromComposite = async (compositeDebt) => th.getActualDebtFromComposite(compositeDebt, contracts)
  const getNetBorrowingAmount = async (debtWithFee) => th.getNetBorrowingAmount(contracts, debtWithFee)
  const openTrove = async (params) => th.openTrove(contracts, params)

  beforeEach(async () => {
    contracts = await deploymentHelper.deployFluidCore()
    contracts.troveManager = await TroveManagerTester.new()
    contracts = await deploymentHelper.deploySAIToken(contracts)
    const FLOContracts = await deploymentHelper.deployFLOTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisig)

    await deploymentHelper.connectFLOContracts(FLOContracts)
    await deploymentHelper.connectCoreContracts(contracts, FLOContracts)
    await deploymentHelper.connectFLOContractsToCore(FLOContracts, contracts)

    troveManagerOriginal = contracts.troveManager
    floTokenOriginal = FLOContracts.floToken

    const users = [ alice, bob, carol, dennis, whale, A, B, C, D, E, defaulter_1, defaulter_2 ]
    await deploymentHelper.deployProxyScripts(contracts, FLOContracts, owner, users)

    priceFeed = contracts.priceFeedTestnet
    saiToken = contracts.saiToken
    sortedTroves = contracts.sortedTroves
    troveManager = contracts.troveManager
    activePool = contracts.activePool
    stabilityPool = contracts.stabilityPool
    defaultPool = contracts.defaultPool
    collSurplusPool = contracts.collSurplusPool
    borrowerOperations = contracts.borrowerOperations
    borrowerWrappers = contracts.borrowerWrappers
    floStaking = FLOContracts.floStaking
    floToken = FLOContracts.floToken

    SAI_GAS_COMPENSATION = await borrowerOperations.SAI_GAS_COMPENSATION()
  })

  it('proxy owner can recover SEI', async () => {
    const amount = toBN(dec(1, 18))
    console.log ("amount ===>", amount.toString())
    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)
    console.log ("proxyAddress ===>", proxyAddress.toString())

    // send some SEI to proxy
    await web3.eth.sendTransaction({ from: owner, to: proxyAddress, value: amount, gasPrice: GAS_PRICE })
    console.log ("sendTransaction ===>")
    assert.equal(await web3.eth.getBalance(proxyAddress), amount.toString())
    console.log ("getBalance ===>")

    const balanceBefore = toBN(await web3.eth.getBalance(alice))
    console.log ("balanceBefore ===>", balanceBefore.toString())

    // recover SEI
    try{
    const gas_Used = th.gasUsed(await borrowerWrappers.transferSEI(alice, amount, { from: alice, gasPrice: GAS_PRICE }))
    }catch(e){
      console.log (e)
    }
    console.log ("gas_Used ===>", gas_Used.toString())
    
    const balanceAfter = toBN(await web3.eth.getBalance(alice))
    console.log ("balanceAfter ===>", balanceAfter.toString())
    const expectedBalance = toBN(balanceBefore.sub(toBN(gas_Used * GAS_PRICE)))
    console.log ("expectedBalance ===>", expectedBalance.toString())
    assert.equal(balanceAfter.sub(expectedBalance), amount.toString())
  })

  // it('non proxy owner cannot recover SEI', async () => {
  //   const amount = toBN(dec(1, 18))
  //   const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)

  //   // send some SEI to proxy
  //   await web3.eth.sendTransaction({ from: owner, to: proxyAddress, value: amount })
  //   assert.equal(await web3.eth.getBalance(proxyAddress), amount.toString())

  //   const balanceBefore = toBN(await web3.eth.getBalance(alice))

  //   // try to recover SEI
  //   const proxy = borrowerWrappers.getProxyFromUser(alice)
  //   const signature = 'transferSEI(address,uint256)'
  //   const calldata = th.getTransactionData(signature, [alice, amount])
  //   await assertRevert(proxy.methods["execute(address,bytes)"](borrowerWrappers.scriptAddress, calldata, { from: bob }), 'ds-auth-unauthorized')

  //   assert.equal(await web3.eth.getBalance(proxyAddress), amount.toString())

  //   const balanceAfter = toBN(await web3.eth.getBalance(alice))
  //   assert.equal(balanceAfter, balanceBefore.toString())
  // })

  // // --- claimCollateralAndOpenTrove ---

  // it('claimCollateralAndOpenTrove(): reverts if nothing to claim', async () => {
  //   // Whale opens Trove
  //   await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: whale } })

  //   // alice opens Trove
  //   const { saiAmount, collateral } = await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: alice } })

  //   const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)
  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')

  //   // skip bootstrapping phase
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

  //   // alice claims collateral and re-opens the trove
  //   await assertRevert(
  //     borrowerWrappers.claimCollateralAndOpenTrove(th._100pct, saiAmount, alice, alice, { from: alice }),
  //     'CollSurplusPool: No collateral available to claim'
  //   )

  //   // check everything remain the same
  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')
  //   th.assertIsApproximatelyEqual(await collSurplusPool.getCollateral(proxyAddress), '0')
  //   th.assertIsApproximatelyEqual(await saiToken.balanceOf(proxyAddress), saiAmount)
  //   assert.equal(await troveManager.getTroveStatus(proxyAddress), 1)
  //   th.assertIsApproximatelyEqual(await troveManager.getTroveColl(proxyAddress), collateral)
  // })

  // it('claimCollateralAndOpenTrove(): without sending any value', async () => {
  //   // alice opens Trove
  //   const { saiAmount, netDebt: redeemAmount, collateral } = await openTrove({extraSAIAmount: 0, ICR: toBN(dec(3, 18)), extraParams: { from: alice } })
  //   // Whale opens Trove
  //   await openTrove({ extraSAIAmount: redeemAmount, ICR: toBN(dec(5, 18)), extraParams: { from: whale } })

  //   const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)
  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')

  //   // skip bootstrapping phase
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

  //   // whale redeems 150 SAI
  //   await th.redeemCollateral(whale, contracts, redeemAmount, GAS_PRICE)
  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')

  //   // surplus: 5 - 150/200
  //   const price = await priceFeed.getPrice();
  //   const expectedSurplus = collateral.sub(redeemAmount.mul(mv._1e18BN).div(price))
  //   th.assertIsApproximatelyEqual(await collSurplusPool.getCollateral(proxyAddress), expectedSurplus)
  //   assert.equal(await troveManager.getTroveStatus(proxyAddress), 4) // closed by redemption

  //   // alice claims collateral and re-opens the trove
  //   await borrowerWrappers.claimCollateralAndOpenTrove(th._100pct, saiAmount, alice, alice, { from: alice })

  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')
  //   th.assertIsApproximatelyEqual(await collSurplusPool.getCollateral(proxyAddress), '0')
  //   th.assertIsApproximatelyEqual(await saiToken.balanceOf(proxyAddress), saiAmount.mul(toBN(2)))
  //   assert.equal(await troveManager.getTroveStatus(proxyAddress), 1)
  //   th.assertIsApproximatelyEqual(await troveManager.getTroveColl(proxyAddress), expectedSurplus)
  // })

  // it('claimCollateralAndOpenTrove(): sending value in the transaction', async () => {
  //   // alice opens Trove
  //   const { saiAmount, netDebt: redeemAmount, collateral } = await openTrove({ extraParams: { from: alice } })
  //   // Whale opens Trove
  //   await openTrove({ extraSAIAmount: redeemAmount, ICR: toBN(dec(2, 18)), extraParams: { from: whale } })

  //   const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)
  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')

  //   // skip bootstrapping phase
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

  //   // whale redeems 150 SAI
  //   await th.redeemCollateral(whale, contracts, redeemAmount, GAS_PRICE)
  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')

  //   // surplus: 5 - 150/200
  //   const price = await priceFeed.getPrice();
  //   const expectedSurplus = collateral.sub(redeemAmount.mul(mv._1e18BN).div(price))
  //   th.assertIsApproximatelyEqual(await collSurplusPool.getCollateral(proxyAddress), expectedSurplus)
  //   assert.equal(await troveManager.getTroveStatus(proxyAddress), 4) // closed by redemption

  //   // alice claims collateral and re-opens the trove
  //   await borrowerWrappers.claimCollateralAndOpenTrove(th._100pct, saiAmount, alice, alice, { from: alice, value: collateral })

  //   assert.equal(await web3.eth.getBalance(proxyAddress), '0')
  //   th.assertIsApproximatelyEqual(await collSurplusPool.getCollateral(proxyAddress), '0')
  //   th.assertIsApproximatelyEqual(await saiToken.balanceOf(proxyAddress), saiAmount.mul(toBN(2)))
  //   assert.equal(await troveManager.getTroveStatus(proxyAddress), 1)
  //   th.assertIsApproximatelyEqual(await troveManager.getTroveColl(proxyAddress), expectedSurplus.add(collateral))
  // })

  // // --- claimSPRewardsAndRecycle ---

  // it('claimSPRewardsAndRecycle(): only owner can call it', async () => {
  //   // Whale opens Trove
  //   await openTrove({ extraSAIAmount: toBN(dec(1850, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
  //   // Whale deposits 1850 SAI in StabilityPool
  //   await stabilityPool.provideToSP(dec(1850, 18), ZERO_ADDRESS, { from: whale })

  //   // alice opens trove and provides 150 SAI to StabilityPool
  //   await openTrove({ extraSAIAmount: toBN(dec(150, 18)), extraParams: { from: alice } })
  //   await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, { from: alice })

  //   // Defaulter Trove opened
  //   await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })

  //   // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
  //   const price = toBN(dec(100, 18))
  //   await priceFeed.setPrice(price);

  //   // Defaulter trove closed
  //   const liquidationTX_1 = await troveManager.liquidate(defaulter_1, { from: owner })
  //   const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(liquidationTX_1)

  //   // Bob tries to claims SP rewards in behalf of Alice
  //   const proxy = borrowerWrappers.getProxyFromUser(alice)
  //   const signature = 'claimSPRewardsAndRecycle(uint256,address,address)'
  //   const calldata = th.getTransactionData(signature, [th._100pct, alice, alice])
  //   await assertRevert(proxy.methods["execute(address,bytes)"](borrowerWrappers.scriptAddress, calldata, { from: bob }), 'ds-auth-unauthorized')
  // })

  it('claimSPRewardsAndRecycle():', async () => {
    // Whale opens Trove
    const whaleDeposit = toBN(dec(2350, 18))
    console.log ("====================>1")
    await openTrove({ extraSAIAmount: whaleDeposit, ICR: toBN(dec(4, 18)), extraParams: { from: whale } })
    console.log ("====================>2")
    // Whale deposits 1850 SAI in StabilityPool
    await stabilityPool.provideToSP(whaleDeposit, ZERO_ADDRESS, { from: whale })
    console.log ("====================>3")

    // alice opens trove and provides 150 SAI to StabilityPool
    const aliceDeposit = toBN(dec(150, 18))
    await openTrove({ extraSAIAmount: aliceDeposit, ICR: toBN(dec(3, 18)), extraParams: { from: alice } })
    console.log ("====================>4")
    await stabilityPool.provideToSP(aliceDeposit, ZERO_ADDRESS, { from: alice })
    console.log ("====================>5")

    // Defaulter Trove opened
    const { saiAmount, netDebt, collateral } = await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })
    console.log ("====================>6")

    // price drops: defaulters' Troves fall below MCR, alice and whale Trove remain active
    const price = toBN(dec(100, 18))
    await priceFeed.setPrice(price);
    console.log ("====================>7")

    // Defaulter trove closed
    const liquidationTX_1 = await troveManager.liquidate(defaulter_1, { from: owner })
    console.log ("====================>8")
    const [liquidatedDebt_1] = await th.getEmittedLiquidationValues(liquidationTX_1)
    console.log ("====================>9")

    // Alice SAILoss is ((150/2500) * liquidatedDebt)
    const totalDeposits = whaleDeposit.add(aliceDeposit)
    console.log ("====================>10")
    const expectedSAILoss_A = liquidatedDebt_1.mul(aliceDeposit).div(totalDeposits)
    console.log ("====================>11")

    const expectedCompoundedSAIDeposit_A = toBN(dec(150, 18)).sub(expectedSAILoss_A)
    console.log ("====================>12")
    const compoundedSAIDeposit_A = await stabilityPool.getCompoundedSAIDeposit(alice)
    console.log ("====================>13")
    // collateral * 150 / 2500 * 0.995
    const expectedSEIGain_A = collateral.mul(aliceDeposit).div(totalDeposits).mul(toBN(dec(995, 15))).div(mv._1e18BN)
    console.log ("====================>14")

    assert.isAtMost(th.getDifference(expectedCompoundedSAIDeposit_A, compoundedSAIDeposit_A), 1000)
    console.log ("====================>15")

    const seiBalanceBefore = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    console.log ("====================>16")
    const troveCollBefore = await troveManager.getTroveColl(alice)
    console.log ("====================>17")
    const saiBalanceBefore = await saiToken.balanceOf(alice)
    console.log ("====================>18")
    const troveDebtBefore = await troveManager.getTroveDebt(alice)
    console.log ("====================>19")
    const floBalanceBefore = await floToken.balanceOf(alice)
    console.log ("====================>20")
    const ICRBefore = await troveManager.getCurrentICR(alice, price)
    console.log ("====================>21")
    const depositBefore = (await stabilityPool.deposits(alice))[0]
    console.log ("====================>22")
    const stakeBefore = await floStaking.stakes(alice)
    console.log ("====================>23")

    const proportionalSAI = expectedSEIGain_A.mul(price).div(ICRBefore)
    console.log ("====================>24")
    const borrowingRate = await troveManagerOriginal.getBorrowingRateWithDecay()
    console.log ("====================>25")
    const netDebtChange = proportionalSAI.mul(mv._1e18BN).div(mv._1e18BN.add(borrowingRate))
    console.log ("====================>26")

    // to force FLO issuance
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)
    console.log ("====================>27")

    const expectedFLOGain_A = toBN('50373424199406504708132')

    await priceFeed.setPrice(price.mul(toBN(2)));
    console.log ("====================>28")

    // Alice claims SP rewards and puts them back in the system through the proxy
    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)
    console.log ("====================>29")
    await borrowerWrappers.claimSPRewardsAndRecycle(th._100pct, alice, alice, { from: alice })
    console.log ("====================>30")

    const seiBalanceAfter = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    console.log ("====================>31")
    const troveCollAfter = await troveManager.getTroveColl(alice)
    console.log ("====================>32")
    const saiBalanceAfter = await saiToken.balanceOf(alice)
    console.log ("====================>33")
    const troveDebtAfter = await troveManager.getTroveDebt(alice)
    console.log ("====================>34")
    const floBalanceAfter = await floToken.balanceOf(alice)
    console.log ("====================>35")
    const ICRAfter = await troveManager.getCurrentICR(alice, price)
    console.log ("====================>36")
    const depositAfter = (await stabilityPool.deposits(alice))[0]
    console.log ("====================>37")
    const stakeAfter = await floStaking.stakes(alice)
    console.log ("====================>38")

    // check proxy balances remain the same
    assert.equal(seiBalanceAfter.toString(), seiBalanceBefore.toString())
    console.log ("====================>39")
    assert.equal(saiBalanceAfter.toString(), saiBalanceBefore.toString())
    console.log ("====================>40")
    assert.equal(floBalanceAfter.toString(), floBalanceBefore.toString())
    console.log ("====================>41")
    // check trove has increased debt by the ICR proportional amount to SEI gain
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore.add(proportionalSAI))
    console.log ("====================>42")
    // check trove has increased collateral by the SEI gain
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore.add(expectedSEIGain_A))
    console.log ("====================>43")
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore)
    console.log ("====================>44")
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(depositAfter, depositBefore.sub(expectedSAILoss_A).add(netDebtChange))
    console.log ("====================>45")
    // check flo balance remains the same
    th.assertIsApproximatelyEqual(floBalanceAfter, floBalanceBefore)
    console.log ("====================>46")

    // FLO staking
    th.assertIsApproximatelyEqual(stakeAfter, stakeBefore.add(expectedFLOGain_A))
    console.log ("====================>47")

    // Expect Alice has withdrawn all SEI gain
    try{
    const alice_pendingSEIGain = await stabilityPool.getDepositorSEIGain(alice)
    }catch(e){
      console.log (e)
    }
    console.log ("====================>48")
    assert.equal(alice_pendingSEIGain, 0)
    console.log ("====================>49")
  })


  // --- claimStakingGainsAndRecycle ---

  // it('claimStakingGainsAndRecycle(): only owner can call it', async () => {
  //   // Whale opens Trove
  //   await openTrove({ extraSAIAmount: toBN(dec(1850, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })

  //   // alice opens trove
  //   await openTrove({ extraSAIAmount: toBN(dec(150, 18)), extraParams: { from: alice } })

  //   // mint some FLO
  //   await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(whale), dec(1850, 18))
  //   await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(alice), dec(150, 18))

  //   // stake FLO
  //   await floStaking.stake(dec(1850, 18), { from: whale })
  //   await floStaking.stake(dec(150, 18), { from: alice })

  //   // Defaulter Trove opened
  //   const { saiAmount, netDebt, totalDebt, collateral } = await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })

  //   // skip bootstrapping phase
  //   await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

  //   // whale redeems 100 SAI
  //   const redeemedAmount = toBN(dec(100, 18))
  //   await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE)

  //   // Bob tries to claims staking gains in behalf of Alice
  //   const proxy = borrowerWrappers.getProxyFromUser(alice)
  //   const signature = 'claimStakingGainsAndRecycle(uint256,address,address)'
  //   const calldata = th.getTransactionData(signature, [th._100pct, alice, alice])
  //   await assertRevert(proxy.methods["execute(address,bytes)"](borrowerWrappers.scriptAddress, calldata, { from: bob }), 'ds-auth-unauthorized')
  // })

  it('claimStakingGainsAndRecycle(): reverts if user has no trove', async () => {
    const price = toBN(dec(200, 18))

    // Whale opens Trove
    await openTrove({ extraSAIAmount: toBN(dec(1850, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
    // Whale deposits 1850 SAI in StabilityPool
    await stabilityPool.provideToSP(dec(1850, 18), ZERO_ADDRESS, { from: whale })

    // alice opens trove and provides 150 SAI to StabilityPool
    //await openTrove({ extraSAIAmount: toBN(dec(150, 18)), extraParams: { from: alice } })
    //await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, { from: alice })

    // mint some FLO
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(whale), dec(1850, 18))
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(alice), dec(150, 18))

    // stake FLO
    await floStaking.stake(dec(1850, 18), { from: whale })
    await floStaking.stake(dec(150, 18), { from: alice })

    // Defaulter Trove opened
    const { saiAmount, netDebt, totalDebt, collateral } = await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })
    const borrowingFee = netDebt.sub(saiAmount)

    // Alice SAI gain is ((150/2000) * borrowingFee)
    const expectedSAIGain_A = borrowingFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18)))

    // skip bootstrapping phase
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

    // whale redeems 100 SAI
    const redeemedAmount = toBN(dec(100, 18))
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE)

    const seiBalanceBefore = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollBefore = await troveManager.getTroveColl(alice)
    const saiBalanceBefore = await saiToken.balanceOf(alice)
    const troveDebtBefore = await troveManager.getTroveDebt(alice)
    const floBalanceBefore = await floToken.balanceOf(alice)
    const ICRBefore = await troveManager.getCurrentICR(alice, price)
    const depositBefore = (await stabilityPool.deposits(alice))[0]
    const stakeBefore = await floStaking.stakes(alice)

    // Alice claims staking rewards and puts them back in the system through the proxy
    await assertRevert(
      borrowerWrappers.claimStakingGainsAndRecycle(th._100pct, alice, alice, { from: alice }),
      'BorrowerWrappersScript: caller must have an active trove'
    )

    const seiBalanceAfter = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollAfter = await troveManager.getTroveColl(alice)
    const saiBalanceAfter = await saiToken.balanceOf(alice)
    const troveDebtAfter = await troveManager.getTroveDebt(alice)
    const floBalanceAfter = await floToken.balanceOf(alice)
    const ICRAfter = await troveManager.getCurrentICR(alice, price)
    const depositAfter = (await stabilityPool.deposits(alice))[0]
    const stakeAfter = await floStaking.stakes(alice)

    // check everything remains the same
    assert.equal(seiBalanceAfter.toString(), seiBalanceBefore.toString())
    assert.equal(saiBalanceAfter.toString(), saiBalanceBefore.toString())
    assert.equal(floBalanceAfter.toString(), floBalanceBefore.toString())
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore, 10000)
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore)
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore)
    th.assertIsApproximatelyEqual(depositAfter, depositBefore, 10000)
    th.assertIsApproximatelyEqual(floBalanceBefore, floBalanceAfter)
    // FLO staking
    th.assertIsApproximatelyEqual(stakeAfter, stakeBefore)

    // Expect Alice has withdrawn all SEI gain
    const alice_pendingSEIGain = await stabilityPool.getDepositorSEIGain(alice)
    assert.equal(alice_pendingSEIGain, 0)
  })

  it('claimStakingGainsAndRecycle(): with only SEI gain', async () => {
    const price = toBN(dec(200, 18))

    // Whale opens Trove
    await openTrove({ extraSAIAmount: toBN(dec(1850, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })

    // Defaulter Trove opened
    const { saiAmount, netDebt, collateral } = await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })
    const borrowingFee = netDebt.sub(saiAmount)

    // alice opens trove and provides 150 SAI to StabilityPool
    await openTrove({ extraSAIAmount: toBN(dec(150, 18)), extraParams: { from: alice } })
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, { from: alice })

    // mint some FLO
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(whale), dec(1850, 18))
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(alice), dec(150, 18))

    // stake FLO
    await floStaking.stake(dec(1850, 18), { from: whale })
    await floStaking.stake(dec(150, 18), { from: alice })

    // skip bootstrapping phase
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

    // whale redeems 100 SAI
    const redeemedAmount = toBN(dec(100, 18))
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE)

    // Alice SEI gain is ((150/2000) * (redemption fee over redeemedAmount) / price)
    const redemptionFee = await troveManager.getRedemptionFeeWithDecay(redeemedAmount)
    const expectedSEIGain_A = redemptionFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18))).mul(mv._1e18BN).div(price)

    const seiBalanceBefore = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollBefore = await troveManager.getTroveColl(alice)
    const saiBalanceBefore = await saiToken.balanceOf(alice)
    const troveDebtBefore = await troveManager.getTroveDebt(alice)
    const floBalanceBefore = await floToken.balanceOf(alice)
    const ICRBefore = await troveManager.getCurrentICR(alice, price)
    const depositBefore = (await stabilityPool.deposits(alice))[0]
    const stakeBefore = await floStaking.stakes(alice)

    const proportionalSAI = expectedSEIGain_A.mul(price).div(ICRBefore)
    const borrowingRate = await troveManagerOriginal.getBorrowingRateWithDecay()
    const netDebtChange = proportionalSAI.mul(toBN(dec(1, 18))).div(toBN(dec(1, 18)).add(borrowingRate))

    const expectedFLOGain_A = toBN('839557069990108416000000')

    const proxyAddress = borrowerWrappers.getProxyAddressFromUser(alice)
    // Alice claims staking rewards and puts them back in the system through the proxy
    await borrowerWrappers.claimStakingGainsAndRecycle(th._100pct, alice, alice, { from: alice })

    // Alice new SAI gain due to her own Trove adjustment: ((150/2000) * (borrowing fee over netDebtChange))
    const newBorrowingFee = await troveManagerOriginal.getBorrowingFeeWithDecay(netDebtChange)
    const expectedNewSAIGain_A = newBorrowingFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18)))

    const seiBalanceAfter = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollAfter = await troveManager.getTroveColl(alice)
    const saiBalanceAfter = await saiToken.balanceOf(alice)
    const troveDebtAfter = await troveManager.getTroveDebt(alice)
    const floBalanceAfter = await floToken.balanceOf(alice)
    const ICRAfter = await troveManager.getCurrentICR(alice, price)
    const depositAfter = (await stabilityPool.deposits(alice))[0]
    const stakeAfter = await floStaking.stakes(alice)

    // check proxy balances remain the same
    assert.equal(seiBalanceAfter.toString(), seiBalanceBefore.toString())
    assert.equal(floBalanceAfter.toString(), floBalanceBefore.toString())
    // check proxy sai balance has increased by own adjust trove reward
    th.assertIsApproximatelyEqual(saiBalanceAfter, saiBalanceBefore.add(expectedNewSAIGain_A))
    // check trove has increased debt by the ICR proportional amount to SEI gain
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore.add(proportionalSAI), 10000)
    // check trove has increased collateral by the SEI gain
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore.add(expectedSEIGain_A))
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore)
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(depositAfter, depositBefore.add(netDebtChange), 10000)
    // check flo balance remains the same
    th.assertIsApproximatelyEqual(floBalanceBefore, floBalanceAfter)

    // FLO staking
    th.assertIsApproximatelyEqual(stakeAfter, stakeBefore.add(expectedFLOGain_A))

    // Expect Alice has withdrawn all SEI gain
    const alice_pendingSEIGain = await stabilityPool.getDepositorSEIGain(alice)
    assert.equal(alice_pendingSEIGain, 0)
  })

  it('claimStakingGainsAndRecycle(): with only SAI gain', async () => {
    const price = toBN(dec(200, 18))

    // Whale opens Trove
    await openTrove({ extraSAIAmount: toBN(dec(1850, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })

    // alice opens trove and provides 150 SAI to StabilityPool
    await openTrove({ extraSAIAmount: toBN(dec(150, 18)), extraParams: { from: alice } })
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, { from: alice })

    // mint some FLO
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(whale), dec(1850, 18))
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(alice), dec(150, 18))

    // stake FLO
    await floStaking.stake(dec(1850, 18), { from: whale })
    await floStaking.stake(dec(150, 18), { from: alice })

    // Defaulter Trove opened
    const { saiAmount, netDebt, collateral } = await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })
    const borrowingFee = netDebt.sub(saiAmount)

    // Alice SAI gain is ((150/2000) * borrowingFee)
    const expectedSAIGain_A = borrowingFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18)))

    const seiBalanceBefore = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollBefore = await troveManager.getTroveColl(alice)
    const saiBalanceBefore = await saiToken.balanceOf(alice)
    const troveDebtBefore = await troveManager.getTroveDebt(alice)
    const floBalanceBefore = await floToken.balanceOf(alice)
    const ICRBefore = await troveManager.getCurrentICR(alice, price)
    const depositBefore = (await stabilityPool.deposits(alice))[0]
    const stakeBefore = await floStaking.stakes(alice)

    const borrowingRate = await troveManagerOriginal.getBorrowingRateWithDecay()

    // Alice claims staking rewards and puts them back in the system through the proxy
    await borrowerWrappers.claimStakingGainsAndRecycle(th._100pct, alice, alice, { from: alice })

    const seiBalanceAfter = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollAfter = await troveManager.getTroveColl(alice)
    const saiBalanceAfter = await saiToken.balanceOf(alice)
    const troveDebtAfter = await troveManager.getTroveDebt(alice)
    const floBalanceAfter = await floToken.balanceOf(alice)
    const ICRAfter = await troveManager.getCurrentICR(alice, price)
    const depositAfter = (await stabilityPool.deposits(alice))[0]
    const stakeAfter = await floStaking.stakes(alice)

    // check proxy balances remain the same
    assert.equal(seiBalanceAfter.toString(), seiBalanceBefore.toString())
    assert.equal(floBalanceAfter.toString(), floBalanceBefore.toString())
    // check proxy sai balance has increased by own adjust trove reward
    th.assertIsApproximatelyEqual(saiBalanceAfter, saiBalanceBefore)
    // check trove has increased debt by the ICR proportional amount to SEI gain
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore, 10000)
    // check trove has increased collateral by the SEI gain
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore)
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore)
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(depositAfter, depositBefore.add(expectedSAIGain_A), 10000)
    // check flo balance remains the same
    th.assertIsApproximatelyEqual(floBalanceBefore, floBalanceAfter)

    // Expect Alice has withdrawn all SEI gain
    const alice_pendingSEIGain = await stabilityPool.getDepositorSEIGain(alice)
    assert.equal(alice_pendingSEIGain, 0)
  })

  it('claimStakingGainsAndRecycle(): with both SEI and SAI gains', async () => {
    const price = toBN(dec(200, 18))

    // Whale opens Trove
    await openTrove({ extraSAIAmount: toBN(dec(1850, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })

    // alice opens trove and provides 150 SAI to StabilityPool
    await openTrove({ extraSAIAmount: toBN(dec(150, 18)), extraParams: { from: alice } })
    await stabilityPool.provideToSP(dec(150, 18), ZERO_ADDRESS, { from: alice })

    // mint some FLO
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(whale), dec(1850, 18))
    await floTokenOriginal.unprotectedMint(borrowerOperations.getProxyAddressFromUser(alice), dec(150, 18))

    // stake FLO
    await floStaking.stake(dec(1850, 18), { from: whale })
    await floStaking.stake(dec(150, 18), { from: alice })

    // Defaulter Trove opened
    const { saiAmount, netDebt, collateral } = await openTrove({ ICR: toBN(dec(210, 16)), extraParams: { from: defaulter_1 } })
    const borrowingFee = netDebt.sub(saiAmount)

    // Alice SAI gain is ((150/2000) * borrowingFee)
    const expectedSAIGain_A = borrowingFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18)))

    // skip bootstrapping phase
    await th.fastForwardTime(timeValues.SECONDS_IN_ONE_WEEK * 2, web3.currentProvider)

    // whale redeems 100 SAI
    const redeemedAmount = toBN(dec(100, 18))
    await th.redeemCollateral(whale, contracts, redeemedAmount, GAS_PRICE)

    // Alice SEI gain is ((150/2000) * (redemption fee over redeemedAmount) / price)
    const redemptionFee = await troveManager.getRedemptionFeeWithDecay(redeemedAmount)
    const expectedSEIGain_A = redemptionFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18))).mul(mv._1e18BN).div(price)

    const seiBalanceBefore = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollBefore = await troveManager.getTroveColl(alice)
    const saiBalanceBefore = await saiToken.balanceOf(alice)
    const troveDebtBefore = await troveManager.getTroveDebt(alice)
    const floBalanceBefore = await floToken.balanceOf(alice)
    const ICRBefore = await troveManager.getCurrentICR(alice, price)
    const depositBefore = (await stabilityPool.deposits(alice))[0]
    const stakeBefore = await floStaking.stakes(alice)

    const proportionalSAI = expectedSEIGain_A.mul(price).div(ICRBefore)
    const borrowingRate = await troveManagerOriginal.getBorrowingRateWithDecay()
    const netDebtChange = proportionalSAI.mul(toBN(dec(1, 18))).div(toBN(dec(1, 18)).add(borrowingRate))
    const expectedTotalSAI = expectedSAIGain_A.add(netDebtChange)

    const expectedFLOGain_A = toBN('839557069990108416000000')

    // Alice claims staking rewards and puts them back in the system through the proxy
    await borrowerWrappers.claimStakingGainsAndRecycle(th._100pct, alice, alice, { from: alice })

    // Alice new SAI gain due to her own Trove adjustment: ((150/2000) * (borrowing fee over netDebtChange))
    const newBorrowingFee = await troveManagerOriginal.getBorrowingFeeWithDecay(netDebtChange)
    const expectedNewSAIGain_A = newBorrowingFee.mul(toBN(dec(150, 18))).div(toBN(dec(2000, 18)))

    const seiBalanceAfter = await web3.eth.getBalance(borrowerOperations.getProxyAddressFromUser(alice))
    const troveCollAfter = await troveManager.getTroveColl(alice)
    const saiBalanceAfter = await saiToken.balanceOf(alice)
    const troveDebtAfter = await troveManager.getTroveDebt(alice)
    const floBalanceAfter = await floToken.balanceOf(alice)
    const ICRAfter = await troveManager.getCurrentICR(alice, price)
    const depositAfter = (await stabilityPool.deposits(alice))[0]
    const stakeAfter = await floStaking.stakes(alice)

    // check proxy balances remain the same
    assert.equal(seiBalanceAfter.toString(), seiBalanceBefore.toString())
    assert.equal(floBalanceAfter.toString(), floBalanceBefore.toString())
    // check proxy sai balance has increased by own adjust trove reward
    th.assertIsApproximatelyEqual(saiBalanceAfter, saiBalanceBefore.add(expectedNewSAIGain_A))
    // check trove has increased debt by the ICR proportional amount to SEI gain
    th.assertIsApproximatelyEqual(troveDebtAfter, troveDebtBefore.add(proportionalSAI), 10000)
    // check trove has increased collateral by the SEI gain
    th.assertIsApproximatelyEqual(troveCollAfter, troveCollBefore.add(expectedSEIGain_A))
    // check that ICR remains constant
    th.assertIsApproximatelyEqual(ICRAfter, ICRBefore)
    // check that Stability Pool deposit
    th.assertIsApproximatelyEqual(depositAfter, depositBefore.add(expectedTotalSAI), 10000)
    // check flo balance remains the same
    th.assertIsApproximatelyEqual(floBalanceBefore, floBalanceAfter)

    // FLO staking
    th.assertIsApproximatelyEqual(stakeAfter, stakeBefore.add(expectedFLOGain_A))

    // Expect Alice has withdrawn all SEI gain
    const alice_pendingSEIGain = await stabilityPool.getDepositorSEIGain(alice)
    assert.equal(alice_pendingSEIGain, 0)
  })

})
