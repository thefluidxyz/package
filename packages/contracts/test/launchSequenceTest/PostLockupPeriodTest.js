const deploymentHelper = require("../../utils/deploymentHelpers.js")
const testHelpers = require("../../utils/testHelpers.js")

const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const { dec, toBN, assertRevert } = th

contract('After the initial lockup period has passed', async accounts => {
  const [
    fluidAG,
    teamMember_1,
    teamMember_2,
    teamMember_3,
    investor_1,
    investor_2,
    investor_3,
    A, B, C, D, E, F, G, H, I, J, K] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

  const SECONDS_IN_ONE_DAY = timeValues.SECONDS_IN_ONE_DAY
  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH
  const SECONDS_IN_ONE_YEAR = timeValues.SECONDS_IN_ONE_YEAR
  const maxBytes32 = th.maxBytes32

  let FLOContracts
  let coreContracts

  // LCs for team members on vesting schedules
  let LC_T1
  let LC_T2
  let LC_T3

  // LCs for investors
  let LC_I1
  let LC_I2
  let LC_I3

  // 1e24 = 1 million tokens with 18 decimal digits
  const teamMemberInitialEntitlement_1 = dec(1, 24)
  const teamMemberInitialEntitlement_2 = dec(2, 24)
  const teamMemberInitialEntitlement_3 = dec(3, 24)

  const investorInitialEntitlement_1 = dec(4, 24)
  const investorInitialEntitlement_2 = dec(5, 24)
  const investorInitialEntitlement_3 = dec(6, 24)

  const teamMemberMonthlyVesting_1 = dec(1, 23)
  const teamMemberMonthlyVesting_2 = dec(2, 23)
  const teamMemberMonthlyVesting_3 = dec(3, 23)

  const FLOEntitlement_A = dec(1, 24)
  const FLOEntitlement_B = dec(2, 24)
  const FLOEntitlement_C = dec(3, 24)
  const FLOEntitlement_D = dec(4, 24)
  const FLOEntitlement_E = dec(5, 24)

  let oneYearFromSystemDeployment
  let twoYearsFromSystemDeployment
  let justOverOneYearFromSystemDeployment
  let _18monthsFromSystemDeployment

  beforeEach(async () => {
    // Deploy all contracts from the first account
    FLOContracts = await deploymentHelper.deployFLOTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisig)
    coreContracts = await deploymentHelper.deployFluidCore()

    floStaking = FLOContracts.floStaking
    floToken = FLOContracts.floToken
    communityIssuance = FLOContracts.communityIssuance
    lockupContractFactory = FLOContracts.lockupContractFactory

    await deploymentHelper.connectFLOContracts(FLOContracts)
    await deploymentHelper.connectCoreContracts(coreContracts, FLOContracts)
    await deploymentHelper.connectFLOContractsToCore(FLOContracts, coreContracts)

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(floToken, web3, timeValues.SECONDS_IN_ONE_YEAR)
    justOverOneYearFromSystemDeployment = oneYearFromSystemDeployment.add(toBN('1'))

    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN('2'))
    const secondsIn18Months = toBN(timeValues.SECONDS_IN_ONE_MONTH).mul(toBN('18'))
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(floToken, web3, secondsInTwoYears)
    _18monthsFromSystemDeployment = await th.getTimeFromSystemDeployment(floToken, web3, secondsIn18Months)

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory.deployLockupContract(teamMember_1, oneYearFromSystemDeployment, { from: fluidAG })
    const deployedLCtx_T2 = await lockupContractFactory.deployLockupContract(teamMember_2, oneYearFromSystemDeployment, { from: fluidAG })
    const deployedLCtx_T3 = await lockupContractFactory.deployLockupContract(teamMember_3, oneYearFromSystemDeployment, { from: fluidAG })

    const deployedLCtx_I1 = await lockupContractFactory.deployLockupContract(investor_1, oneYearFromSystemDeployment, { from: fluidAG })
    const deployedLCtx_I2 = await lockupContractFactory.deployLockupContract(investor_2, oneYearFromSystemDeployment, { from: fluidAG })
    const deployedLCtx_I3 = await lockupContractFactory.deployLockupContract(investor_3, oneYearFromSystemDeployment, { from: fluidAG })

    // LCs for team members on vesting schedules
    LC_T1 = await th.getLCFromDeploymentTx(deployedLCtx_T1)
    LC_T2 = await th.getLCFromDeploymentTx(deployedLCtx_T2)
    LC_T3 = await th.getLCFromDeploymentTx(deployedLCtx_T3)

    // LCs for investors
    LC_I1 = await th.getLCFromDeploymentTx(deployedLCtx_I1)
    LC_I2 = await th.getLCFromDeploymentTx(deployedLCtx_I2)
    LC_I3 = await th.getLCFromDeploymentTx(deployedLCtx_I3)

    // Multisig transfers initial FLO entitlements to LCs
    await floToken.transfer(LC_T1.address, teamMemberInitialEntitlement_1, { from: multisig })
    await floToken.transfer(LC_T2.address, teamMemberInitialEntitlement_2, { from: multisig })
    await floToken.transfer(LC_T3.address, teamMemberInitialEntitlement_3, { from: multisig })

    await floToken.transfer(LC_I1.address, investorInitialEntitlement_1, { from: multisig })
    await floToken.transfer(LC_I2.address, investorInitialEntitlement_2, { from: multisig })
    await floToken.transfer(LC_I3.address, investorInitialEntitlement_3, { from: multisig })

    const systemDeploymentTime = await floToken.getDeploymentStartTime()

    // Every thirty days, mutlsig transfers vesting amounts to team members
    for (i = 0; i < 12; i++) {
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      await floToken.transfer(LC_T1.address, teamMemberMonthlyVesting_1, { from: multisig })
      await floToken.transfer(LC_T2.address, teamMemberMonthlyVesting_2, { from: multisig })
      await floToken.transfer(LC_T3.address, teamMemberMonthlyVesting_3, { from: multisig })
    }

    // After Since only 360 days have passed, fast forward 5 more days, until LCs unlock
    await th.fastForwardTime((SECONDS_IN_ONE_DAY * 5), web3.currentProvider)

    const endTime = toBN(await th.getLatestBlockTimestamp(web3))

    const timePassed = endTime.sub(systemDeploymentTime)
    // Confirm that just over one year has passed -  not more than 1000 seconds 
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).lt(toBN('1000')))
    assert.isTrue(timePassed.sub(toBN(SECONDS_IN_ONE_YEAR)).gt(toBN('0')))
  })

  describe('Deploying new LCs', async accounts => {
    it("FLO Deployer can deploy new LCs", async () => {
      // FLO deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(A, justOverOneYearFromSystemDeployment, { from: fluidAG })
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: fluidAG })
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(C, '9595995999999900000023423234', { from: fluidAG })

      assert.isTrue(LCDeploymentTx_A.receipt.status)
      assert.isTrue(LCDeploymentTx_B.receipt.status)
      assert.isTrue(LCDeploymentTx_C.receipt.status)
    })

    it("Anyone can deploy new LCs", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(A, justOverOneYearFromSystemDeployment, { from: teamMember_1 })
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(C, oneYearFromSystemDeployment, { from: investor_2 })
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(fluidAG, '9595995999999900000023423234', { from: A })

      assert.isTrue(LCDeploymentTx_1.receipt.status)
      assert.isTrue(LCDeploymentTx_2.receipt.status)
      assert.isTrue(LCDeploymentTx_3.receipt.status)
    })

    it("Anyone can deploy new LCs with unlockTime in the past", async () => {
      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider )
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(A, justOverOneYearFromSystemDeployment, { from: teamMember_1 })
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: E })
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(C, _18monthsFromSystemDeployment, { from: multisig })
      
      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1)
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2)
      const LC_3 = await th.getLCFromDeploymentTx(LCDeploymentTx_3)

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status)
      assert.isTrue(LCDeploymentTx_2.receipt.status)
      assert.isTrue(LCDeploymentTx_3.receipt.status)

      // Check LCs have unlockTimes in the past
      unlockTime_1 = await LC_1.unlockTime()
      unlockTime_2 = await LC_2.unlockTime()
      unlockTime_3 = await LC_3.unlockTime()

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      assert.isTrue(unlockTime_1.lt(currentTime))
      assert.isTrue(unlockTime_2.lt(currentTime))
      assert.isTrue(unlockTime_3.lt(currentTime))
    })

    it("Anyone can deploy new LCs with unlockTime in the future", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(A, twoYearsFromSystemDeployment, { from: teamMember_1 })
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: E })
    
      const LC_1 = await th.getLCFromDeploymentTx(LCDeploymentTx_1)
      const LC_2 = await th.getLCFromDeploymentTx(LCDeploymentTx_2)

      // Check deployments succeeded
      assert.isTrue(LCDeploymentTx_1.receipt.status)
      assert.isTrue(LCDeploymentTx_2.receipt.status)

      // Check LCs have unlockTimes in the future
      unlockTime_1 = await LC_1.unlockTime()
      unlockTime_2 = await LC_2.unlockTime()

      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      assert.isTrue(unlockTime_1.gt(currentTime))
      assert.isTrue(unlockTime_2.gt(currentTime))
    })
  })

  describe('Beneficiary withdrawal from initial LC', async accounts => {
    it("A beneficiary can withdraw their full entitlement from their LC", async () => {

      // Check FLO balances of investors' LCs are equal to their initial entitlements
      assert.equal(await floToken.balanceOf(LC_I1.address), investorInitialEntitlement_1)
      assert.equal(await floToken.balanceOf(LC_I2.address), investorInitialEntitlement_2)
      assert.equal(await floToken.balanceOf(LC_I3.address), investorInitialEntitlement_3)

      // Check FLO balances of investors are 0
      assert.equal(await floToken.balanceOf(investor_1), '0')
      assert.equal(await floToken.balanceOf(investor_2), '0')
      assert.equal(await floToken.balanceOf(investor_3), '0')

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawFLO({ from: investor_1 })
      await LC_I2.withdrawFLO({ from: investor_2 })
      await LC_I3.withdrawFLO({ from: investor_3 })

      // Check FLO balances of investors now equal their entitlements
      assert.equal(await floToken.balanceOf(investor_1), investorInitialEntitlement_1)
      assert.equal(await floToken.balanceOf(investor_2), investorInitialEntitlement_2)
      assert.equal(await floToken.balanceOf(investor_3), investorInitialEntitlement_3)

      // Check FLO balances of investors' LCs are now 0
      assert.equal(await floToken.balanceOf(LC_I1.address), '0')
      assert.equal(await floToken.balanceOf(LC_I2.address), '0')
      assert.equal(await floToken.balanceOf(LC_I3.address), '0')
    })

    it("A beneficiary on a vesting schedule can withdraw their total vested amount from their LC", async () => {
      // Get FLO balances of LCs for beneficiaries (team members) on vesting schedules
      const FLOBalanceOfLC_T1_Before = await floToken.balanceOf(LC_T1.address)
      const FLOBalanceOfLC_T2_Before = await floToken.balanceOf(LC_T2.address)
      const FLOBalanceOfLC_T3_Before = await floToken.balanceOf(LC_T3.address)

      // Check FLO balances of vesting beneficiaries' LCs are greater than their initial entitlements
      assert.isTrue(FLOBalanceOfLC_T1_Before.gt(th.toBN(teamMemberInitialEntitlement_1)))
      assert.isTrue(FLOBalanceOfLC_T2_Before.gt(th.toBN(teamMemberInitialEntitlement_2)))
      assert.isTrue(FLOBalanceOfLC_T3_Before.gt(th.toBN(teamMemberInitialEntitlement_3)))

      // Check FLO balances of beneficiaries are 0
      assert.equal(await floToken.balanceOf(teamMember_1), '0')
      assert.equal(await floToken.balanceOf(teamMember_2), '0')
      assert.equal(await floToken.balanceOf(teamMember_3), '0')

      // All beneficiaries withdraw from their respective LCs
      await LC_T1.withdrawFLO({ from: teamMember_1 })
      await LC_T2.withdrawFLO({ from: teamMember_2 })
      await LC_T3.withdrawFLO({ from: teamMember_3 })

      // Check beneficiaries' FLO balances now equal their accumulated vested entitlements
      assert.isTrue((await floToken.balanceOf(teamMember_1)).eq(FLOBalanceOfLC_T1_Before))
      assert.isTrue((await floToken.balanceOf(teamMember_2)).eq(FLOBalanceOfLC_T2_Before))
      assert.isTrue((await floToken.balanceOf(teamMember_3)).eq(FLOBalanceOfLC_T3_Before))

      // Check FLO balances of beneficiaries' LCs are now 0
      assert.equal(await floToken.balanceOf(LC_T1.address), '0')
      assert.equal(await floToken.balanceOf(LC_T2.address), '0')
      assert.equal(await floToken.balanceOf(LC_T3.address), '0')
    })

    it("Beneficiaries can withraw full FLO balance of LC if it has increased since lockup period ended", async () => {
      // Check FLO balances of investors' LCs are equal to their initial entitlements
      assert.equal(await floToken.balanceOf(LC_I1.address), investorInitialEntitlement_1)
      assert.equal(await floToken.balanceOf(LC_I2.address), investorInitialEntitlement_2)
      assert.equal(await floToken.balanceOf(LC_I3.address), investorInitialEntitlement_3)

      // Check FLO balances of investors are 0
      assert.equal(await floToken.balanceOf(investor_1), '0')
      assert.equal(await floToken.balanceOf(investor_2), '0')
      assert.equal(await floToken.balanceOf(investor_3), '0')

      // FLO multisig sends extra FLO to investor LCs
      await floToken.transfer(LC_I1.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_I2.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_I3.address, dec(1, 24), { from: multisig })

      // 1 month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      // FLO multisig again sends extra FLO to investor LCs
      await floToken.transfer(LC_I1.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_I2.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_I3.address, dec(1, 24), { from: multisig })

      // Get FLO balances of LCs for investors 
      const FLOBalanceOfLC_I1_Before = await floToken.balanceOf(LC_I1.address)
      const FLOBalanceOfLC_I2_Before = await floToken.balanceOf(LC_I2.address)
      const FLOBalanceOfLC_I3_Before = await floToken.balanceOf(LC_I3.address)

      // Check FLO balances of investors' LCs are greater than their initial entitlements
      assert.isTrue(FLOBalanceOfLC_I1_Before.gt(th.toBN(investorInitialEntitlement_1)))
      assert.isTrue(FLOBalanceOfLC_I2_Before.gt(th.toBN(investorInitialEntitlement_2)))
      assert.isTrue(FLOBalanceOfLC_I3_Before.gt(th.toBN(investorInitialEntitlement_3)))

      // All investors withdraw from their respective LCs
      await LC_I1.withdrawFLO({ from: investor_1 })
      await LC_I2.withdrawFLO({ from: investor_2 })
      await LC_I3.withdrawFLO({ from: investor_3 })

      // Check FLO balances of investors now equal their LC balances prior to withdrawal
      assert.isTrue((await floToken.balanceOf(investor_1)).eq(FLOBalanceOfLC_I1_Before))
      assert.isTrue((await floToken.balanceOf(investor_2)).eq(FLOBalanceOfLC_I2_Before))
      assert.isTrue((await floToken.balanceOf(investor_3)).eq(FLOBalanceOfLC_I3_Before))

      // Check FLO balances of investors' LCs are now 0
      assert.equal(await floToken.balanceOf(LC_I1.address), '0')
      assert.equal(await floToken.balanceOf(LC_I2.address), '0')
      assert.equal(await floToken.balanceOf(LC_I3.address), '0')
    })
  })

  describe('Withdrawal attempts from LCs by non-beneficiaries', async accounts => {
    it("FLO Multisig can't withdraw from a LC they deployed through the Factory", async () => {
      try {
        const withdrawalAttempt = await LC_T1.withdrawFLO({ from: multisig })
        assert.isFalse(withdrawalAttempt.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary")
      }
    })

    it("FLO Multisig can't withdraw from a LC that someone else deployed", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      //FLO multisig fund the newly deployed LCs
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      // FLO multisig attempts withdrawal from LC
      try {
        const withdrawalAttempt_B = await LC_B.withdrawFLO({ from: multisig })
        assert.isFalse(withdrawalAttempt_B.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary")
      }
    })

    it("Non-beneficiaries cannot withdraw from a LC", async () => {
      const variousEOAs = [
        teamMember_1,
        teamMember_3,
        fluidAG,
        investor_1,
        investor_2,
        investor_3,
        A,
        B,
        C,
        D,
        E]

      // Several EOAs attempt to withdraw from the LC that has teamMember_2 as beneficiary
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_T2.withdrawFLO({ from: account })
          assert.isFalse(withdrawalAttempt.receipt.status)
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary")
        }
      }
    })
  })

  describe('Transferring FLO', async accounts => {
    it("FLO multisig can transfer FLO to LCs they deployed", async () => {
      const initialFLOBalanceOfLC_T1 = await floToken.balanceOf(LC_T1.address)
      const initialFLOBalanceOfLC_T2 = await floToken.balanceOf(LC_T2.address)
      const initialFLOBalanceOfLC_T3 = await floToken.balanceOf(LC_T3.address)

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      // FLO multisig transfers vesting amount
      await floToken.transfer(LC_T1.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_T2.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_T3.address, dec(1, 24), { from: multisig })

      // Get new LC FLO balances
      const FLOBalanceOfLC_T1_1 = await floToken.balanceOf(LC_T1.address)
      const FLOBalanceOfLC_T2_1 = await floToken.balanceOf(LC_T2.address)
      const FLOBalanceOfLC_T3_1 = await floToken.balanceOf(LC_T3.address)

      // // Check team member LC balances have increased 
      assert.isTrue(FLOBalanceOfLC_T1_1.eq(th.toBN(initialFLOBalanceOfLC_T1).add(th.toBN(dec(1, 24)))))
      assert.isTrue(FLOBalanceOfLC_T2_1.eq(th.toBN(initialFLOBalanceOfLC_T2).add(th.toBN(dec(1, 24)))))
      assert.isTrue(FLOBalanceOfLC_T3_1.eq(th.toBN(initialFLOBalanceOfLC_T3).add(th.toBN(dec(1, 24)))))

      // Another month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      // FLO multisig transfers vesting amount
      await floToken.transfer(LC_T1.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_T2.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_T3.address, dec(1, 24), { from: multisig })

      // Get new LC FLO balances
      const FLOBalanceOfLC_T1_2 = await floToken.balanceOf(LC_T1.address)
      const FLOBalanceOfLC_T2_2 = await floToken.balanceOf(LC_T2.address)
      const FLOBalanceOfLC_T3_2 = await floToken.balanceOf(LC_T3.address)

      // Check team member LC balances have increased again
      assert.isTrue(FLOBalanceOfLC_T1_2.eq(FLOBalanceOfLC_T1_1.add(th.toBN(dec(1, 24)))))
      assert.isTrue(FLOBalanceOfLC_T2_2.eq(FLOBalanceOfLC_T2_1.add(th.toBN(dec(1, 24)))))
      assert.isTrue(FLOBalanceOfLC_T3_2.eq(FLOBalanceOfLC_T3_1.add(th.toBN(dec(1, 24)))))
    })

    it("FLO multisig can transfer tokens to LCs deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract ith themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: A })
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, justOverOneYearFromSystemDeployment, { from: B })
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(C, twoYearsFromSystemDeployment, { from: C })

      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A)
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C)

      // Check balances of LCs are 0
      assert.equal(await floToken.balanceOf(LC_A.address), '0')
      assert.equal(await floToken.balanceOf(LC_B.address), '0')
      assert.equal(await floToken.balanceOf(LC_C.address), '0')

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      // FLO multisig transfers FLO to LCs deployed by other accounts
      await floToken.transfer(LC_A.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_B.address, dec(2, 24), { from: multisig })
      await floToken.transfer(LC_C.address, dec(3, 24), { from: multisig })

      // Check balances of LCs have increased
      assert.equal(await floToken.balanceOf(LC_A.address), dec(1, 24))
      assert.equal(await floToken.balanceOf(LC_B.address), dec(2, 24))
      assert.equal(await floToken.balanceOf(LC_C.address), dec(3, 24))
    })

    it("FLO multisig can transfer FLO directly to any externally owned account", async () => {
      // Check FLO balances of EOAs
      assert.equal(await floToken.balanceOf(A), '0')
      assert.equal(await floToken.balanceOf(B), '0')
      assert.equal(await floToken.balanceOf(C), '0')

      // FLO multisig transfers FLO to EOAs
      const txA = await floToken.transfer(A, dec(1, 24), { from: multisig })
      const txB = await floToken.transfer(B, dec(2, 24), { from: multisig })
      const txC = await floToken.transfer(C, dec(3, 24), { from: multisig })

      // Check new balances have increased by correct amount
      assert.equal(await floToken.balanceOf(A), dec(1, 24))
      assert.equal(await floToken.balanceOf(B), dec(2, 24))
      assert.equal(await floToken.balanceOf(C), dec(3, 24))
    })

    it("Anyone can transfer FLO to LCs deployed by anyone", async () => {
      // Start D, E, F with some FLO
      await floToken.transfer(D, dec(1, 24), { from: multisig })
      await floToken.transfer(E, dec(2, 24), { from: multisig })
      await floToken.transfer(F, dec(3, 24), { from: multisig })

      // H, I, J deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: H })
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, justOverOneYearFromSystemDeployment, { from: I })
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(C, twoYearsFromSystemDeployment, { from: J })

      // Grab contract addresses from deployment tx events
      const LCAddress_A = await th.getLCAddressFromDeploymentTx(deployedLCtx_A)
      const LCAddress_B = await th.getLCAddressFromDeploymentTx(deployedLCtx_B)
      const LCAddress_C = await th.getLCAddressFromDeploymentTx(deployedLCtx_C)

      // Check balances of LCs are 0
      assert.equal(await floToken.balanceOf(LCAddress_A), '0')
      assert.equal(await floToken.balanceOf(LCAddress_B), '0')
      assert.equal(await floToken.balanceOf(LCAddress_C), '0')

      // D, E, F transfer FLO to LCs
      await floToken.transfer(LCAddress_A, dec(1, 24), { from: D })
      await floToken.transfer(LCAddress_B, dec(2, 24), { from: E })
      await floToken.transfer(LCAddress_C, dec(3, 24), { from: F })

      // Check balances of LCs has increased
      assert.equal(await floToken.balanceOf(LCAddress_A), dec(1, 24))
      assert.equal(await floToken.balanceOf(LCAddress_B), dec(2, 24))
      assert.equal(await floToken.balanceOf(LCAddress_C), dec(3, 24))
    })


    it("Anyone can transfer to an EOA", async () => {
      // Start D, E, fluidAG with some FLO
      await floToken.unprotectedMint(D, dec(1, 24))
      await floToken.unprotectedMint(E, dec(2, 24))
      await floToken.unprotectedMint(fluidAG, dec(3, 24))
      await floToken.unprotectedMint(multisig, dec(4, 24))

      // FLO holders transfer to other EOAs
      const FLOtransferTx_1 = await floToken.transfer(A, dec(1, 18), { from: D })
      const FLOtransferTx_2 = await floToken.transfer(fluidAG, dec(1, 18), { from: E })
      const FLOtransferTx_3 = await floToken.transfer(F, dec(1, 18), { from: fluidAG })
      const FLOtransferTx_4 = await floToken.transfer(G, dec(1, 18), { from: multisig })

      assert.isTrue(FLOtransferTx_1.receipt.status)
      assert.isTrue(FLOtransferTx_2.receipt.status)
      assert.isTrue(FLOtransferTx_3.receipt.status)
      assert.isTrue(FLOtransferTx_4.receipt.status)
    })

    it("Anyone can approve any EOA to spend their FLO", async () => {
      // EOAs approve EOAs to spend FLO
      const FLOapproveTx_1 = await floToken.approve(A, dec(1, 18), { from: multisig })
      const FLOapproveTx_2 = await floToken.approve(B, dec(1, 18), { from: G })
      const FLOapproveTx_3 = await floToken.approve(fluidAG, dec(1, 18), { from: F })
      await assert.isTrue(FLOapproveTx_1.receipt.status)
      await assert.isTrue(FLOapproveTx_2.receipt.status)
      await assert.isTrue(FLOapproveTx_3.receipt.status)
    })

    it("Anyone can increaseAllowance for any EOA or Fluid contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend FLO
      const FLOIncreaseAllowanceTx_1 = await floToken.increaseAllowance(A, dec(1, 18), { from: multisig })
      const FLOIncreaseAllowanceTx_2 = await floToken.increaseAllowance(B, dec(1, 18), { from: G })
      const FLOIncreaseAllowanceTx_3 = await floToken.increaseAllowance(multisig, dec(1, 18), { from: F })
      await assert.isTrue(FLOIncreaseAllowanceTx_1.receipt.status)
      await assert.isTrue(FLOIncreaseAllowanceTx_2.receipt.status)
      await assert.isTrue(FLOIncreaseAllowanceTx_3.receipt.status)

      // Increase allowance of Fluid contracts from F
      for (const contract of Object.keys(coreContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // Increase allowance of Fluid contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // Increase allowance of FLO contracts from F
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // Increase allowance of LQT contracts from multisig
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }
    })

    it("Anyone can decreaseAllowance for any EOA or Fluid contract", async () => {
      //First, increase allowance of A, B LiqAG and core contracts
      const FLOapproveTx_1 = await floToken.approve(A, dec(1, 18), { from: multisig })
      const FLOapproveTx_2 = await floToken.approve(B, dec(1, 18), { from: G })
      const FLOapproveTx_3 = await floToken.approve(multisig, dec(1, 18), { from: F })
      await assert.isTrue(FLOapproveTx_1.receipt.status)
      await assert.isTrue(FLOapproveTx_2.receipt.status)
      await assert.isTrue(FLOapproveTx_3.receipt.status)

      // --- SETUP ---

      // IncreaseAllowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const FLOtransferTx = await floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOtransferTx.receipt.status)
      }

      // IncreaseAllowance of core contracts, from multisig
      for (const contract of Object.keys(coreContracts)) {
        const FLOtransferTx = await floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assert.isTrue(FLOtransferTx.receipt.status)
      }

      // Increase allowance of FLO contracts from F
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // Increase allowance of LQTT contracts from multisig 
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // --- TEST ---

      // Decrease allowance of A, B, multisig
      const FLODecreaseAllowanceTx_1 = await floToken.decreaseAllowance(A, dec(1, 18), { from: multisig })
      const FLODecreaseAllowanceTx_2 = await floToken.decreaseAllowance(B, dec(1, 18), { from: G })
      const FLODecreaseAllowanceTx_3 = await floToken.decreaseAllowance(multisig, dec(1, 18), { from: F })
      await assert.isTrue(FLODecreaseAllowanceTx_1.receipt.status)
      await assert.isTrue(FLODecreaseAllowanceTx_2.receipt.status)
      await assert.isTrue(FLODecreaseAllowanceTx_3.receipt.status)

      // Decrease allowance of core contracts, from F
      for (const contract of Object.keys(coreContracts)) {
        const FLODecreaseAllowanceTx = await floToken.decreaseAllowance(coreContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLODecreaseAllowanceTx.receipt.status)
      }

      // Decrease allowance of core contracts from multisig
      for (const contract of Object.keys(coreContracts)) {
        const FLODecreaseAllowanceTx = await floToken.decreaseAllowance(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assert.isTrue(FLODecreaseAllowanceTx.receipt.status)
      }

      // Decrease allowance of FLO contracts from F
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.decreaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // Decrease allowance of FLO contracts from multisig
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.decreaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }
    })

    it("Anyone can be the sender in a transferFrom() call", async () => {
      // Fund B, C
      await floToken.unprotectedMint(B, dec(1, 18))
      await floToken.unprotectedMint(C, dec(1, 18))

      // LiqAG, B, C approve F, G, multisig respectively
      await floToken.approve(F, dec(1, 18), { from: multisig })
      await floToken.approve(G, dec(1, 18), { from: B })
      await floToken.approve(multisig, dec(1, 18), { from: C })

      // Approved addresses transfer from the address they're approved for
      const FLOtransferFromTx_1 = await floToken.transferFrom(multisig, F, dec(1, 18), { from: F })
      const FLOtransferFromTx_2 = await floToken.transferFrom(B, multisig, dec(1, 18), { from: G })
      const FLOtransferFromTx_3 = await floToken.transferFrom(C, A, dec(1, 18), { from: multisig })
      await assert.isTrue(FLOtransferFromTx_1.receipt.status)
      await assert.isTrue(FLOtransferFromTx_2.receipt.status)
      await assert.isTrue(FLOtransferFromTx_3.receipt.status)
    })

    it("Anyone can stake their FLO in the staking contract", async () => {
      // Fund F
      await floToken.unprotectedMint(F, dec(1, 18))

      const FLOStakingTx_1 = await floStaking.stake(dec(1, 18), { from: F })
      const FLOStakingTx_2 = await floStaking.stake(dec(1, 18), { from: multisig })
      await assert.isTrue(FLOStakingTx_1.receipt.status)
      await assert.isTrue(FLOStakingTx_2.receipt.status)
    })
  })

  describe('Withdrawal Attempts on new LCs before unlockTime has passed', async accounts => {
    it("FLO Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, before the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.lt(unlockTime))

      // FLO multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawFLO({ from: multisig })
        assert.isFalse(withdrawalAttempt.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary")
      }
    })

    it("FLO Deployer can't withdraw from a funded LC that someone else deployed, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      //FLO multisig fund the newly deployed LCs
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.lt(unlockTime))

      // FLO multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawFLO({ from: multisig })
        assert.isFalse(withdrawalAttempt_B.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary")
      }
    })

    it("Beneficiary can't withdraw from their funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      // FLO multisig funds contracts
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.lt(unlockTime))

      try {
        const beneficiary = await LC_B.beneficiary()
        const withdrawalAttempt = await LC_B.withdrawFLO({ from: beneficiary })
        assert.isFalse(withdrawalAttempt.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: The lockup duration must have passed")
      }
    })

    it("No one can withdraw from a beneficiary's funded LC, before the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      // FLO multisig funds contracts
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      // Check currentTime < unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.lt(unlockTime))

      const variousEOAs = [teamMember_2, multisig, investor_1, A, C, D, E]

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawFLO({ from: account })
          assert.isFalse(withdrawalAttempt.receipt.status)
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary")
        }
      }
    })
  })

  describe('Withdrawals from new LCs after unlockTime has passed', async accounts => {
    it("FLO Deployer can't withdraw from a funded LC they deployed for another beneficiary through the Factory, after the unlockTime", async () => {
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.gt(unlockTime))

      // FLO multisig attempts withdrawal from LC they deployed through the Factory
      try {
        const withdrawalAttempt = await LC_B.withdrawFLO({ from: multisig })
        assert.isFalse(withdrawalAttempt.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary")
      }
    })

    it("FLO multisig can't withdraw from a funded LC when they are not the beneficiary, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      //FLO multisig fund the newly deployed LC
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.gt(unlockTime))

      // FLO multisig attempts withdrawal from LCs
      try {
        const withdrawalAttempt_B = await LC_B.withdrawFLO({ from: multisig })
        assert.isFalse(withdrawalAttempt_B.receipt.status)
      } catch (error) {
        assert.include(error.message, "LockupContract: caller is not the beneficiary")
      }
    })

    it("Beneficiary can withdraw from their funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      // FLO multisig funds contract
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.gt(unlockTime))

      const beneficiary = await LC_B.beneficiary()
      assert.equal(beneficiary, B)

      // Get B's balance before
      const B_balanceBefore = await floToken.balanceOf(B)
      assert.equal(B_balanceBefore, '0')
      
      const withdrawalAttempt = await LC_B.withdrawFLO({ from: B })
      assert.isTrue(withdrawalAttempt.receipt.status)

       // Get B's balance after
       const B_balanceAfter = await floToken.balanceOf(B)
       assert.equal(B_balanceAfter, dec(2, 18))
    })

    it("Non-beneficiaries can't withdraw from a beneficiary's funded LC, after the unlockTime", async () => {
      // Account D deploys a new LC via the Factory
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, _18monthsFromSystemDeployment, { from: D })
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

      // FLO multisig funds contracts
      await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)

      // Check currentTime > unlockTime
      const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
      const unlockTime = await LC_B.unlockTime()
      assert.isTrue(currentTime.gt(unlockTime))

      const variousEOAs = [teamMember_2, fluidAG, investor_1, A, C, D, E]

      // Several EOAs attempt to withdraw from LC deployed by D
      for (account of variousEOAs) {
        try {
          const withdrawalAttempt = await LC_B.withdrawFLO({ from: account })
          assert.isFalse(withdrawalAttempt.receipt.status)
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary")
        }
      }
    })
  })
})
