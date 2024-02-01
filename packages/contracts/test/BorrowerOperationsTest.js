const deploymentHelper = require("../utils/deploymentHelpers.js")
const testHelpers = require("../utils/testHelpers.js")

const BorrowerOperationsTester = artifacts.require("./BorrowerOperationsTester.sol")
const NonPayable = artifacts.require('NonPayable.sol')
const TroveManagerTester = artifacts.require("TroveManagerTester")
const SAITokenTester = artifacts.require("./SAITokenTester")

const th = testHelpers.TestHelper

const dec = th.dec
const toBN = th.toBN
const mv = testHelpers.MoneyValues
const timeValues = testHelpers.TimeValues

const ZERO_ADDRESS = th.ZERO_ADDRESS
const assertRevert = th.assertRevert

/* NOTE: Some of the borrowing tests do not test for specific SAI fee values. They only test that the
 * fees are non-zero when they should occur, and that they decay over time.
 *
 * Specific SAI fee values will depend on the final fee schedule used, and the final choice for
 *  the parameter MINUTE_DECAY_FACTOR in the TroveManager, which is still TBD based on economic
 * modelling.
 * 
 */

contract('BorrowerOperations', async accounts => {

  const [
    owner, alice, bob, carol, dennis, whale,
    A, B, C, D, E, F, G, H,
    // defaulter_1, defaulter_2,
    frontEnd_1, frontEnd_2, frontEnd_3] = accounts;

    const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

  // const frontEnds = [frontEnd_1, frontEnd_2, frontEnd_3]

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

  const getOpenTroveSAIAmount = async (totalDebt) => th.getOpenTroveSAIAmount(contracts, totalDebt)
  const getNetBorrowingAmount = async (debtWithFee) => th.getNetBorrowingAmount(contracts, debtWithFee)
  const getActualDebtFromComposite = async (compositeDebt) => th.getActualDebtFromComposite(compositeDebt, contracts)
  const openTrove = async (params) => th.openTrove(contracts, params)
  const getTroveEntireColl = async (trove) => th.getTroveEntireColl(contracts, trove)
  const getTroveEntireDebt = async (trove) => th.getTroveEntireDebt(contracts, trove)
  const getTroveStake = async (trove) => th.getTroveStake(contracts, trove)

  let SAI_GAS_COMPENSATION
  let MIN_NET_DEBT
  let BORROWING_FEE_FLOOR

  before(async () => {

  })

  const testCorpus = ({ withProxy = false }) => {
    beforeEach(async () => {
      contracts = await deploymentHelper.deployFluidCore()
      contracts.borrowerOperations = await BorrowerOperationsTester.new()
      contracts.troveManager = await TroveManagerTester.new()
      contracts = await deploymentHelper.deploySAITokenTester(contracts)
      const FLOContracts = await deploymentHelper.deployFLOTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisig)

      await deploymentHelper.connectFLOContracts(FLOContracts)
      await deploymentHelper.connectCoreContracts(contracts, FLOContracts)
      await deploymentHelper.connectFLOContractsToCore(FLOContracts, contracts)

      if (withProxy) {
        const users = [alice, bob, carol, dennis, whale, A, B, C, D, E]
        await deploymentHelper.deployProxyScripts(contracts, FLOContracts, owner, users)
      }

      priceFeed = contracts.priceFeedTestnet
      saiToken = contracts.saiToken
      sortedTroves = contracts.sortedTroves
      troveManager = contracts.troveManager
      activePool = contracts.activePool
      stabilityPool = contracts.stabilityPool
      defaultPool = contracts.defaultPool
      borrowerOperations = contracts.borrowerOperations
      hintHelpers = contracts.hintHelpers

      floStaking = FLOContracts.floStaking
      floToken = FLOContracts.floToken
      communityIssuance = FLOContracts.communityIssuance
      lockupContractFactory = FLOContracts.lockupContractFactory

      SAI_GAS_COMPENSATION = await borrowerOperations.SAI_GAS_COMPENSATION()
      MIN_NET_DEBT = await borrowerOperations.MIN_NET_DEBT()
      BORROWING_FEE_FLOOR = await borrowerOperations.BORROWING_FEE_FLOOR()
    })

    it("addColl(): reverts when top-up would leave trove with ICR < MCR", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

      // Price drops
      await priceFeed.setPrice(dec(100, 18))
      const price = await priceFeed.getPrice()

      assert.isFalse(await troveManager.checkRecoveryMode(price))
      assert.isTrue((await troveManager.getCurrentICR(alice, price)).lt(toBN(dec(110, 16))))

      const collTopUp = 1  // 1 wei top up

     await assertRevert(borrowerOperations.addColl(alice, alice, { from: alice, value: collTopUp }), 
      "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
    })

    it("addColl(): Increases the activePool SEI and raw Sei balance by correct amount", async () => {
      const { collateral: aliceColl } = await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const activePool_SEI_Before = await activePool.getSEI()
      const activePool_RawSei_Before = toBN(await web3.eth.getBalance(activePool.address))

      assert.isTrue(activePool_SEI_Before.eq(aliceColl))
      assert.isTrue(activePool_RawSei_Before.eq(aliceColl))

      await borrowerOperations.addColl(alice, alice, { from: alice, value: dec(1, 'ether') })

      const activePool_SEI_After = await activePool.getSEI()
      const activePool_RawSei_After = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_After.eq(aliceColl.add(toBN(dec(1, 'ether')))))
      assert.isTrue(activePool_RawSei_After.eq(aliceColl.add(toBN(dec(1, 'ether')))))
    })

    it("addColl(), active Trove: adds the correct collateral amount to the Trove", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const alice_Trove_Before = await troveManager.Troves(alice)
      const coll_before = alice_Trove_Before[1]
      const status_Before = alice_Trove_Before[3]

      // check status before
      assert.equal(status_Before, 1)

      // Alice adds second collateral
      await borrowerOperations.addColl(alice, alice, { from: alice, value: dec(1, 'ether') })

      const alice_Trove_After = await troveManager.Troves(alice)
      const coll_After = alice_Trove_After[1]
      const status_After = alice_Trove_After[3]

      // check coll increases by correct amount,and status remains active
      assert.isTrue(coll_After.eq(coll_before.add(toBN(dec(1, 'ether')))))
      assert.equal(status_After, 1)
    })

    it("addColl(), active Trove: Trove is in sortedList before and after", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // check Alice is in list before
      const aliceTroveInList_Before = await sortedTroves.contains(alice)
      const listIsEmpty_Before = await sortedTroves.isEmpty()
      assert.equal(aliceTroveInList_Before, true)
      assert.equal(listIsEmpty_Before, false)

      await borrowerOperations.addColl(alice, alice, { from: alice, value: dec(1, 'ether') })

      // check Alice is still in list after
      const aliceTroveInList_After = await sortedTroves.contains(alice)
      const listIsEmpty_After = await sortedTroves.isEmpty()
      assert.equal(aliceTroveInList_After, true)
      assert.equal(listIsEmpty_After, false)
    })

    it("addColl(), active Trove: updates the stake and updates the total stakes", async () => {
      //  Alice creates initial Trove with 1 sei
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const alice_Trove_Before = await troveManager.Troves(alice)
      const alice_Stake_Before = alice_Trove_Before[2]
      const totalStakes_Before = (await troveManager.totalStakes())

      assert.isTrue(totalStakes_Before.eq(alice_Stake_Before))

      // Alice tops up Trove collateral with 2 sei
      await borrowerOperations.addColl(alice, alice, { from: alice, value: dec(2, 'ether') })

      // Check stake and total stakes get updated
      const alice_Trove_After = await troveManager.Troves(alice)
      const alice_Stake_After = alice_Trove_After[2]
      const totalStakes_After = (await troveManager.totalStakes())

      assert.isTrue(alice_Stake_After.eq(alice_Stake_Before.add(toBN(dec(2, 'ether')))))
      assert.isTrue(totalStakes_After.eq(totalStakes_Before.add(toBN(dec(2, 'ether')))))
    })

    it("addColl(), active Trove: applies pending rewards and updates user's L_SEI, L_SAIDebt snapshots", async () => {
      // --- SETUP ---

      const { collateral: aliceCollBefore, totalDebt: aliceDebtBefore } = await openTrove({ extraSAIAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const { collateral: bobCollBefore, totalDebt: bobDebtBefore } = await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      // --- TEST ---

      // price drops to 1SEI:100SAI, reducing Carol's ICR below MCR
      await priceFeed.setPrice('100000000000000000000');

      // Liquidate Carol's Trove,
      const tx = await troveManager.liquidate(carol, { from: owner });

      assert.isFalse(await sortedTroves.contains(carol))

      const L_SEI = await troveManager.L_SEI()
      const L_SAIDebt = await troveManager.L_SAIDebt()

      // check Alice and Bob's reward snapshots are zero before they alter their Troves
      const alice_rewardSnapshot_Before = await troveManager.rewardSnapshots(alice)
      const alice_SEIrewardSnapshot_Before = alice_rewardSnapshot_Before[0]
      const alice_SAIDebtRewardSnapshot_Before = alice_rewardSnapshot_Before[1]

      const bob_rewardSnapshot_Before = await troveManager.rewardSnapshots(bob)
      const bob_SEIrewardSnapshot_Before = bob_rewardSnapshot_Before[0]
      const bob_SAIDebtRewardSnapshot_Before = bob_rewardSnapshot_Before[1]

      assert.equal(alice_SEIrewardSnapshot_Before, 0)
      assert.equal(alice_SAIDebtRewardSnapshot_Before, 0)
      assert.equal(bob_SEIrewardSnapshot_Before, 0)
      assert.equal(bob_SAIDebtRewardSnapshot_Before, 0)

      const alicePendingSEIReward = await troveManager.getPendingSEIReward(alice)
      const bobPendingSEIReward = await troveManager.getPendingSEIReward(bob)
      const alicePendingSAIDebtReward = await troveManager.getPendingSAIDebtReward(alice)
      const bobPendingSAIDebtReward = await troveManager.getPendingSAIDebtReward(bob)
      for (reward of [alicePendingSEIReward, bobPendingSEIReward, alicePendingSAIDebtReward, bobPendingSAIDebtReward]) {
        assert.isTrue(reward.gt(toBN('0')))
      }

      // Alice and Bob top up their Troves
      const aliceTopUp = toBN(dec(5, 'ether'))
      const bobTopUp = toBN(dec(1, 'ether'))

      await borrowerOperations.addColl(alice, alice, { from: alice, value: aliceTopUp })
      await borrowerOperations.addColl(bob, bob, { from: bob, value: bobTopUp })

      // Check that both alice and Bob have had pending rewards applied in addition to their top-ups. 
      const aliceNewColl = await getTroveEntireColl(alice)
      const aliceNewDebt = await getTroveEntireDebt(alice)
      const bobNewColl = await getTroveEntireColl(bob)
      const bobNewDebt = await getTroveEntireDebt(bob)

      assert.isTrue(aliceNewColl.eq(aliceCollBefore.add(alicePendingSEIReward).add(aliceTopUp)))
      assert.isTrue(aliceNewDebt.eq(aliceDebtBefore.add(alicePendingSAIDebtReward)))
      assert.isTrue(bobNewColl.eq(bobCollBefore.add(bobPendingSEIReward).add(bobTopUp)))
      assert.isTrue(bobNewDebt.eq(bobDebtBefore.add(bobPendingSAIDebtReward)))

      /* Check that both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
       to the latest values of L_SEI and L_SAIDebt */
      const alice_rewardSnapshot_After = await troveManager.rewardSnapshots(alice)
      const alice_SEIrewardSnapshot_After = alice_rewardSnapshot_After[0]
      const alice_SAIDebtRewardSnapshot_After = alice_rewardSnapshot_After[1]

      const bob_rewardSnapshot_After = await troveManager.rewardSnapshots(bob)
      const bob_SEIrewardSnapshot_After = bob_rewardSnapshot_After[0]
      const bob_SAIDebtRewardSnapshot_After = bob_rewardSnapshot_After[1]

      assert.isAtMost(th.getDifference(alice_SEIrewardSnapshot_After, L_SEI), 100)
      assert.isAtMost(th.getDifference(alice_SAIDebtRewardSnapshot_After, L_SAIDebt), 100)
      assert.isAtMost(th.getDifference(bob_SEIrewardSnapshot_After, L_SEI), 100)
      assert.isAtMost(th.getDifference(bob_SAIDebtRewardSnapshot_After, L_SAIDebt), 100)
    })

    // it("addColl(), active Trove: adds the right corrected stake after liquidations have occured", async () => {
    //  // TODO - check stake updates for addColl/withdrawColl/adustTrove ---

    //   // --- SETUP ---
    //   // A,B,C add 15/5/5 SEI, withdraw 100/100/900 SAI
    //   await borrowerOperations.openTrove(th._100pct, dec(100, 18), alice, alice, { from: alice, value: dec(15, 'ether') })
    //   await borrowerOperations.openTrove(th._100pct, dec(100, 18), bob, bob, { from: bob, value: dec(4, 'ether') })
    //   await borrowerOperations.openTrove(th._100pct, dec(900, 18), carol, carol, { from: carol, value: dec(5, 'ether') })

    //   await borrowerOperations.openTrove(th._100pct, 0, dennis, dennis, { from: dennis, value: dec(1, 'ether') })
    //   // --- TEST ---

    //   // price drops to 1SEI:100SAI, reducing Carol's ICR below MCR
    //   await priceFeed.setPrice('100000000000000000000');

    //   // close Carol's Trove, liquidating her 5 ether and 900SAI.
    //   await troveManager.liquidate(carol, { from: owner });

    //   // dennis tops up his trove by 1 SEI
    //   await borrowerOperations.addColl(dennis, dennis, { from: dennis, value: dec(1, 'ether') })

    //   /* Check that Dennis's recorded stake is the right corrected stake, less than his collateral. A corrected 
    //   stake is given by the formula: 

    //   s = totalStakesSnapshot / totalCollateralSnapshot 

    //   where snapshots are the values immediately after the last liquidation.  After Carol's liquidation, 
    //   the SEI from her Trove has now become the totalPendingSEIReward. So:

    //   totalStakes = (alice_Stake + bob_Stake + dennis_orig_stake ) = (15 + 4 + 1) =  20 SEI.
    //   totalCollateral = (alice_Collateral + bob_Collateral + dennis_orig_coll + totalPendingSEIReward) = (15 + 4 + 1 + 5)  = 25 SEI.

    //   Therefore, as Dennis adds 1 ether collateral, his corrected stake should be:  s = 2 * (20 / 25 ) = 1.6 SEI */
    //   const dennis_Trove = await troveManager.Troves(dennis)

    //   const dennis_Stake = dennis_Trove[2]
    //   console.log(dennis_Stake.toString())

    //   assert.isAtMost(th.getDifference(dennis_Stake), 100)
    // })

    it("addColl(), reverts if trove is non-existent or closed", async () => {
      // A, B open troves
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Carol attempts to add collateral to her non-existent trove
      try {
        const txCarol = await borrowerOperations.addColl(carol, carol, { from: carol, value: dec(1, 'ether') })
        assert.isFalse(txCarol.receipt.status)
      } catch (error) {
        assert.include(error.message, "revert")
        assert.include(error.message, "Trove does not exist or is closed")
      }

      // Price drops
      await priceFeed.setPrice(dec(100, 18))

      // Bob gets liquidated
      await troveManager.liquidate(bob)

      assert.isFalse(await sortedTroves.contains(bob))

      // Bob attempts to add collateral to his closed trove
      try {
        const txBob = await borrowerOperations.addColl(bob, bob, { from: bob, value: dec(1, 'ether') })
        assert.isFalse(txBob.receipt.status)
      } catch (error) {
        assert.include(error.message, "revert")
        assert.include(error.message, "Trove does not exist or is closed")
      }
    })

    it('addColl(): can add collateral in Recovery Mode', async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const aliceCollBefore = await getTroveEntireColl(alice)
      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice('105000000000000000000')

      assert.isTrue(await th.checkRecoveryMode(contracts))

      const collTopUp = toBN(dec(1, 'ether'))
      await borrowerOperations.addColl(alice, alice, { from: alice, value: collTopUp })

      // Check Alice's collateral
      const aliceCollAfter = (await troveManager.Troves(alice))[1]
      assert.isTrue(aliceCollAfter.eq(aliceCollBefore.add(collTopUp)))
    })

    // --- withdrawColl() ---

    it("withdrawColl(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

      // Price drops
      await priceFeed.setPrice(dec(100, 18))
      const price = await priceFeed.getPrice()

      assert.isFalse(await troveManager.checkRecoveryMode(price))
      assert.isTrue((await troveManager.getCurrentICR(alice, price)).lt(toBN(dec(110, 16))))

      const collWithdrawal = 1  // 1 wei withdrawal

     await assertRevert(borrowerOperations.withdrawColl(1, alice, alice, { from: alice }), 
      "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
    })

    // reverts when calling address does not have active trove  
    it("withdrawColl(): reverts when calling address does not have active trove", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Bob successfully withdraws some coll
      const txBob = await borrowerOperations.withdrawColl(dec(100, 'finney'), bob, bob, { from: bob })
      assert.isTrue(txBob.receipt.status)

      // Carol with no active trove attempts to withdraw
      try {
        const txCarol = await borrowerOperations.withdrawColl(dec(1, 'ether'), carol, carol, { from: carol })
        assert.isFalse(txCarol.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawColl(): reverts when system is in Recovery Mode", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      assert.isFalse(await th.checkRecoveryMode(contracts))

      // Withdrawal possible when recoveryMode == false
      const txAlice = await borrowerOperations.withdrawColl(1000, alice, alice, { from: alice })
      assert.isTrue(txAlice.receipt.status)

      await priceFeed.setPrice('105000000000000000000')

      assert.isTrue(await th.checkRecoveryMode(contracts))

      //Check withdrawal impossible when recoveryMode == true
      try {
        const txBob = await borrowerOperations.withdrawColl(1000, bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawColl(): reverts when requested SEI withdrawal is > the trove's collateral", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      const carolColl = await getTroveEntireColl(carol)
      const bobColl = await getTroveEntireColl(bob)
      // Carol withdraws exactly all her collateral
      await assertRevert(
        borrowerOperations.withdrawColl(carolColl, carol, carol, { from: carol }),
        'BorrowerOps: An operation that would result in ICR < MCR is not permitted'
      )

      // Bob attempts to withdraw 1 wei more than his collateral
      try {
        const txBob = await borrowerOperations.withdrawColl(bobColl.add(toBN(1)), bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawColl(): reverts when withdrawal would bring the user's ICR < MCR", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ ICR: toBN(dec(11, 17)), extraParams: { from: bob } }) // 110% ICR

      // Bob attempts to withdraws 1 wei, Which would leave him with < 110% ICR.

      try {
        const txBob = await borrowerOperations.withdrawColl(1, bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawColl(): reverts if system is in Recovery Mode", async () => {
      // --- SETUP ---

      // A and B open troves at 150% ICR
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: bob } })
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: alice } })

      const TCR = (await th.getTCR(contracts)).toString()
      assert.equal(TCR, '1500000000000000000')

      // --- TEST ---

      // price drops to 1SEI:150SAI, reducing TCR below 150%
      await priceFeed.setPrice('150000000000000000000');

      //Alice tries to withdraw collateral during Recovery Mode
      try {
        const txData = await borrowerOperations.withdrawColl('1', alice, alice, { from: alice })
        assert.isFalse(txData.receipt.status)
      } catch (err) {
        assert.include(err.message, 'revert')
      }
    })

    it("withdrawColl(): doesn’t allow a user to completely withdraw all collateral from their Trove (due to gas compensation)", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceColl = (await troveManager.getEntireDebtAndColl(alice))[1]

      // Check Trove is active
      const alice_Trove_Before = await troveManager.Troves(alice)
      const status_Before = alice_Trove_Before[3]
      assert.equal(status_Before, 1)
      assert.isTrue(await sortedTroves.contains(alice))

      // Alice attempts to withdraw all collateral
      await assertRevert(
        borrowerOperations.withdrawColl(aliceColl, alice, alice, { from: alice }),
        'BorrowerOps: An operation that would result in ICR < MCR is not permitted'
      )
    })

    it("withdrawColl(): leaves the Trove active when the user withdraws less than all the collateral", async () => {
      // Open Trove 
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // Check Trove is active
      const alice_Trove_Before = await troveManager.Troves(alice)
      const status_Before = alice_Trove_Before[3]
      assert.equal(status_Before, 1)
      assert.isTrue(await sortedTroves.contains(alice))

      // Withdraw some collateral
      await borrowerOperations.withdrawColl(dec(100, 'finney'), alice, alice, { from: alice })

      // Check Trove is still active
      const alice_Trove_After = await troveManager.Troves(alice)
      const status_After = alice_Trove_After[3]
      assert.equal(status_After, 1)
      assert.isTrue(await sortedTroves.contains(alice))
    })

    it("withdrawColl(): reduces the Trove's collateral by the correct amount", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const aliceCollBefore = await getTroveEntireColl(alice)

      // Alice withdraws 1 Sei
      await borrowerOperations.withdrawColl(dec(1, 'ether'), alice, alice, { from: alice })

      // Check 1 Sei remaining
      const alice_Trove_After = await troveManager.Troves(alice)
      const aliceCollAfter = await getTroveEntireColl(alice)

      assert.isTrue(aliceCollAfter.eq(aliceCollBefore.sub(toBN(dec(1, 'ether')))))
    })

    it("withdrawColl(): reduces ActivePool SEI and raw Sei by correct amount", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const aliceCollBefore = await getTroveEntireColl(alice)

      // check before
      const activePool_SEI_before = await activePool.getSEI()
      const activePool_RawSei_before = toBN(await web3.eth.getBalance(activePool.address))

      await borrowerOperations.withdrawColl(dec(1, 'ether'), alice, alice, { from: alice })

      // check after
      const activePool_SEI_After = await activePool.getSEI()
      const activePool_RawSei_After = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_After.eq(activePool_SEI_before.sub(toBN(dec(1, 'ether')))))
      assert.isTrue(activePool_RawSei_After.eq(activePool_RawSei_before.sub(toBN(dec(1, 'ether')))))
    })

    it("withdrawColl(): updates the stake and updates the total stakes", async () => {
      //  Alice creates initial Trove with 2 Sei
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice, value: toBN(dec(5, 'ether')) } })
      const aliceColl = await getTroveEntireColl(alice)
      assert.isTrue(aliceColl.gt(toBN('0')))

      const alice_Trove_Before = await troveManager.Troves(alice)
      const alice_Stake_Before = alice_Trove_Before[2]
      const totalStakes_Before = (await troveManager.totalStakes())

      assert.isTrue(alice_Stake_Before.eq(aliceColl))
      assert.isTrue(totalStakes_Before.eq(aliceColl))

      // Alice withdraws 1 Sei
      await borrowerOperations.withdrawColl(dec(1, 'ether'), alice, alice, { from: alice })

      // Check stake and total stakes get updated
      const alice_Trove_After = await troveManager.Troves(alice)
      const alice_Stake_After = alice_Trove_After[2]
      const totalStakes_After = (await troveManager.totalStakes())

      assert.isTrue(alice_Stake_After.eq(alice_Stake_Before.sub(toBN(dec(1, 'ether')))))
      assert.isTrue(totalStakes_After.eq(totalStakes_Before.sub(toBN(dec(1, 'ether')))))
    })

    it("withdrawColl(): sends the correct amount of SEI to the user", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice, value: dec(2, 'ether') } })

      const alice_SEIBalance_Before = toBN(web3.utils.toBN(await web3.eth.getBalance(alice)))
      await borrowerOperations.withdrawColl(dec(1, 'ether'), alice, alice, { from: alice, gasPrice: 0 })

      const alice_SEIBalance_After = toBN(web3.utils.toBN(await web3.eth.getBalance(alice)))
      const balanceDiff = alice_SEIBalance_After.sub(alice_SEIBalance_Before)

      assert.isTrue(balanceDiff.eq(toBN(dec(1, 'ether'))))
    })

    it("withdrawColl(): applies pending rewards and updates user's L_SEI, L_SAIDebt snapshots", async () => {
      // --- SETUP ---
      // Alice adds 15 Sei, Bob adds 5 Sei, Carol adds 1 Sei
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ ICR: toBN(dec(3, 18)), extraParams: { from: alice, value: toBN(dec(100, 'ether')) } })
      await openTrove({ ICR: toBN(dec(3, 18)), extraParams: { from: bob, value: toBN(dec(100, 'ether')) } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: carol, value: toBN(dec(10, 'ether')) } })

      const aliceCollBefore = await getTroveEntireColl(alice)
      const aliceDebtBefore = await getTroveEntireDebt(alice)
      const bobCollBefore = await getTroveEntireColl(bob)
      const bobDebtBefore = await getTroveEntireDebt(bob)

      // --- TEST ---

      // price drops to 1SEI:100SAI, reducing Carol's ICR below MCR
      await priceFeed.setPrice('100000000000000000000');

      // close Carol's Trove, liquidating her 1 Sei and 180SAI.
      await troveManager.liquidate(carol, { from: owner });

      const L_SEI = await troveManager.L_SEI()
      const L_SAIDebt = await troveManager.L_SAIDebt()

      // check Alice and Bob's reward snapshots are zero before they alter their Troves
      const alice_rewardSnapshot_Before = await troveManager.rewardSnapshots(alice)
      const alice_SEIrewardSnapshot_Before = alice_rewardSnapshot_Before[0]
      const alice_SAIDebtRewardSnapshot_Before = alice_rewardSnapshot_Before[1]

      const bob_rewardSnapshot_Before = await troveManager.rewardSnapshots(bob)
      const bob_SEIrewardSnapshot_Before = bob_rewardSnapshot_Before[0]
      const bob_SAIDebtRewardSnapshot_Before = bob_rewardSnapshot_Before[1]

      assert.equal(alice_SEIrewardSnapshot_Before, 0)
      assert.equal(alice_SAIDebtRewardSnapshot_Before, 0)
      assert.equal(bob_SEIrewardSnapshot_Before, 0)
      assert.equal(bob_SAIDebtRewardSnapshot_Before, 0)

      // Check A and B have pending rewards
      const pendingCollReward_A = await troveManager.getPendingSEIReward(alice)
      const pendingDebtReward_A = await troveManager.getPendingSAIDebtReward(alice)
      const pendingCollReward_B = await troveManager.getPendingSEIReward(bob)
      const pendingDebtReward_B = await troveManager.getPendingSAIDebtReward(bob)
      for (reward of [pendingCollReward_A, pendingDebtReward_A, pendingCollReward_B, pendingDebtReward_B]) {
        assert.isTrue(reward.gt(toBN('0')))
      }

      // Alice and Bob withdraw from their Troves
      const aliceCollWithdrawal = toBN(dec(5, 'ether'))
      const bobCollWithdrawal = toBN(dec(1, 'ether'))

      await borrowerOperations.withdrawColl(aliceCollWithdrawal, alice, alice, { from: alice })
      await borrowerOperations.withdrawColl(bobCollWithdrawal, bob, bob, { from: bob })

      // Check that both alice and Bob have had pending rewards applied in addition to their top-ups. 
      const aliceCollAfter = await getTroveEntireColl(alice)
      const aliceDebtAfter = await getTroveEntireDebt(alice)
      const bobCollAfter = await getTroveEntireColl(bob)
      const bobDebtAfter = await getTroveEntireDebt(bob)

      // Check rewards have been applied to troves
      th.assertIsApproximatelyEqual(aliceCollAfter, aliceCollBefore.add(pendingCollReward_A).sub(aliceCollWithdrawal), 10000)
      th.assertIsApproximatelyEqual(aliceDebtAfter, aliceDebtBefore.add(pendingDebtReward_A), 10000)
      th.assertIsApproximatelyEqual(bobCollAfter, bobCollBefore.add(pendingCollReward_B).sub(bobCollWithdrawal), 10000)
      th.assertIsApproximatelyEqual(bobDebtAfter, bobDebtBefore.add(pendingDebtReward_B), 10000)

      /* After top up, both Alice and Bob's snapshots of the rewards-per-unit-staked metrics should be updated
       to the latest values of L_SEI and L_SAIDebt */
      const alice_rewardSnapshot_After = await troveManager.rewardSnapshots(alice)
      const alice_SEIrewardSnapshot_After = alice_rewardSnapshot_After[0]
      const alice_SAIDebtRewardSnapshot_After = alice_rewardSnapshot_After[1]

      const bob_rewardSnapshot_After = await troveManager.rewardSnapshots(bob)
      const bob_SEIrewardSnapshot_After = bob_rewardSnapshot_After[0]
      const bob_SAIDebtRewardSnapshot_After = bob_rewardSnapshot_After[1]

      assert.isAtMost(th.getDifference(alice_SEIrewardSnapshot_After, L_SEI), 100)
      assert.isAtMost(th.getDifference(alice_SAIDebtRewardSnapshot_After, L_SAIDebt), 100)
      assert.isAtMost(th.getDifference(bob_SEIrewardSnapshot_After, L_SEI), 100)
      assert.isAtMost(th.getDifference(bob_SAIDebtRewardSnapshot_After, L_SAIDebt), 100)
    })

    // --- withdrawSAI() ---

    it("withdrawSAI(): reverts when withdrawal would leave trove with ICR < MCR", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

      // Price drops
      await priceFeed.setPrice(dec(100, 18))
      const price = await priceFeed.getPrice()

      assert.isFalse(await troveManager.checkRecoveryMode(price))
      assert.isTrue((await troveManager.getCurrentICR(alice, price)).lt(toBN(dec(110, 16))))

      const SAIwithdrawal = 1  // withdraw 1 wei SAI

     await assertRevert(borrowerOperations.withdrawSAI(th._100pct, SAIwithdrawal, alice, alice, { from: alice }), 
      "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
    })

    it("withdrawSAI(): decays a non-zero base rate", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(20, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(20, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(20, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
      await openTrove({ extraSAIAmount: toBN(dec(20, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      const A_SAIBal = await saiToken.balanceOf(A)

      // Artificially set base rate to 5%
      await troveManager.setBaseRate(dec(5, 16))

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D withdraws SAI
      await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), A, A, { from: D })

      // Check baseRate has decreased
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.lt(baseRate_1))

      // 1 hour passes
      th.fastForwardTime(3600, web3.currentProvider)

      // E withdraws SAI
      await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), A, A, { from: E })

      const baseRate_3 = await troveManager.baseRate()
      assert.isTrue(baseRate_3.lt(baseRate_2))
    })

    it("withdrawSAI(): reverts if max fee > 100%", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(20, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      await assertRevert(borrowerOperations.withdrawSAI(dec(2, 18), dec(1, 18), A, A, { from: A }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.withdrawSAI('1000000000000000001', dec(1, 18), A, A, { from: A }), "Max fee percentage must be between 0.5% and 100%")
    })

    it("withdrawSAI(): reverts if max fee < 0.5% in Normal mode", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(20, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      await assertRevert(borrowerOperations.withdrawSAI(0, dec(1, 18), A, A, { from: A }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.withdrawSAI(1, dec(1, 18), A, A, { from: A }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.withdrawSAI('4999999999999999', dec(1, 18), A, A, { from: A }), "Max fee percentage must be between 0.5% and 100%")
    })

    it("withdrawSAI(): reverts if fee exceeds max fee percentage", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(60, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(60, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(70, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(80, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
      await openTrove({ extraSAIAmount: toBN(dec(180, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      const totalSupply = await saiToken.totalSupply()

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      let baseRate = await troveManager.baseRate() // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))

      // 100%: 1e18,  10%: 1e17,  1%: 1e16,  0.1%: 1e15
      // 5%: 5e16
      // 0.5%: 5e15
      // actual: 0.5%, 5e15


      // SAIFee:                  15000000558793542
      // absolute _fee:            15000000558793542
      // actual feePercentage:      5000000186264514
      // user's _maxFeePercentage: 49999999999999999

      const lessThan5pct = '49999999999999999'
      await assertRevert(borrowerOperations.withdrawSAI(lessThan5pct, dec(3, 18), A, A, { from: A }), "Fee exceeded provided maximum")

      baseRate = await troveManager.baseRate() // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))
      // Attempt with maxFee 1%
      await assertRevert(borrowerOperations.withdrawSAI(dec(1, 16), dec(1, 18), A, A, { from: B }), "Fee exceeded provided maximum")

      baseRate = await troveManager.baseRate()  // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))
      // Attempt with maxFee 3.754%
      await assertRevert(borrowerOperations.withdrawSAI(dec(3754, 13), dec(1, 18), A, A, { from: C }), "Fee exceeded provided maximum")

      baseRate = await troveManager.baseRate()  // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))
      // Attempt with maxFee 0.5%%
      await assertRevert(borrowerOperations.withdrawSAI(dec(5, 15), dec(1, 18), A, A, { from: D }), "Fee exceeded provided maximum")
    })

    it("withdrawSAI(): succeeds when fee is less than max fee percentage", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(60, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(60, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(70, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(80, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
      await openTrove({ extraSAIAmount: toBN(dec(180, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      const totalSupply = await saiToken.totalSupply()

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      let baseRate = await troveManager.baseRate() // expect 5% base rate
      assert.isTrue(baseRate.eq(toBN(dec(5, 16))))

      // Attempt with maxFee > 5%
      const moreThan5pct = '50000000000000001'
      const tx1 = await borrowerOperations.withdrawSAI(moreThan5pct, dec(1, 18), A, A, { from: A })
      assert.isTrue(tx1.receipt.status)

      baseRate = await troveManager.baseRate() // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))

      // Attempt with maxFee = 5%
      const tx2 = await borrowerOperations.withdrawSAI(dec(5, 16), dec(1, 18), A, A, { from: B })
      assert.isTrue(tx2.receipt.status)

      baseRate = await troveManager.baseRate() // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))

      // Attempt with maxFee 10%
      const tx3 = await borrowerOperations.withdrawSAI(dec(1, 17), dec(1, 18), A, A, { from: C })
      assert.isTrue(tx3.receipt.status)

      baseRate = await troveManager.baseRate() // expect 5% base rate
      assert.equal(baseRate, dec(5, 16))

      // Attempt with maxFee 37.659%
      const tx4 = await borrowerOperations.withdrawSAI(dec(37659, 13), dec(1, 18), A, A, { from: D })
      assert.isTrue(tx4.receipt.status)

      // Attempt with maxFee 100%
      const tx5 = await borrowerOperations.withdrawSAI(dec(1, 18), dec(1, 18), A, A, { from: E })
      assert.isTrue(tx5.receipt.status)
    })

    it("withdrawSAI(): doesn't change base rate if it is already zero", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D withdraws SAI
      await borrowerOperations.withdrawSAI(th._100pct, dec(37, 18), A, A, { from: D })

      // Check baseRate is still 0
      const baseRate_2 = await troveManager.baseRate()
      assert.equal(baseRate_2, '0')

      // 1 hour passes
      th.fastForwardTime(3600, web3.currentProvider)

      // E opens trove 
      await borrowerOperations.withdrawSAI(th._100pct, dec(12, 18), A, A, { from: E })

      const baseRate_3 = await troveManager.baseRate()
      assert.equal(baseRate_3, '0')
    })

    it("withdrawSAI(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      const lastFeeOpTime_1 = await troveManager.lastFeeOperationTime()

      // 10 seconds pass
      th.fastForwardTime(10, web3.currentProvider)

      // Borrower C triggers a fee
      await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), C, C, { from: C })

      const lastFeeOpTime_2 = await troveManager.lastFeeOperationTime()

      // Check that the last fee operation time did not update, as borrower D's debt issuance occured
      // since before minimum interval had passed 
      assert.isTrue(lastFeeOpTime_2.eq(lastFeeOpTime_1))

      // 60 seconds passes
      th.fastForwardTime(60, web3.currentProvider)

      // Check that now, at least one minute has passed since lastFeeOpTime_1
      const timeNow = await th.getLatestBlockTimestamp(web3)
      assert.isTrue(toBN(timeNow).sub(lastFeeOpTime_1).gte(60))

      // Borrower C triggers a fee
      await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), C, C, { from: C })

      const lastFeeOpTime_3 = await troveManager.lastFeeOperationTime()

      // Check that the last fee operation time DID update, as borrower's debt issuance occured
      // after minimum interval had passed 
      assert.isTrue(lastFeeOpTime_3.gt(lastFeeOpTime_1))
    })


    it("withdrawSAI(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 30 seconds pass
      th.fastForwardTime(30, web3.currentProvider)

      // Borrower C triggers a fee, before decay interval has passed
      await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), C, C, { from: C })

      // 30 seconds pass
      th.fastForwardTime(30, web3.currentProvider)

      // Borrower C triggers another fee
      await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), C, C, { from: C })

      // Check base rate has decreased even though Borrower tried to stop it decaying
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.lt(baseRate_1))
    })

    it("withdrawSAI(): borrowing at non-zero base rate sends SAI fee to FLO staking contract", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO SAI balance before == 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStaking_SAIBalance_Before, '0')

      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D withdraws SAI
      await borrowerOperations.withdrawSAI(th._100pct, dec(37, 18), C, C, { from: D })

      // Check FLO SAI balance after has increased
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))
    })

    if (!withProxy) { // TODO: use rawLogs instead of logs
      it("withdrawSAI(): borrowing at non-zero base records the (drawn debt + fee) on the Trove struct", async () => {
        // time fast-forwards 1 year, and multisig stakes 1 FLO
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
        await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
        await floStaking.stake(dec(1, 18), { from: multisig })

        await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
        await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
        await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
        await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
        await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
        const D_debtBefore = await getTroveEntireDebt(D)

        // Artificially make baseRate 5%
        await troveManager.setBaseRate(dec(5, 16))
        await troveManager.setLastFeeOpTimeToNow()

        // Check baseRate is now non-zero
        const baseRate_1 = await troveManager.baseRate()
        assert.isTrue(baseRate_1.gt(toBN('0')))

        // 2 hours pass
        th.fastForwardTime(7200, web3.currentProvider)

        // D withdraws SAI
        const withdrawal_D = toBN(dec(37, 18))
        const withdrawalTx = await borrowerOperations.withdrawSAI(th._100pct, toBN(dec(37, 18)), D, D, { from: D })

        const emittedFee = toBN(th.getSAIFeeFromSAIBorrowingEvent(withdrawalTx))
        assert.isTrue(emittedFee.gt(toBN('0')))

        const newDebt = (await troveManager.Troves(D))[0]

        // Check debt on Trove struct equals initial debt + withdrawal + emitted fee
        th.assertIsApproximatelyEqual(newDebt, D_debtBefore.add(withdrawal_D).add(emittedFee), 10000)
      })
    }

    it("withdrawSAI(): Borrowing at non-zero base rate increases the FLO staking contract SAI fees-per-unit-staked", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO contract SAI fees-per-unit-staked is zero
      const F_SAI_Before = await floStaking.F_SAI()
      assert.equal(F_SAI_Before, '0')

      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D withdraws SAI
      await borrowerOperations.withdrawSAI(th._100pct, toBN(dec(37, 18)), D, D, { from: D })

      // Check FLO contract SAI fees-per-unit-staked has increased
      const F_SAI_After = await floStaking.F_SAI()
      assert.isTrue(F_SAI_After.gt(F_SAI_Before))
    })

    it("withdrawSAI(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO Staking contract balance before == 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStaking_SAIBalance_Before, '0')

      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      const D_SAIBalanceBefore = await saiToken.balanceOf(D)

      // D withdraws SAI
      const D_SAIRequest = toBN(dec(37, 18))
      await borrowerOperations.withdrawSAI(th._100pct, D_SAIRequest, D, D, { from: D })

      // Check FLO staking SAI balance has increased
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))

      // Check D's SAI balance now equals their initial balance plus request SAI
      const D_SAIBalanceAfter = await saiToken.balanceOf(D)
      assert.isTrue(D_SAIBalanceAfter.eq(D_SAIBalanceBefore.add(D_SAIRequest)))
    })

    it("withdrawSAI(): Borrowing at zero base rate changes SAI fees-per-unit-staked", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // A artificially receives FLO, then stakes it
      await floToken.unprotectedMint(A, dec(100, 18))
      await floStaking.stake(dec(100, 18), { from: A })

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // Check FLO SAI balance before == 0
      const F_SAI_Before = await floStaking.F_SAI()
      assert.equal(F_SAI_Before, '0')

      // D withdraws SAI
      await borrowerOperations.withdrawSAI(th._100pct, dec(37, 18), D, D, { from: D })

      // Check FLO SAI balance after > 0
      const F_SAI_After = await floStaking.F_SAI()
      assert.isTrue(F_SAI_After.gt('0'))
    })

    it("withdrawSAI(): Borrowing at zero base rate sends debt request to user", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      const D_SAIBalanceBefore = await saiToken.balanceOf(D)

      // D withdraws SAI
      const D_SAIRequest = toBN(dec(37, 18))
      await borrowerOperations.withdrawSAI(th._100pct, dec(37, 18), D, D, { from: D })

      // Check D's SAI balance now equals their requested SAI
      const D_SAIBalanceAfter = await saiToken.balanceOf(D)

      // Check D's trove debt == D's SAI balance + liquidation reserve
      assert.isTrue(D_SAIBalanceAfter.eq(D_SAIBalanceBefore.add(D_SAIRequest)))
    })

    it("withdrawSAI(): reverts when calling address does not have active trove", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Bob successfully withdraws SAI
      const txBob = await borrowerOperations.withdrawSAI(th._100pct, dec(100, 18), bob, bob, { from: bob })
      assert.isTrue(txBob.receipt.status)

      // Carol with no active trove attempts to withdraw SAI
      try {
        const txCarol = await borrowerOperations.withdrawSAI(th._100pct, dec(100, 18), carol, carol, { from: carol })
        assert.isFalse(txCarol.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawSAI(): reverts when requested withdrawal amount is zero SAI", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Bob successfully withdraws 1e-18 SAI
      const txBob = await borrowerOperations.withdrawSAI(th._100pct, 1, bob, bob, { from: bob })
      assert.isTrue(txBob.receipt.status)

      // Alice attempts to withdraw 0 SAI
      try {
        const txAlice = await borrowerOperations.withdrawSAI(th._100pct, 0, alice, alice, { from: alice })
        assert.isFalse(txAlice.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawSAI(): reverts when system is in Recovery Mode", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      assert.isFalse(await th.checkRecoveryMode(contracts))

      // Withdrawal possible when recoveryMode == false
      const txAlice = await borrowerOperations.withdrawSAI(th._100pct, dec(100, 18), alice, alice, { from: alice })
      assert.isTrue(txAlice.receipt.status)

      await priceFeed.setPrice('50000000000000000000')

      assert.isTrue(await th.checkRecoveryMode(contracts))

      //Check SAI withdrawal impossible when recoveryMode == true
      try {
        const txBob = await borrowerOperations.withdrawSAI(th._100pct, 1, bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawSAI(): reverts when withdrawal would bring the trove's ICR < MCR", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(11, 17)), extraParams: { from: bob } })

      // Bob tries to withdraw SAI that would bring his ICR < MCR
      try {
        const txBob = await borrowerOperations.withdrawSAI(th._100pct, 1, bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawSAI(): reverts when a withdrawal would cause the TCR of the system to fall below the CCR", async () => {
      await priceFeed.setPrice(dec(100, 18))
      const price = await priceFeed.getPrice()

      // Alice and Bob creates troves with 150% ICR.  System TCR = 150%.
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: bob } })

      var TCR = (await th.getTCR(contracts)).toString()
      assert.equal(TCR, '1500000000000000000')

      // Bob attempts to withdraw 1 SAI.
      // System TCR would be: ((3+3) * 100 ) / (200+201) = 600/401 = 149.62%, i.e. below CCR of 150%.
      try {
        const txBob = await borrowerOperations.withdrawSAI(th._100pct, dec(1, 18), bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("withdrawSAI(): reverts if system is in Recovery Mode", async () => {
      // --- SETUP ---
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: bob } })

      // --- TEST ---

      // price drops to 1SEI:150SAI, reducing TCR below 150%
      await priceFeed.setPrice('150000000000000000000');
      assert.isTrue((await th.getTCR(contracts)).lt(toBN(dec(15, 17))))

      try {
        const txData = await borrowerOperations.withdrawSAI(th._100pct, '200', alice, alice, { from: alice })
        assert.isFalse(txData.receipt.status)
      } catch (err) {
        assert.include(err.message, 'revert')
      }
    })

    it("withdrawSAI(): increases the Trove's SAI debt by the correct amount", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // check before
      const aliceDebtBefore = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtBefore.gt(toBN(0)))

      await borrowerOperations.withdrawSAI(th._100pct, await getNetBorrowingAmount(100), alice, alice, { from: alice })

      // check after
      const aliceDebtAfter = await getTroveEntireDebt(alice)
      th.assertIsApproximatelyEqual(aliceDebtAfter, aliceDebtBefore.add(toBN(100)))
    })

    it("withdrawSAI(): increases SAI debt in ActivePool by correct amount", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: alice, value: toBN(dec(100, 'ether')) } })

      const aliceDebtBefore = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtBefore.gt(toBN(0)))

      // check before
      const activePool_SAI_Before = await activePool.getSAIDebt()
      assert.isTrue(activePool_SAI_Before.eq(aliceDebtBefore))

      await borrowerOperations.withdrawSAI(th._100pct, await getNetBorrowingAmount(dec(10000, 18)), alice, alice, { from: alice })

      // check after
      const activePool_SAI_After = await activePool.getSAIDebt()
      th.assertIsApproximatelyEqual(activePool_SAI_After, activePool_SAI_Before.add(toBN(dec(10000, 18))))
    })

    it("withdrawSAI(): increases user SAIToken balance by correct amount", async () => {
      await openTrove({ extraParams: { value: toBN(dec(100, 'ether')), from: alice } })

      // check before
      const alice_SAITokenBalance_Before = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_Before.gt(toBN('0')))

      await borrowerOperations.withdrawSAI(th._100pct, dec(10000, 18), alice, alice, { from: alice })

      // check after
      const alice_SAITokenBalance_After = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_After.eq(alice_SAITokenBalance_Before.add(toBN(dec(10000, 18)))))
    })

    // --- repaySAI() ---
    it("repaySAI(): reverts when repayment would leave trove with ICR < MCR", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

      // Price drops
      await priceFeed.setPrice(dec(100, 18))
      const price = await priceFeed.getPrice()

      assert.isFalse(await troveManager.checkRecoveryMode(price))
      assert.isTrue((await troveManager.getCurrentICR(alice, price)).lt(toBN(dec(110, 16))))

      const SAIRepayment = 1  // 1 wei repayment

     await assertRevert(borrowerOperations.repaySAI(SAIRepayment, alice, alice, { from: alice }), 
      "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
    })

    it("repaySAI(): Succeeds when it would leave trove with net debt >= minimum net debt", async () => {
      // Make the SAI request 2 wei above min net debt to correct for floor division, and make net debt = min net debt + 1 wei
      await borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN('2'))), A, A, { from: A, value: dec(100, 30) })

      const repayTxA = await borrowerOperations.repaySAI(1, A, A, { from: A })
      assert.isTrue(repayTxA.receipt.status)

      await borrowerOperations.openTrove(th._100pct, dec(20, 25), B, B, { from: B, value: dec(100, 30) })

      const repayTxB = await borrowerOperations.repaySAI(dec(19, 25), B, B, { from: B })
      assert.isTrue(repayTxB.receipt.status)
    })

    it("repaySAI(): reverts when it would leave trove with net debt < minimum net debt", async () => {
      // Make the SAI request 2 wei above min net debt to correct for floor division, and make net debt = min net debt + 1 wei
      await borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN('2'))), A, A, { from: A, value: dec(100, 30) })

      const repayTxAPromise = borrowerOperations.repaySAI(2, A, A, { from: A })
      await assertRevert(repayTxAPromise, "BorrowerOps: Trove's net debt must be greater than minimum")
    })

    it("adjustTrove(): Reverts if repaid amount is greater than current debt", async () => {
      const { totalDebt } = await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })
      SAI_GAS_COMPENSATION = await borrowerOperations.SAI_GAS_COMPENSATION()
      const repayAmount = totalDebt.sub(SAI_GAS_COMPENSATION).add(toBN(1))
      await openTrove({ extraSAIAmount: repayAmount, ICR: toBN(dec(150, 16)), extraParams: { from: bob } })

      await saiToken.transfer(alice, repayAmount, { from: bob })

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, repayAmount, false, alice, alice, { from: alice }),
                         "SafeMath: subtraction overflow")
    })

    it("repaySAI(): reverts when calling address does not have active trove", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      // Bob successfully repays some SAI
      const txBob = await borrowerOperations.repaySAI(dec(10, 18), bob, bob, { from: bob })
      assert.isTrue(txBob.receipt.status)

      // Carol with no active trove attempts to repaySAI
      try {
        const txCarol = await borrowerOperations.repaySAI(dec(10, 18), carol, carol, { from: carol })
        assert.isFalse(txCarol.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("repaySAI(): reverts when attempted repayment is > the debt of the trove", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const aliceDebt = await getTroveEntireDebt(alice)

      // Bob successfully repays some SAI
      const txBob = await borrowerOperations.repaySAI(dec(10, 18), bob, bob, { from: bob })
      assert.isTrue(txBob.receipt.status)

      // Alice attempts to repay more than her debt
      try {
        const txAlice = await borrowerOperations.repaySAI(aliceDebt.add(toBN(dec(1, 18))), alice, alice, { from: alice })
        assert.isFalse(txAlice.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    //repaySAI: reduces SAI debt in Trove
    it("repaySAI(): reduces the Trove's SAI debt by the correct amount", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const aliceDebtBefore = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtBefore.gt(toBN('0')))

      await borrowerOperations.repaySAI(aliceDebtBefore.div(toBN(10)), alice, alice, { from: alice })  // Repays 1/10 her debt

      const aliceDebtAfter = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtAfter.gt(toBN('0')))

      th.assertIsApproximatelyEqual(aliceDebtAfter, aliceDebtBefore.mul(toBN(9)).div(toBN(10)))  // check 9/10 debt remaining
    })

    it("repaySAI(): decreases SAI debt in ActivePool by correct amount", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const aliceDebtBefore = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtBefore.gt(toBN('0')))

      // Check before
      const activePool_SAI_Before = await activePool.getSAIDebt()
      assert.isTrue(activePool_SAI_Before.gt(toBN('0')))

      await borrowerOperations.repaySAI(aliceDebtBefore.div(toBN(10)), alice, alice, { from: alice })  // Repays 1/10 her debt

      // check after
      const activePool_SAI_After = await activePool.getSAIDebt()
      th.assertIsApproximatelyEqual(activePool_SAI_After, activePool_SAI_Before.sub(aliceDebtBefore.div(toBN(10))))
    })

    it("repaySAI(): decreases user SAIToken balance by correct amount", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const aliceDebtBefore = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtBefore.gt(toBN('0')))

      // check before
      const alice_SAITokenBalance_Before = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_Before.gt(toBN('0')))

      await borrowerOperations.repaySAI(aliceDebtBefore.div(toBN(10)), alice, alice, { from: alice })  // Repays 1/10 her debt

      // check after
      const alice_SAITokenBalance_After = await saiToken.balanceOf(alice)
      th.assertIsApproximatelyEqual(alice_SAITokenBalance_After, alice_SAITokenBalance_Before.sub(aliceDebtBefore.div(toBN(10))))
    })

    it('repaySAI(): can repay debt in Recovery Mode', async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const aliceDebtBefore = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebtBefore.gt(toBN('0')))

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice('105000000000000000000')

      assert.isTrue(await th.checkRecoveryMode(contracts))

      const tx = await borrowerOperations.repaySAI(aliceDebtBefore.div(toBN(10)), alice, alice, { from: alice })
      assert.isTrue(tx.receipt.status)

      // Check Alice's debt: 110 (initial) - 50 (repaid)
      const aliceDebtAfter = await getTroveEntireDebt(alice)
      th.assertIsApproximatelyEqual(aliceDebtAfter, aliceDebtBefore.mul(toBN(9)).div(toBN(10)))
    })

    it("repaySAI(): Reverts if borrower has insufficient SAI balance to cover his debt repayment", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      const bobBalBefore = await saiToken.balanceOf(B)
      assert.isTrue(bobBalBefore.gt(toBN('0')))

      // Bob transfers all but 5 of his SAI to Carol
      await saiToken.transfer(C, bobBalBefore.sub((toBN(dec(5, 18)))), { from: B })

      //Confirm B's SAI balance has decreased to 5 SAI
      const bobBalAfter = await saiToken.balanceOf(B)

      assert.isTrue(bobBalAfter.eq(toBN(dec(5, 18))))
      
      // Bob tries to repay 6 SAI
      const repaySAIPromise_B = borrowerOperations.repaySAI(toBN(dec(6, 18)), B, B, { from: B })

      await assertRevert(repaySAIPromise_B, "Caller doesnt have enough SAI to make repayment")
    })

    // --- adjustTrove() ---

    it("adjustTrove(): reverts when adjustment would leave trove with ICR < MCR", async () => {
      // alice creates a Trove and adds first collateral
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

      // Price drops
      await priceFeed.setPrice(dec(100, 18))
      const price = await priceFeed.getPrice()

      assert.isFalse(await troveManager.checkRecoveryMode(price))
      assert.isTrue((await troveManager.getCurrentICR(alice, price)).lt(toBN(dec(110, 16))))

      const SAIRepayment = 1  // 1 wei repayment
      const collTopUp = 1

     await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, SAIRepayment, false, alice, alice, { from: alice, value: collTopUp }), 
      "BorrowerOps: An operation that would result in ICR < MCR is not permitted")
    })

    it("adjustTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })

      await assertRevert(borrowerOperations.adjustTrove(0, 0, dec(1, 18), true, A, A, { from: A, value: dec(2, 16) }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.adjustTrove(1, 0, dec(1, 18), true, A, A, { from: A, value: dec(2, 16) }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.adjustTrove('4999999999999999', 0, dec(1, 18), true, A, A, { from: A, value: dec(2, 16) }), "Max fee percentage must be between 0.5% and 100%")
    })

    it("adjustTrove(): allows max fee < 0.5% in Recovery mode", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: whale, value: toBN(dec(100, 'ether')) } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })

      await priceFeed.setPrice(dec(120, 18))
      assert.isTrue(await th.checkRecoveryMode(contracts))

      await borrowerOperations.adjustTrove(0, 0, dec(1, 9), true, A, A, { from: A, value: dec(300, 18) })
      await priceFeed.setPrice(dec(1, 18))
      assert.isTrue(await th.checkRecoveryMode(contracts))
      await borrowerOperations.adjustTrove(1, 0, dec(1, 9), true, A, A, { from: A, value: dec(30000, 18) })
      await priceFeed.setPrice(dec(1, 16))
      assert.isTrue(await th.checkRecoveryMode(contracts))
      await borrowerOperations.adjustTrove('4999999999999999', 0, dec(1, 9), true, A, A, { from: A, value: dec(3000000, 18) })
    })

    it("adjustTrove(): decays a non-zero base rate", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 18), true, D, D, { from: D })

      // Check baseRate has decreased
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.lt(baseRate_1))

      // 1 hour passes
      th.fastForwardTime(3600, web3.currentProvider)

      // E adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 15), true, E, E, { from: D })

      const baseRate_3 = await troveManager.baseRate()
      assert.isTrue(baseRate_3.lt(baseRate_2))
    })

    it("adjustTrove(): doesn't decay a non-zero base rate when user issues 0 debt", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // D opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D adjusts trove with 0 debt
      await borrowerOperations.adjustTrove(th._100pct, 0, 0, false, D, D, { from: D, value: dec(1, 'ether') })

      // Check baseRate has not decreased 
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.eq(baseRate_1))
    })

    it("adjustTrove(): doesn't change base rate if it is already zero", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 18), true, D, D, { from: D })

      // Check baseRate is still 0
      const baseRate_2 = await troveManager.baseRate()
      assert.equal(baseRate_2, '0')

      // 1 hour passes
      th.fastForwardTime(3600, web3.currentProvider)

      // E adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 15), true, E, E, { from: D })

      const baseRate_3 = await troveManager.baseRate()
      assert.equal(baseRate_3, '0')
    })

    it("adjustTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      const lastFeeOpTime_1 = await troveManager.lastFeeOperationTime()

      // 10 seconds pass
      th.fastForwardTime(10, web3.currentProvider)

      // Borrower C triggers a fee
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, C, C, { from: C })

      const lastFeeOpTime_2 = await troveManager.lastFeeOperationTime()

      // Check that the last fee operation time did not update, as borrower D's debt issuance occured
      // since before minimum interval had passed 
      assert.isTrue(lastFeeOpTime_2.eq(lastFeeOpTime_1))

      // 60 seconds passes
      th.fastForwardTime(60, web3.currentProvider)

      // Check that now, at least one minute has passed since lastFeeOpTime_1
      const timeNow = await th.getLatestBlockTimestamp(web3)
      assert.isTrue(toBN(timeNow).sub(lastFeeOpTime_1).gte(60))

      // Borrower C triggers a fee
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, C, C, { from: C })

      const lastFeeOpTime_3 = await troveManager.lastFeeOperationTime()

      // Check that the last fee operation time DID update, as borrower's debt issuance occured
      // after minimum interval had passed 
      assert.isTrue(lastFeeOpTime_3.gt(lastFeeOpTime_1))
    })

    it("adjustTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // Borrower C triggers a fee, before decay interval of 1 minute has passed
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, C, C, { from: C })

      // 1 minute passes
      th.fastForwardTime(60, web3.currentProvider)

      // Borrower C triggers another fee
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, C, C, { from: C })

      // Check base rate has decreased even though Borrower tried to stop it decaying
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.lt(baseRate_1))
    })

    it("adjustTrove(): borrowing at non-zero base rate sends SAI fee to FLO staking contract", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO SAI balance before == 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStaking_SAIBalance_Before, '0')

      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D adjusts trove
      await openTrove({ extraSAIAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check FLO SAI balance after has increased
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))
    })

    if (!withProxy) { // TODO: use rawLogs instead of logs
      it("adjustTrove(): borrowing at non-zero base records the (drawn debt + fee) on the Trove struct", async () => {
        // time fast-forwards 1 year, and multisig stakes 1 FLO
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
        await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
        await floStaking.stake(dec(1, 18), { from: multisig })

        await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
        await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
        await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
        await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
        await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })
        const D_debtBefore = await getTroveEntireDebt(D)

        // Artificially make baseRate 5%
        await troveManager.setBaseRate(dec(5, 16))
        await troveManager.setLastFeeOpTimeToNow()

        // Check baseRate is now non-zero
        const baseRate_1 = await troveManager.baseRate()
        assert.isTrue(baseRate_1.gt(toBN('0')))

        // 2 hours pass
        th.fastForwardTime(7200, web3.currentProvider)

        const withdrawal_D = toBN(dec(37, 18))

        // D withdraws SAI
        const adjustmentTx = await borrowerOperations.adjustTrove(th._100pct, 0, withdrawal_D, true, D, D, { from: D })

        const emittedFee = toBN(th.getSAIFeeFromSAIBorrowingEvent(adjustmentTx))
        assert.isTrue(emittedFee.gt(toBN('0')))

        const D_newDebt = (await troveManager.Troves(D))[0]
    
        // Check debt on Trove struct equals initila debt plus drawn debt plus emitted fee
        assert.isTrue(D_newDebt.eq(D_debtBefore.add(withdrawal_D).add(emittedFee)))
      })
    }

    it("adjustTrove(): Borrowing at non-zero base rate increases the FLO staking contract SAI fees-per-unit-staked", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO contract SAI fees-per-unit-staked is zero
      const F_SAI_Before = await floStaking.F_SAI()
      assert.equal(F_SAI_Before, '0')

      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 18), true, D, D, { from: D })

      // Check FLO contract SAI fees-per-unit-staked has increased
      const F_SAI_After = await floStaking.F_SAI()
      assert.isTrue(F_SAI_After.gt(F_SAI_Before))
    })

    it("adjustTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO Staking contract balance before == 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStaking_SAIBalance_Before, '0')

      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      const D_SAIBalanceBefore = await saiToken.balanceOf(D)

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D adjusts trove
      const SAIRequest_D = toBN(dec(40, 18))
      await borrowerOperations.adjustTrove(th._100pct, 0, SAIRequest_D, true, D, D, { from: D })

      // Check FLO staking SAI balance has increased
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))

      // Check D's SAI balance has increased by their requested SAI
      const D_SAIBalanceAfter = await saiToken.balanceOf(D)
      assert.isTrue(D_SAIBalanceAfter.eq(D_SAIBalanceBefore.add(SAIRequest_D)))
    })

    it("adjustTrove(): Borrowing at zero base rate changes SAI balance of FLO staking contract", async () => {
      await openTrove({ ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(30, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(50, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // Check staking SAI balance before > 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_Before.gt(toBN('0')))

      // D adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 18), true, D, D, { from: D })

      // Check staking SAI balance after > staking balance before
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))
    })

    it("adjustTrove(): Borrowing at zero base rate changes FLO staking contract SAI fees-per-unit-staked", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale, value: toBN(dec(100, 'ether')) } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // A artificially receives FLO, then stakes it
      await floToken.unprotectedMint(A, dec(100, 18))
      await floStaking.stake(dec(100, 18), { from: A })

      // Check staking SAI balance before == 0
      const F_SAI_Before = await floStaking.F_SAI()
      assert.isTrue(F_SAI_Before.eq(toBN('0')))

      // D adjusts trove
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(37, 18), true, D, D, { from: D })

      // Check staking SAI balance increases
      const F_SAI_After = await floStaking.F_SAI()
      assert.isTrue(F_SAI_After.gt(F_SAI_Before))
    })

    it("adjustTrove(): Borrowing at zero base rate sends total requested SAI to the user", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale, value: toBN(dec(100, 'ether')) } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      const D_SAIBalBefore = await saiToken.balanceOf(D)
      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      const DUSDBalanceBefore = await saiToken.balanceOf(D)

      // D adjusts trove
      const SAIRequest_D = toBN(dec(40, 18))
      await borrowerOperations.adjustTrove(th._100pct, 0, SAIRequest_D, true, D, D, { from: D })

      // Check D's SAI balance increased by their requested SAI
      const SAIBalanceAfter = await saiToken.balanceOf(D)
      assert.isTrue(SAIBalanceAfter.eq(D_SAIBalBefore.add(SAIRequest_D)))
    })

    it("adjustTrove(): reverts when calling address has no active trove", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Alice coll and debt increase(+1 SEI, +50SAI)
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, alice, alice, { from: alice, value: dec(1, 'ether') })

      try {
        const txCarol = await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, carol, carol, { from: carol, value: dec(1, 'ether') })
        assert.isFalse(txCarol.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("adjustTrove(): reverts in Recovery Mode when the adjustment would reduce the TCR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      assert.isFalse(await th.checkRecoveryMode(contracts))

      const txAlice = await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, alice, alice, { from: alice, value: dec(1, 'ether') })
      assert.isTrue(txAlice.receipt.status)

      await priceFeed.setPrice(dec(120, 18)) // trigger drop in SEI price

      assert.isTrue(await th.checkRecoveryMode(contracts))

      try { // collateral withdrawal should also fail
        const txAlice = await borrowerOperations.adjustTrove(th._100pct, dec(1, 'ether'), 0, false, alice, alice, { from: alice })
        assert.isFalse(txAlice.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }

      try { // debt increase should fail
        const txBob = await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }

      try { // debt increase that's also a collateral increase should also fail, if ICR will be worse off
        const txBob = await borrowerOperations.adjustTrove(th._100pct, 0, dec(111, 18), true, bob, bob, { from: bob, value: dec(1, 'ether') })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("adjustTrove(): collateral withdrawal reverts in Recovery Mode", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice(dec(120, 18)) // trigger drop in SEI price

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // Alice attempts an adjustment that repays half her debt BUT withdraws 1 wei collateral, and fails
      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 1, dec(5000, 18), false, alice, alice, { from: alice }),
        "BorrowerOps: Collateral withdrawal not permitted Recovery Mode")
    })

    it("adjustTrove(): debt increase that would leave ICR < 150% reverts in Recovery Mode", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const CCR = await troveManager.CCR()

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice(dec(120, 18)) // trigger drop in SEI price
      const price = await priceFeed.getPrice()

      assert.isTrue(await th.checkRecoveryMode(contracts))

      const ICR_A = await troveManager.getCurrentICR(alice, price)

      const aliceDebt = await getTroveEntireDebt(alice)
      const aliceColl = await getTroveEntireColl(alice)
      const debtIncrease = toBN(dec(50, 18))
      const collIncrease = toBN(dec(1, 'ether'))

      // Check the new ICR would be an improvement, but less than the CCR (150%)
      const newICR = await troveManager.computeICR(aliceColl.add(collIncrease), aliceDebt.add(debtIncrease), price)

      assert.isTrue(newICR.gt(ICR_A) && newICR.lt(CCR))

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, debtIncrease, true, alice, alice, { from: alice, value: collIncrease }),
        "BorrowerOps: Operation must leave trove with ICR >= CCR")
    })

    it("adjustTrove(): debt increase that would reduce the ICR reverts in Recovery Mode", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(3, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const CCR = await troveManager.CCR()

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice(dec(105, 18)) // trigger drop in SEI price
      const price = await priceFeed.getPrice()

      assert.isTrue(await th.checkRecoveryMode(contracts))

      //--- Alice with ICR > 150% tries to reduce her ICR ---

      const ICR_A = await troveManager.getCurrentICR(alice, price)

      // Check Alice's initial ICR is above 150%
      assert.isTrue(ICR_A.gt(CCR))

      const aliceDebt = await getTroveEntireDebt(alice)
      const aliceColl = await getTroveEntireColl(alice)
      const aliceDebtIncrease = toBN(dec(150, 18))
      const aliceCollIncrease = toBN(dec(1, 'ether'))

      const newICR_A = await troveManager.computeICR(aliceColl.add(aliceCollIncrease), aliceDebt.add(aliceDebtIncrease), price)

      // Check Alice's new ICR would reduce but still be greater than 150%
      assert.isTrue(newICR_A.lt(ICR_A) && newICR_A.gt(CCR))

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, aliceDebtIncrease, true, alice, alice, { from: alice, value: aliceCollIncrease }),
        "BorrowerOps: Cannot decrease your Trove's ICR in Recovery Mode")

      //--- Bob with ICR < 150% tries to reduce his ICR ---

      const ICR_B = await troveManager.getCurrentICR(bob, price)

      // Check Bob's initial ICR is below 150%
      assert.isTrue(ICR_B.lt(CCR))

      const bobDebt = await getTroveEntireDebt(bob)
      const bobColl = await getTroveEntireColl(bob)
      const bobDebtIncrease = toBN(dec(450, 18))
      const bobCollIncrease = toBN(dec(1, 'ether'))

      const newICR_B = await troveManager.computeICR(bobColl.add(bobCollIncrease), bobDebt.add(bobDebtIncrease), price)

      // Check Bob's new ICR would reduce 
      assert.isTrue(newICR_B.lt(ICR_B))

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, bobDebtIncrease, true, bob, bob, { from: bob, value: bobCollIncrease }),
        " BorrowerOps: Operation must leave trove with ICR >= CCR")
    })

    it("adjustTrove(): A trove with ICR < CCR in Recovery Mode can adjust their trove to ICR > CCR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const CCR = await troveManager.CCR()

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice(dec(100, 18)) // trigger drop in SEI price
      const price = await priceFeed.getPrice()

      assert.isTrue(await th.checkRecoveryMode(contracts))

      const ICR_A = await troveManager.getCurrentICR(alice, price)
      // Check initial ICR is below 150%
      assert.isTrue(ICR_A.lt(CCR))

      const aliceDebt = await getTroveEntireDebt(alice)
      const aliceColl = await getTroveEntireColl(alice)
      const debtIncrease = toBN(dec(5000, 18))
      const collIncrease = toBN(dec(150, 'ether'))

      const newICR = await troveManager.computeICR(aliceColl.add(collIncrease), aliceDebt.add(debtIncrease), price)

      // Check new ICR would be > 150%
      assert.isTrue(newICR.gt(CCR))

      const tx = await borrowerOperations.adjustTrove(th._100pct, 0, debtIncrease, true, alice, alice, { from: alice, value: collIncrease })
      assert.isTrue(tx.receipt.status)

      const actualNewICR = await troveManager.getCurrentICR(alice, price)
      assert.isTrue(actualNewICR.gt(CCR))
    })

    it("adjustTrove(): A trove with ICR > CCR in Recovery Mode can improve their ICR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(3, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      const CCR = await troveManager.CCR()

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice(dec(105, 18)) // trigger drop in SEI price
      const price = await priceFeed.getPrice()

      assert.isTrue(await th.checkRecoveryMode(contracts))

      const initialICR = await troveManager.getCurrentICR(alice, price)
      // Check initial ICR is above 150%
      assert.isTrue(initialICR.gt(CCR))

      const aliceDebt = await getTroveEntireDebt(alice)
      const aliceColl = await getTroveEntireColl(alice)
      const debtIncrease = toBN(dec(5000, 18))
      const collIncrease = toBN(dec(150, 'ether'))

      const newICR = await troveManager.computeICR(aliceColl.add(collIncrease), aliceDebt.add(debtIncrease), price)

      // Check new ICR would be > old ICR
      assert.isTrue(newICR.gt(initialICR))

      const tx = await borrowerOperations.adjustTrove(th._100pct, 0, debtIncrease, true, alice, alice, { from: alice, value: collIncrease })
      assert.isTrue(tx.receipt.status)

      const actualNewICR = await troveManager.getCurrentICR(alice, price)
      assert.isTrue(actualNewICR.gt(initialICR))
    })

    it("adjustTrove(): debt increase in Recovery Mode charges no fee", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(200000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      assert.isFalse(await th.checkRecoveryMode(contracts))

      await priceFeed.setPrice(dec(120, 18)) // trigger drop in SEI price

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // B stakes FLO
      await floToken.unprotectedMint(bob, dec(100, 18))
      await floStaking.stake(dec(100, 18), { from: bob })

      const floStakingSAIBalanceBefore = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStakingSAIBalanceBefore.gt(toBN('0')))

      const txAlice = await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, alice, alice, { from: alice, value: dec(100, 'ether') })
      assert.isTrue(txAlice.receipt.status)

      // Check emitted fee = 0
      const emittedFee = toBN(await th.getEventArgByName(txAlice, 'SAIBorrowingFeePaid', '_SAIFee'))
      assert.isTrue(emittedFee.eq(toBN('0')))

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // Check no fee was sent to staking contract
      const floStakingSAIBalanceAfter = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStakingSAIBalanceAfter.toString(), floStakingSAIBalanceBefore.toString())
    })

    it("adjustTrove(): reverts when change would cause the TCR of the system to fall below the CCR", async () => {
      await priceFeed.setPrice(dec(100, 18))

      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(15, 17)), extraParams: { from: bob } })

      // Check TCR and Recovery Mode
      const TCR = (await th.getTCR(contracts)).toString()
      assert.equal(TCR, '1500000000000000000')
      assert.isFalse(await th.checkRecoveryMode(contracts))

      // Bob attempts an operation that would bring the TCR below the CCR
      try {
        const txBob = await borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, bob, bob, { from: bob })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("adjustTrove(): reverts when SAI repaid is > debt of the trove", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const bobOpenTx = (await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })).tx

      const bobDebt = await getTroveEntireDebt(bob)
      assert.isTrue(bobDebt.gt(toBN('0')))

      const bobFee = toBN(await th.getEventArgByIndex(bobOpenTx, 'SAIBorrowingFeePaid', 1))
      assert.isTrue(bobFee.gt(toBN('0')))

      // Alice transfers SAI to bob to compensate borrowing fees
      await saiToken.transfer(bob, bobFee, { from: alice })

      const remainingDebt = (await troveManager.getTroveDebt(bob)).sub(SAI_GAS_COMPENSATION)

      // Bob attempts an adjustment that would repay 1 wei more than his debt
      await assertRevert(
        borrowerOperations.adjustTrove(th._100pct, 0, remainingDebt.add(toBN(1)), false, bob, bob, { from: bob, value: dec(1, 'ether') }),
        "revert"
      )
    })

    it("adjustTrove(): reverts when attempted SEI withdrawal is >= the trove's collateral", async () => {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      const carolColl = await getTroveEntireColl(carol)

      // Carol attempts an adjustment that would withdraw 1 wei more than her SEI
      try {
        const txCarol = await borrowerOperations.adjustTrove(th._100pct, carolColl.add(toBN(1)), 0, true, carol, carol, { from: carol })
        assert.isFalse(txCarol.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("adjustTrove(): reverts when change would cause the ICR of the trove to fall below the MCR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(100, 18)), extraParams: { from: whale } })

      await priceFeed.setPrice(dec(100, 18))

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(11, 17)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(11, 17)), extraParams: { from: bob } })

      // Bob attempts to increase debt by 100 SAI and 1 ether, i.e. a change that constitutes a 100% ratio of coll:debt.
      // Since his ICR prior is 110%, this change would reduce his ICR below MCR.
      try {
        const txBob = await borrowerOperations.adjustTrove(th._100pct, 0, dec(100, 18), true, bob, bob, { from: bob, value: dec(1, 'ether') })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("adjustTrove(): With 0 coll change, doesnt change borrower's coll or ActivePool coll", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceCollBefore = await getTroveEntireColl(alice)
      const activePoolCollBefore = await activePool.getSEI()

      assert.isTrue(aliceCollBefore.gt(toBN('0')))
      assert.isTrue(aliceCollBefore.eq(activePoolCollBefore))

      // Alice adjusts trove. No coll change, and a debt increase (+50SAI)
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, alice, alice, { from: alice, value: 0 })

      const aliceCollAfter = await getTroveEntireColl(alice)
      const activePoolCollAfter = await activePool.getSEI()

      assert.isTrue(aliceCollAfter.eq(activePoolCollAfter))
      assert.isTrue(activePoolCollAfter.eq(activePoolCollAfter))
    })

    it("adjustTrove(): With 0 debt change, doesnt change borrower's debt or ActivePool debt", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceDebtBefore = await getTroveEntireDebt(alice)
      const activePoolDebtBefore = await activePool.getSAIDebt()

      assert.isTrue(aliceDebtBefore.gt(toBN('0')))
      assert.isTrue(aliceDebtBefore.eq(activePoolDebtBefore))

      // Alice adjusts trove. Coll change, no debt change
      await borrowerOperations.adjustTrove(th._100pct, 0, 0, false, alice, alice, { from: alice, value: dec(1, 'ether') })

      const aliceDebtAfter = await getTroveEntireDebt(alice)
      const activePoolDebtAfter = await activePool.getSAIDebt()

      assert.isTrue(aliceDebtAfter.eq(aliceDebtBefore))
      assert.isTrue(activePoolDebtAfter.eq(activePoolDebtBefore))
    })

    it("adjustTrove(): updates borrower's debt and coll with an increase in both", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const debtBefore = await getTroveEntireDebt(alice)
      const collBefore = await getTroveEntireColl(alice)
      assert.isTrue(debtBefore.gt(toBN('0')))
      assert.isTrue(collBefore.gt(toBN('0')))

      // Alice adjusts trove. Coll and debt increase(+1 SEI, +50SAI)
      await borrowerOperations.adjustTrove(th._100pct, 0, await getNetBorrowingAmount(dec(50, 18)), true, alice, alice, { from: alice, value: dec(1, 'ether') })

      const debtAfter = await getTroveEntireDebt(alice)
      const collAfter = await getTroveEntireColl(alice)

      th.assertIsApproximatelyEqual(debtAfter, debtBefore.add(toBN(dec(50, 18))), 10000)
      th.assertIsApproximatelyEqual(collAfter, collBefore.add(toBN(dec(1, 18))), 10000)
    })

    it("adjustTrove(): updates borrower's debt and coll with a decrease in both", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const debtBefore = await getTroveEntireDebt(alice)
      const collBefore = await getTroveEntireColl(alice)
      assert.isTrue(debtBefore.gt(toBN('0')))
      assert.isTrue(collBefore.gt(toBN('0')))

      // Alice adjusts trove coll and debt decrease (-0.5 SEI, -50SAI)
      await borrowerOperations.adjustTrove(th._100pct, dec(500, 'finney'), dec(50, 18), false, alice, alice, { from: alice })

      const debtAfter = await getTroveEntireDebt(alice)
      const collAfter = await getTroveEntireColl(alice)

      assert.isTrue(debtAfter.eq(debtBefore.sub(toBN(dec(50, 18)))))
      assert.isTrue(collAfter.eq(collBefore.sub(toBN(dec(5, 17)))))
    })

    it("adjustTrove(): updates borrower's  debt and coll with coll increase, debt decrease", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const debtBefore = await getTroveEntireDebt(alice)
      const collBefore = await getTroveEntireColl(alice)
      assert.isTrue(debtBefore.gt(toBN('0')))
      assert.isTrue(collBefore.gt(toBN('0')))

      // Alice adjusts trove - coll increase and debt decrease (+0.5 SEI, -50SAI)
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), false, alice, alice, { from: alice, value: dec(500, 'finney') })

      const debtAfter = await getTroveEntireDebt(alice)
      const collAfter = await getTroveEntireColl(alice)

      th.assertIsApproximatelyEqual(debtAfter, debtBefore.sub(toBN(dec(50, 18))), 10000)
      th.assertIsApproximatelyEqual(collAfter, collBefore.add(toBN(dec(5, 17))), 10000)
    })

    it("adjustTrove(): updates borrower's debt and coll with coll decrease, debt increase", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const debtBefore = await getTroveEntireDebt(alice)
      const collBefore = await getTroveEntireColl(alice)
      assert.isTrue(debtBefore.gt(toBN('0')))
      assert.isTrue(collBefore.gt(toBN('0')))

      // Alice adjusts trove - coll decrease and debt increase (0.1 SEI, 10SAI)
      await borrowerOperations.adjustTrove(th._100pct, dec(1, 17), await getNetBorrowingAmount(dec(1, 18)), true, alice, alice, { from: alice })

      const debtAfter = await getTroveEntireDebt(alice)
      const collAfter = await getTroveEntireColl(alice)

      th.assertIsApproximatelyEqual(debtAfter, debtBefore.add(toBN(dec(1, 18))), 10000)
      th.assertIsApproximatelyEqual(collAfter, collBefore.sub(toBN(dec(1, 17))), 10000)
    })

    it("adjustTrove(): updates borrower's stake and totalStakes with a coll increase", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const stakeBefore = await troveManager.getTroveStake(alice)
      const totalStakesBefore = await troveManager.totalStakes();
      assert.isTrue(stakeBefore.gt(toBN('0')))
      assert.isTrue(totalStakesBefore.gt(toBN('0')))

      // Alice adjusts trove - coll and debt increase (+1 SEI, +50 SAI)
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(50, 18), true, alice, alice, { from: alice, value: dec(1, 'ether') })

      const stakeAfter = await troveManager.getTroveStake(alice)
      const totalStakesAfter = await troveManager.totalStakes();

      assert.isTrue(stakeAfter.eq(stakeBefore.add(toBN(dec(1, 18)))))
      assert.isTrue(totalStakesAfter.eq(totalStakesBefore.add(toBN(dec(1, 18)))))
    })

    it("adjustTrove(): updates borrower's stake and totalStakes with a coll decrease", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const stakeBefore = await troveManager.getTroveStake(alice)
      const totalStakesBefore = await troveManager.totalStakes();
      assert.isTrue(stakeBefore.gt(toBN('0')))
      assert.isTrue(totalStakesBefore.gt(toBN('0')))

      // Alice adjusts trove - coll decrease and debt decrease
      await borrowerOperations.adjustTrove(th._100pct, dec(500, 'finney'), dec(50, 18), false, alice, alice, { from: alice })

      const stakeAfter = await troveManager.getTroveStake(alice)
      const totalStakesAfter = await troveManager.totalStakes();

      assert.isTrue(stakeAfter.eq(stakeBefore.sub(toBN(dec(5, 17)))))
      assert.isTrue(totalStakesAfter.eq(totalStakesBefore.sub(toBN(dec(5, 17)))))
    })

    it("adjustTrove(): changes SAIToken balance by the requested decrease", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const alice_SAITokenBalance_Before = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_Before.gt(toBN('0')))

      // Alice adjusts trove - coll decrease and debt decrease
      await borrowerOperations.adjustTrove(th._100pct, dec(100, 'finney'), dec(10, 18), false, alice, alice, { from: alice })

      // check after
      const alice_SAITokenBalance_After = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_After.eq(alice_SAITokenBalance_Before.sub(toBN(dec(10, 18)))))
    })

    it("adjustTrove(): changes SAIToken balance by the requested increase", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const alice_SAITokenBalance_Before = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_Before.gt(toBN('0')))

      // Alice adjusts trove - coll increase and debt increase
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(100, 18), true, alice, alice, { from: alice, value: dec(1, 'ether') })

      // check after
      const alice_SAITokenBalance_After = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAITokenBalance_After.eq(alice_SAITokenBalance_Before.add(toBN(dec(100, 18)))))
    })

    it("adjustTrove(): Changes the activePool SEI and raw sei balance by the requested decrease", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const activePool_SEI_Before = await activePool.getSEI()
      const activePool_RawSei_Before = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_Before.gt(toBN('0')))
      assert.isTrue(activePool_RawSei_Before.gt(toBN('0')))

      // Alice adjusts trove - coll decrease and debt decrease
      await borrowerOperations.adjustTrove(th._100pct, dec(100, 'finney'), dec(10, 18), false, alice, alice, { from: alice })

      const activePool_SEI_After = await activePool.getSEI()
      const activePool_RawSei_After = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_After.eq(activePool_SEI_Before.sub(toBN(dec(1, 17)))))
      assert.isTrue(activePool_RawSei_After.eq(activePool_SEI_Before.sub(toBN(dec(1, 17)))))
    })

    it("adjustTrove(): Changes the activePool SEI and raw Sei balance by the amount of SEI sent", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const activePool_SEI_Before = await activePool.getSEI()
      const activePool_RawSei_Before = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_Before.gt(toBN('0')))
      assert.isTrue(activePool_RawSei_Before.gt(toBN('0')))

      // Alice adjusts trove - coll increase and debt increase
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(100, 18), true, alice, alice, { from: alice, value: dec(1, 'ether') })

      const activePool_SEI_After = await activePool.getSEI()
      const activePool_RawSei_After = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_After.eq(activePool_SEI_Before.add(toBN(dec(1, 18)))))
      assert.isTrue(activePool_RawSei_After.eq(activePool_SEI_Before.add(toBN(dec(1, 18)))))
    })

    it("adjustTrove(): Changes the SAI debt in ActivePool by requested decrease", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const activePool_SAIDebt_Before = await activePool.getSAIDebt()
      assert.isTrue(activePool_SAIDebt_Before.gt(toBN('0')))

      // Alice adjusts trove - coll increase and debt decrease
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(30, 18), false, alice, alice, { from: alice, value: dec(1, 'ether') })

      const activePool_SAIDebt_After = await activePool.getSAIDebt()
      assert.isTrue(activePool_SAIDebt_After.eq(activePool_SAIDebt_Before.sub(toBN(dec(30, 18)))))
    })

    it("adjustTrove(): Changes the SAI debt in ActivePool by requested increase", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const activePool_SAIDebt_Before = await activePool.getSAIDebt()
      assert.isTrue(activePool_SAIDebt_Before.gt(toBN('0')))

      // Alice adjusts trove - coll increase and debt increase
      await borrowerOperations.adjustTrove(th._100pct, 0, await getNetBorrowingAmount(dec(100, 18)), true, alice, alice, { from: alice, value: dec(1, 'ether') })

      const activePool_SAIDebt_After = await activePool.getSAIDebt()
    
      th.assertIsApproximatelyEqual(activePool_SAIDebt_After, activePool_SAIDebt_Before.add(toBN(dec(100, 18))))
    })

    it("adjustTrove(): new coll = 0 and new debt = 0 is not allowed, as gas compensation still counts toward ICR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })
      const aliceColl = await getTroveEntireColl(alice)
      const aliceDebt = await getTroveEntireColl(alice)
      const status_Before = await troveManager.getTroveStatus(alice)
      const isInSortedList_Before = await sortedTroves.contains(alice)

      assert.equal(status_Before, 1)  // 1: Active
      assert.isTrue(isInSortedList_Before)

      await assertRevert(
        borrowerOperations.adjustTrove(th._100pct, aliceColl, aliceDebt, true, alice, alice, { from: alice }),
        'BorrowerOps: An operation that would result in ICR < MCR is not permitted'
      )
    })

    it("adjustTrove(): Reverts if requested debt increase and amount is zero", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, 0, true, alice, alice, { from: alice }),
        'BorrowerOps: Debt increase requires non-zero debtChange')
    })

    it("adjustTrove(): Reverts if requested coll withdrawal and Sei is sent", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, dec(1, 'ether'), dec(100, 18), true, alice, alice, { from: alice, value: dec(3, 'ether') }), 'BorrowerOperations: Cannot withdraw and add coll')
    })

    it("adjustTrove(): Reverts if it’s zero adjustment", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      await assertRevert(borrowerOperations.adjustTrove(th._100pct, 0, 0, false, alice, alice, { from: alice }),
                         'BorrowerOps: There must be either a collateral change or a debt change')
    })

    it("adjustTrove(): Reverts if requested coll withdrawal is greater than trove's collateral", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })

      const aliceColl = await getTroveEntireColl(alice)

      // Requested coll withdrawal > coll in the trove
      await assertRevert(borrowerOperations.adjustTrove(th._100pct, aliceColl.add(toBN(1)), 0, false, alice, alice, { from: alice }))
      await assertRevert(borrowerOperations.adjustTrove(th._100pct, aliceColl.add(toBN(dec(37, 'ether'))), 0, false, bob, bob, { from: bob }))
    })

    it("adjustTrove(): Reverts if borrower has insufficient SAI balance to cover his debt repayment", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: B } })
      const bobDebt = await getTroveEntireDebt(B)

      // Bob transfers some SAI to carol
      await saiToken.transfer(C, dec(10, 18), { from: B })

      //Confirm B's SAI balance is less than 50 SAI
      const B_SAIBal = await saiToken.balanceOf(B)
      assert.isTrue(B_SAIBal.lt(bobDebt))

      const repaySAIPromise_B = borrowerOperations.adjustTrove(th._100pct, 0, bobDebt, false, B, B, { from: B })

      // B attempts to repay all his debt
      await assertRevert(repaySAIPromise_B, "revert")
    })

    // --- Internal _adjustTrove() ---

    if (!withProxy) { // no need to test this with proxies
      it("Internal _adjustTrove(): reverts when op is a withdrawal and _borrower param is not the msg.sender", async () => {
        await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
        await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

        const txPromise_A = borrowerOperations.callInternalAdjustLoan(alice, dec(1, 18), dec(1, 18), true, alice, alice, { from: bob })
        await assertRevert(txPromise_A, "BorrowerOps: Caller must be the borrower for a withdrawal")
        const txPromise_B = borrowerOperations.callInternalAdjustLoan(bob, dec(1, 18), dec(1, 18), true, alice, alice, { from: owner })
        await assertRevert(txPromise_B, "BorrowerOps: Caller must be the borrower for a withdrawal")
        const txPromise_C = borrowerOperations.callInternalAdjustLoan(carol, dec(1, 18), dec(1, 18), true, alice, alice, { from: bob })
        await assertRevert(txPromise_C, "BorrowerOps: Caller must be the borrower for a withdrawal")
      })
    }

    // --- closeTrove() ---

    it("closeTrove(): reverts when it would lower the TCR below CCR", async () => {
      await openTrove({ ICR: toBN(dec(300, 16)), extraParams:{ from: alice } })
      await openTrove({ ICR: toBN(dec(120, 16)), extraSAIAmount: toBN(dec(300, 18)), extraParams:{ from: bob } })

      const price = await priceFeed.getPrice()
      
      // to compensate borrowing fees
      await saiToken.transfer(alice, dec(300, 18), { from: bob })

      assert.isFalse(await troveManager.checkRecoveryMode(price))
    
      await assertRevert(
        borrowerOperations.closeTrove({ from: alice }),
        "BorrowerOps: An operation that would result in TCR < CCR is not permitted"
      )
    })

    it("closeTrove(): reverts when calling address does not have active trove", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: bob } })

      // Carol with no active trove attempts to close her trove
      try {
        const txCarol = await borrowerOperations.closeTrove({ from: carol })
        assert.isFalse(txCarol.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("closeTrove(): reverts when system is in Recovery Mode", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(100000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      // Alice transfers her SAI to Bob and Carol so they can cover fees
      const aliceBal = await saiToken.balanceOf(alice)
      await saiToken.transfer(bob, aliceBal.div(toBN(2)), { from: alice })
      await saiToken.transfer(carol, aliceBal.div(toBN(2)), { from: alice })

      // check Recovery Mode 
      assert.isFalse(await th.checkRecoveryMode(contracts))

      // Bob successfully closes his trove
      const txBob = await borrowerOperations.closeTrove({ from: bob })
      assert.isTrue(txBob.receipt.status)

      await priceFeed.setPrice(dec(100, 18))

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // Carol attempts to close her trove during Recovery Mode
      await assertRevert(borrowerOperations.closeTrove({ from: carol }), "BorrowerOps: Operation not permitted during Recovery Mode")
    })

    it("closeTrove(): reverts when trove is the only one in the system", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(100000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // Artificially mint to Alice so she has enough to close her trove
      await saiToken.unprotectedMint(alice, dec(100000, 18))

      // Check she has more SAI than her trove debt
      const aliceBal = await saiToken.balanceOf(alice)
      const aliceDebt = await getTroveEntireDebt(alice)
      assert.isTrue(aliceBal.gt(aliceDebt))

      // check Recovery Mode
      assert.isFalse(await th.checkRecoveryMode(contracts))

      // Alice attempts to close her trove
      await assertRevert(borrowerOperations.closeTrove({ from: alice }), "TroveManager: Only one trove in the system")
    })

    it("closeTrove(): reduces a Trove's collateral to zero", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceCollBefore = await getTroveEntireColl(alice)
      const dennisSAI = await saiToken.balanceOf(dennis)
      assert.isTrue(aliceCollBefore.gt(toBN('0')))
      assert.isTrue(dennisSAI.gt(toBN('0')))

      // To compensate borrowing fees
      await saiToken.transfer(alice, dennisSAI.div(toBN(2)), { from: dennis })

      // Alice attempts to close trove
      await borrowerOperations.closeTrove({ from: alice })

      const aliceCollAfter = await getTroveEntireColl(alice)
      assert.equal(aliceCollAfter, '0')
    })

    it("closeTrove(): reduces a Trove's debt to zero", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceDebtBefore = await getTroveEntireColl(alice)
      const dennisSAI = await saiToken.balanceOf(dennis)
      assert.isTrue(aliceDebtBefore.gt(toBN('0')))
      assert.isTrue(dennisSAI.gt(toBN('0')))

      // To compensate borrowing fees
      await saiToken.transfer(alice, dennisSAI.div(toBN(2)), { from: dennis })

      // Alice attempts to close trove
      await borrowerOperations.closeTrove({ from: alice })

      const aliceCollAfter = await getTroveEntireColl(alice)
      assert.equal(aliceCollAfter, '0')
    })

    it("closeTrove(): sets Trove's stake to zero", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceStakeBefore = await getTroveStake(alice)
      assert.isTrue(aliceStakeBefore.gt(toBN('0')))

      const dennisSAI = await saiToken.balanceOf(dennis)
      assert.isTrue(aliceStakeBefore.gt(toBN('0')))
      assert.isTrue(dennisSAI.gt(toBN('0')))

      // To compensate borrowing fees
      await saiToken.transfer(alice, dennisSAI.div(toBN(2)), { from: dennis })

      // Alice attempts to close trove
      await borrowerOperations.closeTrove({ from: alice })

      const stakeAfter = ((await troveManager.Troves(alice))[2]).toString()
      assert.equal(stakeAfter, '0')
      // check withdrawal was successful
    })

    it("closeTrove(): zero's the troves reward snapshots", async () => {
      // Dennis opens trove and transfers tokens to alice
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Price drops
      await priceFeed.setPrice(dec(100, 18))

      // Liquidate Bob
      await troveManager.liquidate(bob)
      assert.isFalse(await sortedTroves.contains(bob))

      // Price bounces back
      await priceFeed.setPrice(dec(200, 18))

      // Alice and Carol open troves
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      // Price drops ...again
      await priceFeed.setPrice(dec(100, 18))

      // Get Alice's pending reward snapshots 
      const L_SEI_A_Snapshot = (await troveManager.rewardSnapshots(alice))[0]
      const L_SAIDebt_A_Snapshot = (await troveManager.rewardSnapshots(alice))[1]
      assert.isTrue(L_SEI_A_Snapshot.gt(toBN('0')))
      assert.isTrue(L_SAIDebt_A_Snapshot.gt(toBN('0')))

      // Liquidate Carol
      await troveManager.liquidate(carol)
      assert.isFalse(await sortedTroves.contains(carol))

      // Get Alice's pending reward snapshots after Carol's liquidation. Check above 0
      const L_SEI_Snapshot_A_AfterLiquidation = (await troveManager.rewardSnapshots(alice))[0]
      const L_SAIDebt_Snapshot_A_AfterLiquidation = (await troveManager.rewardSnapshots(alice))[1]

      assert.isTrue(L_SEI_Snapshot_A_AfterLiquidation.gt(toBN('0')))
      assert.isTrue(L_SAIDebt_Snapshot_A_AfterLiquidation.gt(toBN('0')))

      // to compensate borrowing fees
      await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

      await priceFeed.setPrice(dec(200, 18))

      // Alice closes trove
      await borrowerOperations.closeTrove({ from: alice })

      // Check Alice's pending reward snapshots are zero
      const L_SEI_Snapshot_A_afterAliceCloses = (await troveManager.rewardSnapshots(alice))[0]
      const L_SAIDebt_Snapshot_A_afterAliceCloses = (await troveManager.rewardSnapshots(alice))[1]

      assert.equal(L_SEI_Snapshot_A_afterAliceCloses, '0')
      assert.equal(L_SAIDebt_Snapshot_A_afterAliceCloses, '0')
    })

    it("closeTrove(): sets trove's status to closed and removes it from sorted troves list", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // Check Trove is active
      const alice_Trove_Before = await troveManager.Troves(alice)
      const status_Before = alice_Trove_Before[3]

      assert.equal(status_Before, 1)
      assert.isTrue(await sortedTroves.contains(alice))

      // to compensate borrowing fees
      await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

      // Close the trove
      await borrowerOperations.closeTrove({ from: alice })

      const alice_Trove_After = await troveManager.Troves(alice)
      const status_After = alice_Trove_After[3]

      assert.equal(status_After, 2)
      assert.isFalse(await sortedTroves.contains(alice))
    })

    it("closeTrove(): reduces ActivePool SEI and raw Sei by correct amount", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const dennisColl = await getTroveEntireColl(dennis)
      const aliceColl = await getTroveEntireColl(alice)
      assert.isTrue(dennisColl.gt('0'))
      assert.isTrue(aliceColl.gt('0'))

      // Check active Pool SEI before
      const activePool_SEI_before = await activePool.getSEI()
      const activePool_RawSei_before = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_before.eq(aliceColl.add(dennisColl)))
      assert.isTrue(activePool_SEI_before.gt(toBN('0')))
      assert.isTrue(activePool_RawSei_before.eq(activePool_SEI_before))

      // to compensate borrowing fees
      await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

      // Close the trove
      await borrowerOperations.closeTrove({ from: alice })

      // Check after
      const activePool_SEI_After = await activePool.getSEI()
      const activePool_RawSei_After = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_After.eq(dennisColl))
      assert.isTrue(activePool_RawSei_After.eq(dennisColl))
    })

    it("closeTrove(): reduces ActivePool debt by correct amount", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const dennisDebt = await getTroveEntireDebt(dennis)
      const aliceDebt = await getTroveEntireDebt(alice)
      assert.isTrue(dennisDebt.gt('0'))
      assert.isTrue(aliceDebt.gt('0'))

      // Check before
      const activePool_Debt_before = await activePool.getSAIDebt()
      assert.isTrue(activePool_Debt_before.eq(aliceDebt.add(dennisDebt)))
      assert.isTrue(activePool_Debt_before.gt(toBN('0')))

      // to compensate borrowing fees
      await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

      // Close the trove
      await borrowerOperations.closeTrove({ from: alice })

      // Check after
      const activePool_Debt_After = (await activePool.getSAIDebt()).toString()
      th.assertIsApproximatelyEqual(activePool_Debt_After, dennisDebt)
    })

    it("closeTrove(): updates the the total stakes", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Get individual stakes
      const aliceStakeBefore = await getTroveStake(alice)
      const bobStakeBefore = await getTroveStake(bob)
      const dennisStakeBefore = await getTroveStake(dennis)
      assert.isTrue(aliceStakeBefore.gt('0'))
      assert.isTrue(bobStakeBefore.gt('0'))
      assert.isTrue(dennisStakeBefore.gt('0'))

      const totalStakesBefore = await troveManager.totalStakes()

      assert.isTrue(totalStakesBefore.eq(aliceStakeBefore.add(bobStakeBefore).add(dennisStakeBefore)))

      // to compensate borrowing fees
      await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

      // Alice closes trove
      await borrowerOperations.closeTrove({ from: alice })

      // Check stake and total stakes get updated
      const aliceStakeAfter = await getTroveStake(alice)
      const totalStakesAfter = await troveManager.totalStakes()

      assert.equal(aliceStakeAfter, 0)
      assert.isTrue(totalStakesAfter.eq(totalStakesBefore.sub(aliceStakeBefore)))
    })

    if (!withProxy) { // TODO: wrap web3.eth.getBalance to be able to go through proxies
      it("closeTrove(): sends the correct amount of SEI to the user", async () => {
        await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
        await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

        const aliceColl = await getTroveEntireColl(alice)
        assert.isTrue(aliceColl.gt(toBN('0')))

        const alice_SEIBalance_Before = web3.utils.toBN(await web3.eth.getBalance(alice))

        // to compensate borrowing fees
        await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

        await borrowerOperations.closeTrove({ from: alice, gasPrice: 0 })

        const alice_SEIBalance_After = web3.utils.toBN(await web3.eth.getBalance(alice))
        const balanceDiff = alice_SEIBalance_After.sub(alice_SEIBalance_Before)

        assert.isTrue(balanceDiff.eq(aliceColl))
      })
    }

    it("closeTrove(): subtracts the debt of the closed Trove from the Borrower's SAIToken balance", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: dennis } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      const aliceDebt = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebt.gt(toBN('0')))

      // to compensate borrowing fees
      await saiToken.transfer(alice, await saiToken.balanceOf(dennis), { from: dennis })

      const alice_SAIBalance_Before = await saiToken.balanceOf(alice)
      assert.isTrue(alice_SAIBalance_Before.gt(toBN('0')))

      // close trove
      await borrowerOperations.closeTrove({ from: alice })

      // check alice SAI balance after
      const alice_SAIBalance_After = await saiToken.balanceOf(alice)
      th.assertIsApproximatelyEqual(alice_SAIBalance_After, alice_SAIBalance_Before.sub(aliceDebt.sub(SAI_GAS_COMPENSATION)))
    })

    it("closeTrove(): applies pending rewards", async () => {
      // --- SETUP ---
      await openTrove({ extraSAIAmount: toBN(dec(1000000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      const whaleDebt = await getTroveEntireDebt(whale)
      const whaleColl = await getTroveEntireColl(whale)

      await openTrove({ extraSAIAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      const carolDebt = await getTroveEntireDebt(carol)
      const carolColl = await getTroveEntireColl(carol)

      // Whale transfers to A and B to cover their fees
      await saiToken.transfer(alice, dec(10000, 18), { from: whale })
      await saiToken.transfer(bob, dec(10000, 18), { from: whale })

      // --- TEST ---

      // price drops to 1SEI:100SAI, reducing Carol's ICR below MCR
      await priceFeed.setPrice(dec(100, 18));
      const price = await priceFeed.getPrice()

      // liquidate Carol's Trove, Alice and Bob earn rewards.
      const liquidationTx = await troveManager.liquidate(carol, { from: owner });
      const [liquidatedDebt_C, liquidatedColl_C, gasComp_C] = th.getEmittedLiquidationValues(liquidationTx)

      // Dennis opens a new Trove 
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      // check Alice and Bob's reward snapshots are zero before they alter their Troves
      const alice_rewardSnapshot_Before = await troveManager.rewardSnapshots(alice)
      const alice_SEIrewardSnapshot_Before = alice_rewardSnapshot_Before[0]
      const alice_SAIDebtRewardSnapshot_Before = alice_rewardSnapshot_Before[1]

      const bob_rewardSnapshot_Before = await troveManager.rewardSnapshots(bob)
      const bob_SEIrewardSnapshot_Before = bob_rewardSnapshot_Before[0]
      const bob_SAIDebtRewardSnapshot_Before = bob_rewardSnapshot_Before[1]

      assert.equal(alice_SEIrewardSnapshot_Before, 0)
      assert.equal(alice_SAIDebtRewardSnapshot_Before, 0)
      assert.equal(bob_SEIrewardSnapshot_Before, 0)
      assert.equal(bob_SAIDebtRewardSnapshot_Before, 0)

      const defaultPool_SEI = await defaultPool.getSEI()
      const defaultPool_SAIDebt = await defaultPool.getSAIDebt()

      // Carol's liquidated coll (1 SEI) and drawn debt should have entered the Default Pool
      assert.isAtMost(th.getDifference(defaultPool_SEI, liquidatedColl_C), 100)
      assert.isAtMost(th.getDifference(defaultPool_SAIDebt, liquidatedDebt_C), 100)

      const pendingCollReward_A = await troveManager.getPendingSEIReward(alice)
      const pendingDebtReward_A = await troveManager.getPendingSAIDebtReward(alice)
      assert.isTrue(pendingCollReward_A.gt('0'))
      assert.isTrue(pendingDebtReward_A.gt('0'))

      // Close Alice's trove. Alice's pending rewards should be removed from the DefaultPool when she close.
      await borrowerOperations.closeTrove({ from: alice })

      const defaultPool_SEI_afterAliceCloses = await defaultPool.getSEI()
      const defaultPool_SAIDebt_afterAliceCloses = await defaultPool.getSAIDebt()

      assert.isAtMost(th.getDifference(defaultPool_SEI_afterAliceCloses,
        defaultPool_SEI.sub(pendingCollReward_A)), 1000)
      assert.isAtMost(th.getDifference(defaultPool_SAIDebt_afterAliceCloses,
        defaultPool_SAIDebt.sub(pendingDebtReward_A)), 1000)

      // whale adjusts trove, pulling their rewards out of DefaultPool
      await borrowerOperations.adjustTrove(th._100pct, 0, dec(1, 18), true, whale, whale, { from: whale })

      // Close Bob's trove. Expect DefaultPool coll and debt to drop to 0, since closing pulls his rewards out.
      await borrowerOperations.closeTrove({ from: bob })

      const defaultPool_SEI_afterBobCloses = await defaultPool.getSEI()
      const defaultPool_SAIDebt_afterBobCloses = await defaultPool.getSAIDebt()

      assert.isAtMost(th.getDifference(defaultPool_SEI_afterBobCloses, 0), 100000)
      assert.isAtMost(th.getDifference(defaultPool_SAIDebt_afterBobCloses, 0), 100000)
    })

    it("closeTrove(): reverts if borrower has insufficient SAI balance to repay his entire debt", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })

      //Confirm Bob's SAI balance is less than his trove debt
      const B_SAIBal = await saiToken.balanceOf(B)
      const B_troveDebt = await getTroveEntireDebt(B)

      assert.isTrue(B_SAIBal.lt(B_troveDebt))

      const closeTrovePromise_B = borrowerOperations.closeTrove({ from: B })

      // Check closing trove reverts
      await assertRevert(closeTrovePromise_B, "BorrowerOps: Caller doesnt have enough SAI to make repayment")
    })

    // --- openTrove() ---

    if (!withProxy) { // TODO: use rawLogs instead of logs
      it("openTrove(): emits a TroveUpdated event with the correct collateral and debt", async () => {
        const txA = (await openTrove({ extraSAIAmount: toBN(dec(15000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })).tx
        const txB = (await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })).tx
        const txC = (await openTrove({ extraSAIAmount: toBN(dec(3000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })).tx

        const A_Coll = await getTroveEntireColl(A)
        const B_Coll = await getTroveEntireColl(B)
        const C_Coll = await getTroveEntireColl(C)
        const A_Debt = await getTroveEntireDebt(A)
        const B_Debt = await getTroveEntireDebt(B)
        const C_Debt = await getTroveEntireDebt(C)

        const A_emittedDebt = toBN(th.getEventArgByName(txA, "TroveUpdated", "_debt"))
        const A_emittedColl = toBN(th.getEventArgByName(txA, "TroveUpdated", "_coll"))
        const B_emittedDebt = toBN(th.getEventArgByName(txB, "TroveUpdated", "_debt"))
        const B_emittedColl = toBN(th.getEventArgByName(txB, "TroveUpdated", "_coll"))
        const C_emittedDebt = toBN(th.getEventArgByName(txC, "TroveUpdated", "_debt"))
        const C_emittedColl = toBN(th.getEventArgByName(txC, "TroveUpdated", "_coll"))

        // Check emitted debt values are correct
        assert.isTrue(A_Debt.eq(A_emittedDebt))
        assert.isTrue(B_Debt.eq(B_emittedDebt))
        assert.isTrue(C_Debt.eq(C_emittedDebt))

        // Check emitted coll values are correct
        assert.isTrue(A_Coll.eq(A_emittedColl))
        assert.isTrue(B_Coll.eq(B_emittedColl))
        assert.isTrue(C_Coll.eq(C_emittedColl))

        const baseRateBefore = await troveManager.baseRate()

        // Artificially make baseRate 5%
        await troveManager.setBaseRate(dec(5, 16))
        await troveManager.setLastFeeOpTimeToNow()

        assert.isTrue((await troveManager.baseRate()).gt(baseRateBefore))

        const txD = (await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })).tx
        const txE = (await openTrove({ extraSAIAmount: toBN(dec(3000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })).tx
        const D_Coll = await getTroveEntireColl(D)
        const E_Coll = await getTroveEntireColl(E)
        const D_Debt = await getTroveEntireDebt(D)
        const E_Debt = await getTroveEntireDebt(E)

        const D_emittedDebt = toBN(th.getEventArgByName(txD, "TroveUpdated", "_debt"))
        const D_emittedColl = toBN(th.getEventArgByName(txD, "TroveUpdated", "_coll"))

        const E_emittedDebt = toBN(th.getEventArgByName(txE, "TroveUpdated", "_debt"))
        const E_emittedColl = toBN(th.getEventArgByName(txE, "TroveUpdated", "_coll"))

        // Check emitted debt values are correct
        assert.isTrue(D_Debt.eq(D_emittedDebt))
        assert.isTrue(E_Debt.eq(E_emittedDebt))

        // Check emitted coll values are correct
        assert.isTrue(D_Coll.eq(D_emittedColl))
        assert.isTrue(E_Coll.eq(E_emittedColl))
      })
    }

    it("openTrove(): Opens a trove with net debt >= minimum net debt", async () => {
      // Add 1 wei to correct for rounding error in helper function
      const txA = await borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN(1))), A, A, { from: A, value: dec(100, 30) })
      assert.isTrue(txA.receipt.status)
      assert.isTrue(await sortedTroves.contains(A))

      const txC = await borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.add(toBN(dec(47789898, 22)))), A, A, { from: C, value: dec(100, 30) })
      assert.isTrue(txC.receipt.status)
      assert.isTrue(await sortedTroves.contains(C))
    })

    it("openTrove(): reverts if net debt < minimum net debt", async () => {
      const txAPromise = borrowerOperations.openTrove(th._100pct, 0, A, A, { from: A, value: dec(100, 30) })
      await assertRevert(txAPromise, "revert")

      const txBPromise = borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT.sub(toBN(1))), B, B, { from: B, value: dec(100, 30) })
      await assertRevert(txBPromise, "revert")

      const txCPromise = borrowerOperations.openTrove(th._100pct, MIN_NET_DEBT.sub(toBN(dec(173, 18))), C, C, { from: C, value: dec(100, 30) })
      await assertRevert(txCPromise, "revert")
    })

    it("openTrove(): decays a non-zero base rate", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate has decreased
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.lt(baseRate_1))

      // 1 hour passes
      th.fastForwardTime(3600, web3.currentProvider)

      // E opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(12, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      const baseRate_3 = await troveManager.baseRate()
      assert.isTrue(baseRate_3.lt(baseRate_2))
    })

    it("openTrove(): doesn't change base rate if it is already zero", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check baseRate is still 0
      const baseRate_2 = await troveManager.baseRate()
      assert.equal(baseRate_2, '0')

      // 1 hour passes
      th.fastForwardTime(3600, web3.currentProvider)

      // E opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(12, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      const baseRate_3 = await troveManager.baseRate()
      assert.equal(baseRate_3, '0')
    })

    it("openTrove(): lastFeeOpTime doesn't update if less time than decay interval has passed since the last fee operation", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      const lastFeeOpTime_1 = await troveManager.lastFeeOperationTime()

      // Borrower D triggers a fee
      await openTrove({ extraSAIAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      const lastFeeOpTime_2 = await troveManager.lastFeeOperationTime()

      // Check that the last fee operation time did not update, as borrower D's debt issuance occured
      // since before minimum interval had passed 
      assert.isTrue(lastFeeOpTime_2.eq(lastFeeOpTime_1))

      // 1 minute passes
      th.fastForwardTime(60, web3.currentProvider)

      // Check that now, at least one minute has passed since lastFeeOpTime_1
      const timeNow = await th.getLatestBlockTimestamp(web3)
      assert.isTrue(toBN(timeNow).sub(lastFeeOpTime_1).gte(3600))

      // Borrower E triggers a fee
      await openTrove({ extraSAIAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      const lastFeeOpTime_3 = await troveManager.lastFeeOperationTime()

      // Check that the last fee operation time DID update, as borrower's debt issuance occured
      // after minimum interval had passed 
      assert.isTrue(lastFeeOpTime_3.gt(lastFeeOpTime_1))
    })

    it("openTrove(): reverts if max fee > 100%", async () => {
      await assertRevert(borrowerOperations.openTrove(dec(2, 18), dec(10000, 18), A, A, { from: A, value: dec(1000, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.openTrove('1000000000000000001', dec(20000, 18), B, B, { from: B, value: dec(1000, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
    })

    it("openTrove(): reverts if max fee < 0.5% in Normal mode", async () => {
      await assertRevert(borrowerOperations.openTrove(0, dec(195000, 18), A, A, { from: A, value: dec(1200, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.openTrove(1, dec(195000, 18), A, A, { from: A, value: dec(1000, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
      await assertRevert(borrowerOperations.openTrove('4999999999999999', dec(195000, 18), B, B, { from: B, value: dec(1200, 'ether') }), "Max fee percentage must be between 0.5% and 100%")
    })

    it("openTrove(): allows max fee < 0.5% in Recovery Mode", async () => {
      await borrowerOperations.openTrove(th._100pct, dec(195000, 18), A, A, { from: A, value: dec(2000, 'ether') })

      await priceFeed.setPrice(dec(100, 18))
      assert.isTrue(await th.checkRecoveryMode(contracts))

      await borrowerOperations.openTrove(0, dec(19500, 18), B, B, { from: B, value: dec(3100, 'ether') })
      await priceFeed.setPrice(dec(50, 18))
      assert.isTrue(await th.checkRecoveryMode(contracts))
      await borrowerOperations.openTrove(1, dec(19500, 18), C, C, { from: C, value: dec(3100, 'ether') })
      await priceFeed.setPrice(dec(25, 18))
      assert.isTrue(await th.checkRecoveryMode(contracts))
      await borrowerOperations.openTrove('4999999999999999', dec(19500, 18), D, D, { from: D, value: dec(3100, 'ether') })
    })

    it("openTrove(): reverts if fee exceeds max fee percentage", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      const totalSupply = await saiToken.totalSupply()

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      //       actual fee percentage: 0.005000000186264514
      // user's max fee percentage:  0.0049999999999999999
      let borrowingRate = await troveManager.getBorrowingRate() // expect max(0.5 + 5%, 5%) rate
      assert.equal(borrowingRate, dec(5, 16))

      const lessThan5pct = '49999999999999999'
      await assertRevert(borrowerOperations.openTrove(lessThan5pct, dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")

      borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
      assert.equal(borrowingRate, dec(5, 16))
      // Attempt with maxFee 1%
      await assertRevert(borrowerOperations.openTrove(dec(1, 16), dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")

      borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
      assert.equal(borrowingRate, dec(5, 16))
      // Attempt with maxFee 3.754%
      await assertRevert(borrowerOperations.openTrove(dec(3754, 13), dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")

      borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
      assert.equal(borrowingRate, dec(5, 16))
      // Attempt with maxFee 1e-16%
      await assertRevert(borrowerOperations.openTrove(dec(5, 15), dec(30000, 18), A, A, { from: D, value: dec(1000, 'ether') }), "Fee exceeded provided maximum")
    })

    it("openTrove(): succeeds when fee is less than max fee percentage", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      let borrowingRate = await troveManager.getBorrowingRate() // expect min(0.5 + 5%, 5%) rate
      assert.equal(borrowingRate, dec(5, 16))

      // Attempt with maxFee > 5%
      const moreThan5pct = '50000000000000001'
      const tx1 = await borrowerOperations.openTrove(moreThan5pct, dec(10000, 18), A, A, { from: D, value: dec(100, 'ether') })
      assert.isTrue(tx1.receipt.status)

      borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
      assert.equal(borrowingRate, dec(5, 16))

      // Attempt with maxFee = 5%
      const tx2 = await borrowerOperations.openTrove(dec(5, 16), dec(10000, 18), A, A, { from: H, value: dec(100, 'ether') })
      assert.isTrue(tx2.receipt.status)

      borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
      assert.equal(borrowingRate, dec(5, 16))

      // Attempt with maxFee 10%
      const tx3 = await borrowerOperations.openTrove(dec(1, 17), dec(10000, 18), A, A, { from: E, value: dec(100, 'ether') })
      assert.isTrue(tx3.receipt.status)

      borrowingRate = await troveManager.getBorrowingRate() // expect 5% rate
      assert.equal(borrowingRate, dec(5, 16))

      // Attempt with maxFee 37.659%
      const tx4 = await borrowerOperations.openTrove(dec(37659, 13), dec(10000, 18), A, A, { from: F, value: dec(100, 'ether') })
      assert.isTrue(tx4.receipt.status)

      // Attempt with maxFee 100%
      const tx5 = await borrowerOperations.openTrove(dec(1, 18), dec(10000, 18), A, A, { from: G, value: dec(100, 'ether') })
      assert.isTrue(tx5.receipt.status)
    })

    it("openTrove(): borrower can't grief the baseRate and stop it decaying by issuing debt at higher frequency than the decay granularity", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 59 minutes pass
      th.fastForwardTime(3540, web3.currentProvider)

      // Assume Borrower also owns accounts D and E
      // Borrower triggers a fee, before decay interval has passed
      await openTrove({ extraSAIAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // 1 minute pass
      th.fastForwardTime(3540, web3.currentProvider)

      // Borrower triggers another fee
      await openTrove({ extraSAIAmount: toBN(dec(1, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: E } })

      // Check base rate has decreased even though Borrower tried to stop it decaying
      const baseRate_2 = await troveManager.baseRate()
      assert.isTrue(baseRate_2.lt(baseRate_1))
    })

    it("openTrove(): borrowing at non-zero base rate sends SAI fee to FLO staking contract", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO SAI balance before == 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStaking_SAIBalance_Before, '0')

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check FLO SAI balance after has increased
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))
    })

    if (!withProxy) { // TODO: use rawLogs instead of logs
      it("openTrove(): borrowing at non-zero base records the (drawn debt + fee  + liq. reserve) on the Trove struct", async () => {
        // time fast-forwards 1 year, and multisig stakes 1 FLO
        await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
        await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
        await floStaking.stake(dec(1, 18), { from: multisig })

        await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
        await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
        await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
        await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

        // Artificially make baseRate 5%
        await troveManager.setBaseRate(dec(5, 16))
        await troveManager.setLastFeeOpTimeToNow()

        // Check baseRate is now non-zero
        const baseRate_1 = await troveManager.baseRate()
        assert.isTrue(baseRate_1.gt(toBN('0')))

        // 2 hours pass
        th.fastForwardTime(7200, web3.currentProvider)

        const D_SAIRequest = toBN(dec(20000, 18))

        // D withdraws SAI
        const openTroveTx = await borrowerOperations.openTrove(th._100pct, D_SAIRequest, ZERO_ADDRESS, ZERO_ADDRESS, { from: D, value: dec(200, 'ether') })

        const emittedFee = toBN(th.getSAIFeeFromSAIBorrowingEvent(openTroveTx))
        assert.isTrue(toBN(emittedFee).gt(toBN('0')))

        const newDebt = (await troveManager.Troves(D))[0]

        // Check debt on Trove struct equals drawn debt plus emitted fee
        th.assertIsApproximatelyEqual(newDebt, D_SAIRequest.add(emittedFee).add(SAI_GAS_COMPENSATION), 100000)
      })
    }

    it("openTrove(): Borrowing at non-zero base rate increases the FLO staking contract SAI fees-per-unit-staked", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO contract SAI fees-per-unit-staked is zero
      const F_SAI_Before = await floStaking.F_SAI()
      assert.equal(F_SAI_Before, '0')

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is now non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check FLO contract SAI fees-per-unit-staked has increased
      const F_SAI_After = await floStaking.F_SAI()
      assert.isTrue(F_SAI_After.gt(F_SAI_Before))
    })

    it("openTrove(): Borrowing at non-zero base rate sends requested amount to the user", async () => {
      // time fast-forwards 1 year, and multisig stakes 1 FLO
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.approve(floStaking.address, dec(1, 18), { from: multisig })
      await floStaking.stake(dec(1, 18), { from: multisig })

      // Check FLO Staking contract balance before == 0
      const floStaking_SAIBalance_Before = await saiToken.balanceOf(floStaking.address)
      assert.equal(floStaking_SAIBalance_Before, '0')

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(20000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(30000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(40000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Artificially make baseRate 5%
      await troveManager.setBaseRate(dec(5, 16))
      await troveManager.setLastFeeOpTimeToNow()

      // Check baseRate is non-zero
      const baseRate_1 = await troveManager.baseRate()
      assert.isTrue(baseRate_1.gt(toBN('0')))

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // D opens trove 
      const SAIRequest_D = toBN(dec(40000, 18))
      await borrowerOperations.openTrove(th._100pct, SAIRequest_D, D, D, { from: D, value: dec(500, 'ether') })

      // Check FLO staking SAI balance has increased
      const floStaking_SAIBalance_After = await saiToken.balanceOf(floStaking.address)
      assert.isTrue(floStaking_SAIBalance_After.gt(floStaking_SAIBalance_Before))

      // Check D's SAI balance now equals their requested SAI
      const SAIBalance_D = await saiToken.balanceOf(D)
      assert.isTrue(SAIRequest_D.eq(SAIBalance_D))
    })

    it("openTrove(): Borrowing at zero base rate changes the FLO staking contract SAI fees-per-unit-staked", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: C } })

      // Check baseRate is zero
      const baseRate_1 = await troveManager.baseRate()
      assert.equal(baseRate_1, '0')

      // 2 hours pass
      th.fastForwardTime(7200, web3.currentProvider)

      // Check SAI reward per FLO staked == 0
      const F_SAI_Before = await floStaking.F_SAI()
      assert.equal(F_SAI_Before, '0')

      // A stakes FLO
      await floToken.unprotectedMint(A, dec(100, 18))
      await floStaking.stake(dec(100, 18), { from: A })

      // D opens trove 
      await openTrove({ extraSAIAmount: toBN(dec(37, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: D } })

      // Check SAI reward per FLO staked > 0
      const F_SAI_After = await floStaking.F_SAI()
      assert.isTrue(F_SAI_After.gt(toBN('0')))
    })

    it("openTrove(): Borrowing at zero base rate charges minimum fee", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: A } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: B } })

      const SAIRequest = toBN(dec(10000, 18))
      const txC = await borrowerOperations.openTrove(th._100pct, SAIRequest, ZERO_ADDRESS, ZERO_ADDRESS, { value: dec(100, 'ether'), from: C })
      const _SAIFee = toBN(th.getEventArgByName(txC, "SAIBorrowingFeePaid", "_SAIFee"))

      const expectedFee = BORROWING_FEE_FLOOR.mul(toBN(SAIRequest)).div(toBN(dec(1, 18)))
      assert.isTrue(_SAIFee.eq(expectedFee))
    })

    it("openTrove(): reverts when system is in Recovery Mode and ICR < CCR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      assert.isFalse(await th.checkRecoveryMode(contracts))

      // price drops, and Recovery Mode kicks in
      await priceFeed.setPrice(dec(105, 18))

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // Bob tries to open a trove with 149% ICR during Recovery Mode
      try {
        const txBob = await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(149, 16)), extraParams: { from: alice } })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("openTrove(): reverts when trove ICR < MCR", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      assert.isFalse(await th.checkRecoveryMode(contracts))

      // Bob attempts to open a 109% ICR trove in Normal Mode
      try {
        const txBob = (await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(109, 16)), extraParams: { from: bob } })).tx
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }

      // price drops, and Recovery Mode kicks in
      await priceFeed.setPrice(dec(105, 18))

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // Bob attempts to open a 109% ICR trove in Recovery Mode
      try {
        const txBob = await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(109, 16)), extraParams: { from: bob } })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("openTrove(): reverts when opening the trove would cause the TCR of the system to fall below the CCR", async () => {
      await priceFeed.setPrice(dec(100, 18))

      // Alice creates trove with 150% ICR.  System TCR = 150%.
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })

      const TCR = await th.getTCR(contracts)
      assert.equal(TCR, dec(150, 16))

      // Bob attempts to open a trove with ICR = 149% 
      // System TCR would fall below 150%
      try {
        const txBob = await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(149, 16)), extraParams: { from: bob } })
        assert.isFalse(txBob.receipt.status)
      } catch (err) {
        assert.include(err.message, "revert")
      }
    })

    it("openTrove(): reverts if trove is already active", async () => {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(10, 18)), extraParams: { from: whale } })

      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: bob } })

      try {
        const txB_1 = await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(3, 18)), extraParams: { from: bob } })

        assert.isFalse(txB_1.receipt.status)
      } catch (err) {
        assert.include(err.message, 'revert')
      }

      try {
        const txB_2 = await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

        assert.isFalse(txB_2.receipt.status)
      } catch (err) {
        assert.include(err.message, 'revert')
      }
    })

    it("openTrove(): Can open a trove with ICR >= CCR when system is in Recovery Mode", async () => {
      // --- SETUP ---
      //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: bob } })

      const TCR = (await th.getTCR(contracts)).toString()
      assert.equal(TCR, '1500000000000000000')

      // price drops to 1SEI:100SAI, reducing TCR below 150%
      await priceFeed.setPrice('100000000000000000000');
      const price = await priceFeed.getPrice()

      assert.isTrue(await th.checkRecoveryMode(contracts))

      // Carol opens at 150% ICR in Recovery Mode
      const txCarol = (await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: carol } })).tx
      assert.isTrue(txCarol.receipt.status)
      assert.isTrue(await sortedTroves.contains(carol))

      const carol_TroveStatus = await troveManager.getTroveStatus(carol)
      assert.equal(carol_TroveStatus, 1)

      const carolICR = await troveManager.getCurrentICR(carol, price)
      assert.isTrue(carolICR.gt(toBN(dec(150, 16))))
    })

    it("openTrove(): Reverts opening a trove with min debt when system is in Recovery Mode", async () => {
      // --- SETUP ---
      //  Alice and Bob add coll and withdraw such  that the TCR is ~150%
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: bob } })

      const TCR = (await th.getTCR(contracts)).toString()
      assert.equal(TCR, '1500000000000000000')

      // price drops to 1SEI:100SAI, reducing TCR below 150%
      await priceFeed.setPrice('100000000000000000000');

      assert.isTrue(await th.checkRecoveryMode(contracts))

      await assertRevert(borrowerOperations.openTrove(th._100pct, await getNetBorrowingAmount(MIN_NET_DEBT), carol, carol, { from: carol, value: dec(1, 'ether') }))
    })

    it("openTrove(): creates a new Trove and assigns the correct collateral and debt amount", async () => {
      const debt_Before = await getTroveEntireDebt(alice)
      const coll_Before = await getTroveEntireColl(alice)
      const status_Before = await troveManager.getTroveStatus(alice)

      // check coll and debt before
      assert.equal(debt_Before, 0)
      assert.equal(coll_Before, 0)

      // check non-existent status
      assert.equal(status_Before, 0)

      const SAIRequest = MIN_NET_DEBT
      borrowerOperations.openTrove(th._100pct, MIN_NET_DEBT, carol, carol, { from: alice, value: dec(100, 'ether') })

      // Get the expected debt based on the SAI request (adding fee and liq. reserve on top)
      const expectedDebt = SAIRequest
        .add(await troveManager.getBorrowingFee(SAIRequest))
        .add(SAI_GAS_COMPENSATION)

      const debt_After = await getTroveEntireDebt(alice)
      const coll_After = await getTroveEntireColl(alice)
      const status_After = await troveManager.getTroveStatus(alice)

      // check coll and debt after
      assert.isTrue(coll_After.gt('0'))
      assert.isTrue(debt_After.gt('0'))

      assert.isTrue(debt_After.eq(expectedDebt))

      // check active status
      assert.equal(status_After, 1)
    })

    it("openTrove(): adds Trove owner to TroveOwners array", async () => {
      const TroveOwnersCount_Before = (await troveManager.getTroveOwnersCount()).toString();
      assert.equal(TroveOwnersCount_Before, '0')

      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(15, 17)), extraParams: { from: alice } })

      const TroveOwnersCount_After = (await troveManager.getTroveOwnersCount()).toString();
      assert.equal(TroveOwnersCount_After, '1')
    })

    it("openTrove(): creates a stake and adds it to total stakes", async () => {
      const aliceStakeBefore = await getTroveStake(alice)
      const totalStakesBefore = await troveManager.totalStakes()

      assert.equal(aliceStakeBefore, '0')
      assert.equal(totalStakesBefore, '0')

      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const aliceCollAfter = await getTroveEntireColl(alice)
      const aliceStakeAfter = await getTroveStake(alice)
      assert.isTrue(aliceCollAfter.gt(toBN('0')))
      assert.isTrue(aliceStakeAfter.eq(aliceCollAfter))

      const totalStakesAfter = await troveManager.totalStakes()

      assert.isTrue(totalStakesAfter.eq(aliceStakeAfter))
    })

    it("openTrove(): inserts Trove to Sorted Troves list", async () => {
      // Check before
      const aliceTroveInList_Before = await sortedTroves.contains(alice)
      const listIsEmpty_Before = await sortedTroves.isEmpty()
      assert.equal(aliceTroveInList_Before, false)
      assert.equal(listIsEmpty_Before, true)

      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // check after
      const aliceTroveInList_After = await sortedTroves.contains(alice)
      const listIsEmpty_After = await sortedTroves.isEmpty()
      assert.equal(aliceTroveInList_After, true)
      assert.equal(listIsEmpty_After, false)
    })

    it("openTrove(): Increases the activePool SEI and raw Sei balance by correct amount", async () => {
      const activePool_SEI_Before = await activePool.getSEI()
      const activePool_RawSei_Before = await web3.eth.getBalance(activePool.address)
      assert.equal(activePool_SEI_Before, 0)
      assert.equal(activePool_RawSei_Before, 0)

      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const aliceCollAfter = await getTroveEntireColl(alice)

      const activePool_SEI_After = await activePool.getSEI()
      const activePool_RawSei_After = toBN(await web3.eth.getBalance(activePool.address))
      assert.isTrue(activePool_SEI_After.eq(aliceCollAfter))
      assert.isTrue(activePool_RawSei_After.eq(aliceCollAfter))
    })

    it("openTrove(): records up-to-date initial snapshots of L_SEI and L_SAIDebt", async () => {
      // --- SETUP ---

      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      // --- TEST ---

      // price drops to 1SEI:100SAI, reducing Carol's ICR below MCR
      await priceFeed.setPrice(dec(100, 18));

      // close Carol's Trove, liquidating her 1 Sei and 180SAI.
      const liquidationTx = await troveManager.liquidate(carol, { from: owner });
      const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

      /* with total stakes = 10 Sei, after liquidation, L_SEI should equal 1/10 Sei per-Sei-staked,
       and L_SAI should equal 18 SAI per-Sei-staked. */

      const L_SEI = await troveManager.L_SEI()
      const L_SAI = await troveManager.L_SAIDebt()

      assert.isTrue(L_SEI.gt(toBN('0')))
      assert.isTrue(L_SAI.gt(toBN('0')))

      // Bob opens trove
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: bob } })

      // Check Bob's snapshots of L_SEI and L_SAI equal the respective current values
      const bob_rewardSnapshot = await troveManager.rewardSnapshots(bob)
      const bob_SEIrewardSnapshot = bob_rewardSnapshot[0]
      const bob_SAIDebtRewardSnapshot = bob_rewardSnapshot[1]

      assert.isAtMost(th.getDifference(bob_SEIrewardSnapshot, L_SEI), 1000)
      assert.isAtMost(th.getDifference(bob_SAIDebtRewardSnapshot, L_SAI), 1000)
    })

    it("openTrove(): allows a user to open a Trove, then close it, then re-open it", async () => {
      // Open Troves
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: whale } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: carol } })

      // Check Trove is active
      const alice_Trove_1 = await troveManager.Troves(alice)
      const status_1 = alice_Trove_1[3]
      assert.equal(status_1, 1)
      assert.isTrue(await sortedTroves.contains(alice))

      // to compensate borrowing fees
      await saiToken.transfer(alice, dec(10000, 18), { from: whale })

      // Repay and close Trove
      await borrowerOperations.closeTrove({ from: alice })

      // Check Trove is closed
      const alice_Trove_2 = await troveManager.Troves(alice)
      const status_2 = alice_Trove_2[3]
      assert.equal(status_2, 2)
      assert.isFalse(await sortedTroves.contains(alice))

      // Re-open Trove
      await openTrove({ extraSAIAmount: toBN(dec(5000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })

      // Check Trove is re-opened
      const alice_Trove_3 = await troveManager.Troves(alice)
      const status_3 = alice_Trove_3[3]
      assert.equal(status_3, 1)
      assert.isTrue(await sortedTroves.contains(alice))
    })

    it("openTrove(): increases the Trove's SAI debt by the correct amount", async () => {
      // check before
      const alice_Trove_Before = await troveManager.Troves(alice)
      const debt_Before = alice_Trove_Before[0]
      assert.equal(debt_Before, 0)

      await borrowerOperations.openTrove(th._100pct, await getOpenTroveSAIAmount(dec(10000, 18)), alice, alice, { from: alice, value: dec(100, 'ether') })

      // check after
      const alice_Trove_After = await troveManager.Troves(alice)
      const debt_After = alice_Trove_After[0]
      th.assertIsApproximatelyEqual(debt_After, dec(10000, 18), 10000)
    })

    it("openTrove(): increases SAI debt in ActivePool by the debt of the trove", async () => {
      const activePool_SAIDebt_Before = await activePool.getSAIDebt()
      assert.equal(activePool_SAIDebt_Before, 0)

      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: alice } })
      const aliceDebt = await getTroveEntireDebt(alice)
      assert.isTrue(aliceDebt.gt(toBN('0')))

      const activePool_SAIDebt_After = await activePool.getSAIDebt()
      assert.isTrue(activePool_SAIDebt_After.eq(aliceDebt))
    })

    it("openTrove(): increases user SAIToken balance by correct amount", async () => {
      // check before
      const alice_SAITokenBalance_Before = await saiToken.balanceOf(alice)
      assert.equal(alice_SAITokenBalance_Before, 0)

      await borrowerOperations.openTrove(th._100pct, dec(10000, 18), alice, alice, { from: alice, value: dec(100, 'ether') })

      // check after
      const alice_SAITokenBalance_After = await saiToken.balanceOf(alice)
      assert.equal(alice_SAITokenBalance_After, dec(10000, 18))
    })

    //  --- getNewICRFromTroveChange - (external wrapper in Tester contract calls internal function) ---

    describe("getNewICRFromTroveChange() returns the correct ICR", async () => {


      // 0, 0
      it("collChange = 0, debtChange = 0", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = 0
        const debtChange = 0

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
        assert.equal(newICR, '2000000000000000000')
      })

      // 0, +ve
      it("collChange = 0, debtChange is positive", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = 0
        const debtChange = dec(50, 18)

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
        assert.isAtMost(th.getDifference(newICR, '1333333333333333333'), 100)
      })

      // 0, -ve
      it("collChange = 0, debtChange is negative", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = 0
        const debtChange = dec(50, 18)

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, false, price)).toString()
        assert.equal(newICR, '4000000000000000000')
      })

      // +ve, 0
      it("collChange is positive, debtChange is 0", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = dec(1, 'ether')
        const debtChange = 0

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
        assert.equal(newICR, '4000000000000000000')
      })

      // -ve, 0
      it("collChange is negative, debtChange is 0", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = dec(5, 17)
        const debtChange = 0

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, false, debtChange, true, price)).toString()
        assert.equal(newICR, '1000000000000000000')
      })

      // -ve, -ve
      it("collChange is negative, debtChange is negative", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = dec(5, 17)
        const debtChange = dec(50, 18)

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, false, debtChange, false, price)).toString()
        assert.equal(newICR, '2000000000000000000')
      })

      // +ve, +ve 
      it("collChange is positive, debtChange is positive", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = dec(1, 'ether')
        const debtChange = dec(100, 18)

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, true, price)).toString()
        assert.equal(newICR, '2000000000000000000')
      })

      // +ve, -ve
      it("collChange is positive, debtChange is negative", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = dec(1, 'ether')
        const debtChange = dec(50, 18)

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, true, debtChange, false, price)).toString()
        assert.equal(newICR, '8000000000000000000')
      })

      // -ve, +ve
      it("collChange is negative, debtChange is positive", async () => {
        price = await priceFeed.getPrice()
        const initialColl = dec(1, 'ether')
        const initialDebt = dec(100, 18)
        const collChange = dec(5, 17)
        const debtChange = dec(100, 18)

        const newICR = (await borrowerOperations.getNewICRFromTroveChange(initialColl, initialDebt, collChange, false, debtChange, true, price)).toString()
        assert.equal(newICR, '500000000000000000')
      })
    })

    // --- getCompositeDebt ---

    it("getCompositeDebt(): returns debt + gas comp", async () => {
      const res1 = await borrowerOperations.getCompositeDebt('0')
      assert.equal(res1, SAI_GAS_COMPENSATION.toString())

      const res2 = await borrowerOperations.getCompositeDebt(dec(90, 18))
      th.assertIsApproximatelyEqual(res2, SAI_GAS_COMPENSATION.add(toBN(dec(90, 18))))

      const res3 = await borrowerOperations.getCompositeDebt(dec(24423422357345049, 12))
      th.assertIsApproximatelyEqual(res3, SAI_GAS_COMPENSATION.add(toBN(dec(24423422357345049, 12))))
    })

    //  --- getNewTCRFromTroveChange  - (external wrapper in Tester contract calls internal function) ---

    describe("getNewTCRFromTroveChange() returns the correct TCR", async () => {

      // 0, 0
      it("collChange = 0, debtChange = 0", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = 0
        const debtChange = 0
        const newTCR = await borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price)

        const expectedTCR = (troveColl.add(liquidatedColl)).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // 0, +ve
      it("collChange = 0, debtChange is positive", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = 0
        const debtChange = dec(200, 18)
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price))

        const expectedTCR = (troveColl.add(liquidatedColl)).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt).add(toBN(debtChange)))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // 0, -ve
      it("collChange = 0, debtChange is negative", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()
        // --- TEST ---
        const collChange = 0
        const debtChange = dec(100, 18)
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, false, price))

        const expectedTCR = (troveColl.add(liquidatedColl)).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt).sub(toBN(dec(100, 18))))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // +ve, 0
      it("collChange is positive, debtChange is 0", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()
        // --- TEST ---
        const collChange = dec(2, 'ether')
        const debtChange = 0
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price))

        const expectedTCR = (troveColl.add(liquidatedColl).add(toBN(collChange))).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // -ve, 0
      it("collChange is negative, debtChange is 0", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = dec(1, 18)
        const debtChange = 0
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, false, debtChange, true, price))

        const expectedTCR = (troveColl.add(liquidatedColl).sub(toBN(dec(1, 'ether')))).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // -ve, -ve
      it("collChange is negative, debtChange is negative", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = dec(1, 18)
        const debtChange = dec(100, 18)
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, false, debtChange, false, price))

        const expectedTCR = (troveColl.add(liquidatedColl).sub(toBN(dec(1, 'ether')))).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt).sub(toBN(dec(100, 18))))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // +ve, +ve 
      it("collChange is positive, debtChange is positive", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = dec(1, 'ether')
        const debtChange = dec(100, 18)
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, true, price))

        const expectedTCR = (troveColl.add(liquidatedColl).add(toBN(dec(1, 'ether')))).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt).add(toBN(dec(100, 18))))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // +ve, -ve
      it("collChange is positive, debtChange is negative", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = dec(1, 'ether')
        const debtChange = dec(100, 18)
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, true, debtChange, false, price))

        const expectedTCR = (troveColl.add(liquidatedColl).add(toBN(dec(1, 'ether')))).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt).sub(toBN(dec(100, 18))))

        assert.isTrue(newTCR.eq(expectedTCR))
      })

      // -ve, +ve
      it("collChange is negative, debtChange is positive", async () => {
        // --- SETUP --- Create a Fluid instance with an Active Pool and pending rewards (Default Pool)
        const troveColl = toBN(dec(1000, 'ether'))
        const troveTotalDebt = toBN(dec(100000, 18))
        const troveSAIAmount = await getOpenTroveSAIAmount(troveTotalDebt)
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, alice, alice, { from: alice, value: troveColl })
        await borrowerOperations.openTrove(th._100pct, troveSAIAmount, bob, bob, { from: bob, value: troveColl })

        await priceFeed.setPrice(dec(100, 18))

        const liquidationTx = await troveManager.liquidate(bob)
        assert.isFalse(await sortedTroves.contains(bob))

        const [liquidatedDebt, liquidatedColl, gasComp] = th.getEmittedLiquidationValues(liquidationTx)

        await priceFeed.setPrice(dec(200, 18))
        const price = await priceFeed.getPrice()

        // --- TEST ---
        const collChange = dec(1, 18)
        const debtChange = await getNetBorrowingAmount(dec(200, 18))
        const newTCR = (await borrowerOperations.getNewTCRFromTroveChange(collChange, false, debtChange, true, price))

        const expectedTCR = (troveColl.add(liquidatedColl).sub(toBN(collChange))).mul(price)
          .div(troveTotalDebt.add(liquidatedDebt).add(toBN(debtChange)))

        assert.isTrue(newTCR.eq(expectedTCR))
      })
    })

    if (!withProxy) {
      it('closeTrove(): fails if owner cannot receive SEI', async () => {
        const nonPayable = await NonPayable.new()

        // we need 2 troves to be able to close 1 and have 1 remaining in the system
        await borrowerOperations.openTrove(th._100pct, dec(100000, 18), alice, alice, { from: alice, value: dec(1000, 18) })

        // Alice sends SAI to NonPayable so its SAI balance covers its debt
        await saiToken.transfer(nonPayable.address, dec(10000, 18), {from: alice})

        // open trove from NonPayable proxy contract
        const _100pctHex = '0xde0b6b3a7640000'
        const _1e25Hex = '0xd3c21bcecceda1000000'
        const openTroveData = th.getTransactionData('openTrove(uint256,uint256,address,address)', [_100pctHex, _1e25Hex, '0x0', '0x0'])
        await nonPayable.forward(borrowerOperations.address, openTroveData, { value: dec(10000, 'ether') })
        assert.equal((await troveManager.getTroveStatus(nonPayable.address)).toString(), '1', 'NonPayable proxy should have a trove')
        assert.isFalse(await th.checkRecoveryMode(contracts), 'System should not be in Recovery Mode')
        // open trove from NonPayable proxy contract
        const closeTroveData = th.getTransactionData('closeTrove()', [])
        await th.assertRevert(nonPayable.forward(borrowerOperations.address, closeTroveData), 'ActivePool: sending SEI failed')
      })
    }
  }

  describe('Without proxy', async () => {
    testCorpus({ withProxy: false })
  })

  // describe('With proxy', async () => {
  //   testCorpus({ withProxy: true })
  // })
})

contract('Reset chain state', async accounts => { })

/* TODO:

 1) Test SortedList re-ordering by ICR. ICR ratio
 changes with addColl, withdrawColl, withdrawSAI, repaySAI, etc. Can split them up and put them with
 individual functions, or give ordering it's own 'describe' block.

 2)In security phase:
 -'Negative' tests for all the above functions.
 */