const LockupContract = artifacts.require("./LockupContract.sol")
const LockupContractFactory = artifacts.require("./LockupContractFactory.sol")
const deploymentHelper = require("../../utils/deploymentHelpers.js")

const { TestHelper: th, TimeValues: timeValues } = require("../../utils/testHelpers.js")
const { dec, toBN, assertRevert, ZERO_ADDRESS } = th

contract('During the initial lockup period', async accounts => {
  const [
    fluidAG,
    teamMember_1,
    teamMember_2,
    teamMember_3,
    investor_1,
    investor_2,
    investor_3,
    A,
    B,
    C,
    D,
    E,
    F,
    G,
    H,
    I
  ] = accounts;

  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

  const SECONDS_IN_ONE_MONTH = timeValues.SECONDS_IN_ONE_MONTH
  const SECONDS_IN_364_DAYS = timeValues.SECONDS_IN_ONE_DAY * 364

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

  const FLOEntitlement_A = dec(1, 24)
  const FLOEntitlement_B = dec(2, 24)
  const FLOEntitlement_C = dec(3, 24)
  const FLOEntitlement_D = dec(4, 24)
  const FLOEntitlement_E = dec(5, 24)

  let oneYearFromSystemDeployment
  let twoYearsFromSystemDeployment

  beforeEach(async () => {
    // Deploy all contracts from the first account
    coreContracts = await deploymentHelper.deployFluidCore()
    FLOContracts = await deploymentHelper.deployFLOTesterContractsHardhat(bountyAddress, lpRewardsAddress, multisig)

    floStaking = FLOContracts.floStaking
    floToken = FLOContracts.floToken
    communityIssuance = FLOContracts.communityIssuance
    lockupContractFactory = FLOContracts.lockupContractFactory

    await deploymentHelper.connectFLOContracts(FLOContracts)
    await deploymentHelper.connectCoreContracts(coreContracts, FLOContracts)
    await deploymentHelper.connectFLOContractsToCore(FLOContracts, coreContracts)

    oneYearFromSystemDeployment = await th.getTimeFromSystemDeployment(floToken, web3, timeValues.SECONDS_IN_ONE_YEAR)
    const secondsInTwoYears = toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN('2'))
    twoYearsFromSystemDeployment = await th.getTimeFromSystemDeployment(floToken, web3, secondsInTwoYears)

    // Deploy 3 LCs for team members on vesting schedules
    const deployedLCtx_T1 = await lockupContractFactory.deployLockupContract(teamMember_1, oneYearFromSystemDeployment, { from: fluidAG })
    const deployedLCtx_T2 = await lockupContractFactory.deployLockupContract(teamMember_2, oneYearFromSystemDeployment, { from: fluidAG })
    const deployedLCtx_T3 = await lockupContractFactory.deployLockupContract(teamMember_3, oneYearFromSystemDeployment, { from: fluidAG })

    // Deploy 3 LCs for investors
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

    // Fast forward time 364 days, so that still less than 1 year since launch has passed
    await th.fastForwardTime(SECONDS_IN_364_DAYS, web3.currentProvider)
  })

  describe('FLO transfer during first year after FLO deployment', async accounts => {
    // --- Fluid AG transfer restriction, 1st year ---
    it("Fluid multisig can not transfer FLO to a LC that was deployed directly", async () => {
      // Fluid multisig deploys LC_A
      const LC_A = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: multisig })

      // Account F deploys LC_B
      const LC_B = await LockupContract.new(floToken.address, B, oneYearFromSystemDeployment, { from: F })

      // FLO deployer deploys LC_C
      const LC_C = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: fluidAG })

      // Fluid multisig attempts FLO transfer to LC_A
      try {
        const FLOtransferTx_A = await floToken.transfer(LC_A.address, dec(1, 18), { from: multisig })
        assert.isFalse(FLOtransferTx_A.receipt.status)
      } catch (error) {
        assert.include(error.message, "FLOToken: recipient must be a LockupContract registered in the Factory")
      }

      // Fluid multisig attempts FLO transfer to LC_B
      try {
        const FLOtransferTx_B = await floToken.transfer(LC_B.address, dec(1, 18), { from: multisig })
        assert.isFalse(FLOtransferTx_B.receipt.status)
      } catch (error) {
        assert.include(error.message, "FLOToken: recipient must be a LockupContract registered in the Factory")
      }

      try {
        const FLOtransferTx_C = await floToken.transfer(LC_C.address, dec(1, 18), { from: multisig })
        assert.isFalse(FLOtransferTx_C.receipt.status)
      } catch (error) {
        assert.include(error.message, "FLOToken: recipient must be a LockupContract registered in the Factory")
      }
    })

    it("Fluid multisig can not transfer to an EOA or Fluid system contracts", async () => {
      // Multisig attempts FLO transfer to EOAs
      const FLOtransferTxPromise_1 = floToken.transfer(A, dec(1, 18), { from: multisig })
      const FLOtransferTxPromise_2 = floToken.transfer(B, dec(1, 18), { from: multisig })
      await assertRevert(FLOtransferTxPromise_1)
      await assertRevert(FLOtransferTxPromise_2)

      // Multisig attempts FLO transfer to core Fluid contracts
      for (const contract of Object.keys(coreContracts)) {
        const FLOtransferTxPromise = floToken.transfer(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLOtransferTxPromise, "FLOToken: recipient must be a LockupContract registered in the Factory")
      }

      // Multisig attempts FLO transfer to FLO contracts (excluding LCs)
      for (const contract of Object.keys(FLOContracts)) {
        const FLOtransferTxPromise = floToken.transfer(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLOtransferTxPromise, "FLOToken: recipient must be a LockupContract registered in the Factory")
      }
    })

    // --- Fluid AG approval restriction, 1st year ---
    it("Fluid multisig can not approve any EOA or Fluid system contract to spend their FLO", async () => {
      // Multisig attempts to approve EOAs to spend FLO
      const FLOApproveTxPromise_1 = floToken.approve(A, dec(1, 18), { from: multisig })
      const FLOApproveTxPromise_2 = floToken.approve(B, dec(1, 18), { from: multisig })
      await assertRevert(FLOApproveTxPromise_1, "FLOToken: caller must not be the multisig")
      await assertRevert(FLOApproveTxPromise_2, "FLOToken: caller must not be the multisig")

      // Multisig attempts to approve Fluid contracts to spend FLO
      for (const contract of Object.keys(coreContracts)) {
        const FLOApproveTxPromise = floToken.approve(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLOApproveTxPromise, "FLOToken: caller must not be the multisig")
      }

      // Multisig attempts to approve FLO contracts to spend FLO (excluding LCs)
      for (const contract of Object.keys(FLOContracts)) {
        const FLOApproveTxPromise = floToken.approve(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLOApproveTxPromise, "FLOToken: caller must not be the multisig")
      }
    })

    // --- Fluid AG increaseAllowance restriction, 1st year ---
    it("Fluid multisig can not increaseAllowance for any EOA or Fluid contract", async () => {
      // Multisig attempts to approve EOAs to spend FLO
      const FLOIncreaseAllowanceTxPromise_1 = floToken.increaseAllowance(A, dec(1, 18), { from: multisig })
      const FLOIncreaseAllowanceTxPromise_2 = floToken.increaseAllowance(B, dec(1, 18), { from: multisig })
      await assertRevert(FLOIncreaseAllowanceTxPromise_1, "FLOToken: caller must not be the multisig")
      await assertRevert(FLOIncreaseAllowanceTxPromise_2, "FLOToken: caller must not be the multisig")

      // Multisig attempts to approve Fluid contracts to spend FLO
      for (const contract of Object.keys(coreContracts)) {
        const FLOIncreaseAllowanceTxPromise = floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLOIncreaseAllowanceTxPromise, "FLOToken: caller must not be the multisig")
      }

      // Multisig attempts to approve FLO contracts to spend FLO (excluding LCs)
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTxPromise = floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLOIncreaseAllowanceTxPromise, "FLOToken: caller must not be the multisig")
      }
    })

    // --- Fluid AG decreaseAllowance restriction, 1st year ---
    it("Fluid multisig can not decreaseAllowance for any EOA or Fluid contract", async () => {
      // Multisig attempts to decreaseAllowance on EOAs 
      const FLODecreaseAllowanceTxPromise_1 = floToken.decreaseAllowance(A, dec(1, 18), { from: multisig })
      const FLODecreaseAllowanceTxPromise_2 = floToken.decreaseAllowance(B, dec(1, 18), { from: multisig })
      await assertRevert(FLODecreaseAllowanceTxPromise_1, "FLOToken: caller must not be the multisig")
      await assertRevert(FLODecreaseAllowanceTxPromise_2, "FLOToken: caller must not be the multisig")

      // Multisig attempts to decrease allowance on Fluid contracts
      for (const contract of Object.keys(coreContracts)) {
        const FLODecreaseAllowanceTxPromise = floToken.decreaseAllowance(coreContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLODecreaseAllowanceTxPromise, "FLOToken: caller must not be the multisig")
      }

      // Multisig attempts to decrease allowance on FLO contracts (excluding LCs)
      for (const contract of Object.keys(FLOContracts)) {
        const FLODecreaseAllowanceTxPromise = floToken.decreaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: multisig })
        await assertRevert(FLODecreaseAllowanceTxPromise, "FLOToken: caller must not be the multisig")
      }
    })

    // --- Fluid multisig transferFrom restriction, 1st year ---
    it("Fluid multisig can not be the sender in a transferFrom() call", async () => {
      // EOAs attempt to use multisig as sender in a transferFrom()
      const FLOtransferFromTxPromise_1 = floToken.transferFrom(multisig, A, dec(1, 18), { from: A })
      const FLOtransferFromTxPromise_2 = floToken.transferFrom(multisig, C, dec(1, 18), { from: B })
      await assertRevert(FLOtransferFromTxPromise_1, "FLOToken: sender must not be the multisig")
      await assertRevert(FLOtransferFromTxPromise_2, "FLOToken: sender must not be the multisig")
    })

    //  --- staking, 1st year ---
    it("Fluid multisig can not stake their FLO in the staking contract", async () => {
      const FLOStakingTxPromise_1 = floStaking.stake(dec(1, 18), { from: multisig })
      await assertRevert(FLOStakingTxPromise_1, "FLOToken: sender must not be the multisig")
    })

    // --- Anyone else ---

    it("Anyone (other than Fluid multisig) can transfer FLO to LCs deployed by anyone through the Factory", async () => {
      // Start D, E, F with some FLO
      await floToken.unprotectedMint(D, dec(1, 24))
      await floToken.unprotectedMint(E, dec(2, 24))
      await floToken.unprotectedMint(F, dec(3, 24))

      // H, I, and Fluid AG deploy lockup contracts with A, B, C as beneficiaries, respectively
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: H })
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: I })
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(C, oneYearFromSystemDeployment, { from: multisig })

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

    it("Anyone (other than Fluid multisig) can transfer FLO to LCs deployed by anyone directly", async () => {
      // Start D, E, F with some FLO
      await floToken.unprotectedMint(D, dec(1, 24))
      await floToken.unprotectedMint(E, dec(2, 24))
      await floToken.unprotectedMint(F, dec(3, 24))

      // H, I, LiqAG deploy lockup contracts with A, B, C as beneficiaries, respectively
      const LC_A = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: H })
      const LC_B = await LockupContract.new(floToken.address, B, oneYearFromSystemDeployment, { from: I })
      const LC_C = await LockupContract.new(floToken.address, C, oneYearFromSystemDeployment, { from: multisig })

      // Check balances of LCs are 0
      assert.equal(await floToken.balanceOf(LC_A.address), '0')
      assert.equal(await floToken.balanceOf(LC_B.address), '0')
      assert.equal(await floToken.balanceOf(LC_C.address), '0')

      // D, E, F transfer FLO to LCs
      await floToken.transfer(LC_A.address, dec(1, 24), { from: D })
      await floToken.transfer(LC_B.address, dec(2, 24), { from: E })
      await floToken.transfer(LC_C.address, dec(3, 24), { from: F })

      // Check balances of LCs has increased
      assert.equal(await floToken.balanceOf(LC_A.address), dec(1, 24))
      assert.equal(await floToken.balanceOf(LC_B.address), dec(2, 24))
      assert.equal(await floToken.balanceOf(LC_C.address), dec(3, 24))
    })

    it("Anyone (other than fluid multisig) can transfer to an EOA", async () => {
      // Start D, E, F with some FLO
      await floToken.unprotectedMint(D, dec(1, 24))
      await floToken.unprotectedMint(E, dec(2, 24))
      await floToken.unprotectedMint(F, dec(3, 24))

      // FLO holders transfer to other transfer to EOAs
      const FLOtransferTx_1 = await floToken.transfer(A, dec(1, 18), { from: D })
      const FLOtransferTx_2 = await floToken.transfer(B, dec(1, 18), { from: E })
      const FLOtransferTx_3 = await floToken.transfer(multisig, dec(1, 18), { from: F })

      assert.isTrue(FLOtransferTx_1.receipt.status)
      assert.isTrue(FLOtransferTx_2.receipt.status)
      assert.isTrue(FLOtransferTx_3.receipt.status)
    })

    it("Anyone (other than fluid multisig) can approve any EOA or to spend their FLO", async () => {
      // EOAs approve EOAs to spend FLO
      const FLOapproveTx_1 = await floToken.approve(A, dec(1, 18), { from: F })
      const FLOapproveTx_2 = await floToken.approve(B, dec(1, 18), { from: G })
      await assert.isTrue(FLOapproveTx_1.receipt.status)
      await assert.isTrue(FLOapproveTx_2.receipt.status)
    })

    it("Anyone (other than fluid multisig) can increaseAllowance for any EOA or Fluid contract", async () => {
      // Anyone can increaseAllowance of EOAs to spend FLO
      const FLOIncreaseAllowanceTx_1 = await floToken.increaseAllowance(A, dec(1, 18), { from: F })
      const FLOIncreaseAllowanceTx_2 = await floToken.increaseAllowance(B, dec(1, 18), { from: G })
      await assert.isTrue(FLOIncreaseAllowanceTx_1.receipt.status)
      await assert.isTrue(FLOIncreaseAllowanceTx_2.receipt.status)

      // Increase allowance of core Fluid contracts
      for (const contract of Object.keys(coreContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }

      // Increase allowance of FLO contracts
      for (const contract of Object.keys(FLOContracts)) {
        const FLOIncreaseAllowanceTx = await floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOIncreaseAllowanceTx.receipt.status)
      }
    })

    it("Anyone (other than fluid multisig) can decreaseAllowance for any EOA or Fluid contract", async () => {
      //First, increase allowance of A, B and coreContracts and FLO contracts
      const FLOIncreaseAllowanceTx_1 = await floToken.increaseAllowance(A, dec(1, 18), { from: F })
      const FLOIncreaseAllowanceTx_2 = await floToken.increaseAllowance(B, dec(1, 18), { from: G })
      await assert.isTrue(FLOIncreaseAllowanceTx_1.receipt.status)
      await assert.isTrue(FLOIncreaseAllowanceTx_2.receipt.status)

      for (const contract of Object.keys(coreContracts)) {
        const FLOtransferTx = await floToken.increaseAllowance(coreContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOtransferTx.receipt.status)
      }

      for (const contract of Object.keys(FLOContracts)) {
        const FLOtransferTx = await floToken.increaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLOtransferTx.receipt.status)
      }

      // Decrease allowance of A, B
      const FLODecreaseAllowanceTx_1 = await floToken.decreaseAllowance(A, dec(1, 18), { from: F })
      const FLODecreaseAllowanceTx_2 = await floToken.decreaseAllowance(B, dec(1, 18), { from: G })
      await assert.isTrue(FLODecreaseAllowanceTx_1.receipt.status)
      await assert.isTrue(FLODecreaseAllowanceTx_2.receipt.status)

      // Decrease allowance of core contracts
      for (const contract of Object.keys(coreContracts)) {
        const FLODecreaseAllowanceTx = await floToken.decreaseAllowance(coreContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLODecreaseAllowanceTx.receipt.status)
      }

      // Decrease allowance of FLO contracts
      for (const contract of Object.keys(FLOContracts)) {
        const FLODecreaseAllowanceTx = await floToken.decreaseAllowance(FLOContracts[contract].address, dec(1, 18), { from: F })
        await assert.isTrue(FLODecreaseAllowanceTx.receipt.status)
      }
    })

    it("Anyone (other than fluid multisig) can be the sender in a transferFrom() call", async () => {
      // Fund A, B
      await floToken.unprotectedMint(A, dec(1, 18))
      await floToken.unprotectedMint(B, dec(1, 18))

      // A, B approve F, G
      await floToken.approve(F, dec(1, 18), { from: A })
      await floToken.approve(G, dec(1, 18), { from: B })

      const FLOtransferFromTx_1 = await floToken.transferFrom(A, F, dec(1, 18), { from: F })
      const FLOtransferFromTx_2 = await floToken.transferFrom(B, C, dec(1, 18), { from: G })
      await assert.isTrue(FLOtransferFromTx_1.receipt.status)
      await assert.isTrue(FLOtransferFromTx_2.receipt.status)
    })

    it("Anyone (other than fluid AG) can stake their FLO in the staking contract", async () => {
      // Fund F
      await floToken.unprotectedMint(F, dec(1, 18))

      const FLOStakingTx_1 = await floStaking.stake(dec(1, 18), { from: F })
      await assert.isTrue(FLOStakingTx_1.receipt.status)
    })

  })
  // --- LCF ---

  describe('Lockup Contract Factory negative tests', async accounts => {
    it("deployLockupContract(): reverts when FLO token address is not set", async () => {
      // Fund F
      await floToken.unprotectedMint(F, dec(20, 24))

      // deploy new LCF
      const LCFNew = await LockupContractFactory.new()

      // Check FLOToken address not registered
      const registeredFLOTokenAddr = await LCFNew.floTokenAddress()
      assert.equal(registeredFLOTokenAddr, ZERO_ADDRESS)

      const tx = LCFNew.deployLockupContract(A, oneYearFromSystemDeployment, { from: F })
      await assertRevert(tx)
    })
  })

  // --- LCs ---
  describe('Transferring FLO to LCs', async accounts => {
    it("Fluid multisig can transfer FLO (vesting) to lockup contracts they deployed", async () => {
      const initialFLOBalanceOfLC_T1 = await floToken.balanceOf(LC_T1.address)
      const initialFLOBalanceOfLC_T2 = await floToken.balanceOf(LC_T2.address)
      const initialFLOBalanceOfLC_T3 = await floToken.balanceOf(LC_T3.address)

      // Check initial LC balances == entitlements
      assert.equal(initialFLOBalanceOfLC_T1, teamMemberInitialEntitlement_1)
      assert.equal(initialFLOBalanceOfLC_T2, teamMemberInitialEntitlement_2)
      assert.equal(initialFLOBalanceOfLC_T3, teamMemberInitialEntitlement_3)

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      // Fluid multisig transfers vesting amount
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

      // Fluid multisig transfers vesting amount
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

    it("Fluid multisig can transfer FLO to lockup contracts deployed by anyone", async () => {
      // A, B, C each deploy a lockup contract with themself as beneficiary
      const deployedLCtx_A = await lockupContractFactory.deployLockupContract(A, twoYearsFromSystemDeployment, { from: A })
      const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, twoYearsFromSystemDeployment, { from: B })
      const deployedLCtx_C = await lockupContractFactory.deployLockupContract(C, twoYearsFromSystemDeployment, { from: C })

      // LCs for team members on vesting schedules
      const LC_A = await th.getLCFromDeploymentTx(deployedLCtx_A)
      const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)
      const LC_C = await th.getLCFromDeploymentTx(deployedLCtx_C)

      // Check balances of LCs are 0
      assert.equal(await floToken.balanceOf(LC_A.address), '0')
      assert.equal(await floToken.balanceOf(LC_B.address), '0')
      assert.equal(await floToken.balanceOf(LC_C.address), '0')

      // One month passes
      await th.fastForwardTime(SECONDS_IN_ONE_MONTH, web3.currentProvider)

      // Fluid multisig transfers FLO to LCs deployed by other accounts
      await floToken.transfer(LC_A.address, dec(1, 24), { from: multisig })
      await floToken.transfer(LC_B.address, dec(2, 24), { from: multisig })
      await floToken.transfer(LC_C.address, dec(3, 24), { from: multisig })

      // Check balances of LCs have increased
      assert.equal(await floToken.balanceOf(LC_A.address), dec(1, 24))
      assert.equal(await floToken.balanceOf(LC_B.address), dec(2, 24))
      assert.equal(await floToken.balanceOf(LC_C.address), dec(3, 24))
    })
  })

  describe('Deploying new LCs', async accounts => {
    it("FLO Deployer can deploy LCs through the Factory", async () => {
      // FLO deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: fluidAG })
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(B, twoYearsFromSystemDeployment, { from: fluidAG })
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(C, '9595995999999900000023423234', { from: fluidAG })

      assert.isTrue(LCDeploymentTx_A.receipt.status)
      assert.isTrue(LCDeploymentTx_B.receipt.status)
      assert.isTrue(LCDeploymentTx_C.receipt.status)
    })

    it("Fluid multisig can deploy LCs through the Factory", async () => {
      // FLO deployer deploys LCs
      const LCDeploymentTx_A = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: multisig })
      const LCDeploymentTx_B = await lockupContractFactory.deployLockupContract(B, twoYearsFromSystemDeployment, { from: multisig })
      const LCDeploymentTx_C = await lockupContractFactory.deployLockupContract(C, '9595995999999900000023423234', { from: multisig })

      assert.isTrue(LCDeploymentTx_A.receipt.status)
      assert.isTrue(LCDeploymentTx_B.receipt.status)
      assert.isTrue(LCDeploymentTx_C.receipt.status)
    })

    it("Anyone can deploy LCs through the Factory", async () => {
      // Various EOAs deploy LCs
      const LCDeploymentTx_1 = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: teamMember_1 })
      const LCDeploymentTx_2 = await lockupContractFactory.deployLockupContract(C, twoYearsFromSystemDeployment, { from: investor_2 })
      const LCDeploymentTx_3 = await lockupContractFactory.deployLockupContract(fluidAG, '9595995999999900000023423234', { from: A })
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(D, twoYearsFromSystemDeployment, { from: B })

      assert.isTrue(LCDeploymentTx_1.receipt.status)
      assert.isTrue(LCDeploymentTx_2.receipt.status)
      assert.isTrue(LCDeploymentTx_3.receipt.status)
      assert.isTrue(LCDeploymentTx_4.receipt.status)
    })

    it("FLO Deployer can deploy LCs directly", async () => {
      // FLO deployer deploys LCs
      const LC_A = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: fluidAG })
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(LC_A.transactionHash)

      const LC_B = await LockupContract.new(floToken.address, B, twoYearsFromSystemDeployment, { from: fluidAG })
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(LC_B.transactionHash)

      const LC_C = await LockupContract.new(floToken.address, C, twoYearsFromSystemDeployment, { from: fluidAG })
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(LC_C.transactionHash)

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status)
      assert.isTrue(LC_B_txReceipt.status)
      assert.isTrue(LC_C_txReceipt.status)
    })

    it("Fluid multisig can deploy LCs directly", async () => {
      // FLO deployer deploys LCs
      const LC_A = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: multisig })
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(LC_A.transactionHash)

      const LC_B = await LockupContract.new(floToken.address, B, twoYearsFromSystemDeployment, { from: multisig })
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(LC_B.transactionHash)

      const LC_C = await LockupContract.new(floToken.address, C, twoYearsFromSystemDeployment, { from: multisig })
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(LC_C.transactionHash)

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status)
      assert.isTrue(LC_B_txReceipt.status)
      assert.isTrue(LC_C_txReceipt.status)
    })

    it("Anyone can deploy LCs directly", async () => {
      // Various EOAs deploy LCs
      const LC_A = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: D })
      const LC_A_txReceipt = await web3.eth.getTransactionReceipt(LC_A.transactionHash)

      const LC_B = await LockupContract.new(floToken.address, B, twoYearsFromSystemDeployment, { from: E })
      const LC_B_txReceipt = await web3.eth.getTransactionReceipt(LC_B.transactionHash)

      const LC_C = await LockupContract.new(floToken.address, C, twoYearsFromSystemDeployment, { from: F })
      const LC_C_txReceipt = await web3.eth.getTransactionReceipt(LC_C.transactionHash)

      // Check deployment succeeded
      assert.isTrue(LC_A_txReceipt.status)
      assert.isTrue(LC_B_txReceipt.status)
      assert.isTrue(LC_C_txReceipt.status)
    })

    it("Anyone can deploy LCs with unlockTime = one year from deployment, directly and through factory", async () => {
      // Deploy directly
      const LC_1 = await LockupContract.new(floToken.address, A, oneYearFromSystemDeployment, { from: D })
      const LCTxReceipt_1 = await web3.eth.getTransactionReceipt(LC_1.transactionHash)

      const LC_2 = await LockupContract.new(floToken.address, B, oneYearFromSystemDeployment, { from: fluidAG })
      const LCTxReceipt_2 = await web3.eth.getTransactionReceipt(LC_2.transactionHash)

      const LC_3 = await LockupContract.new(floToken.address, C, oneYearFromSystemDeployment, { from: multisig })
      const LCTxReceipt_3 = await web3.eth.getTransactionReceipt(LC_2.transactionHash)

      // Deploy through factory
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: E })
      const LCDeploymentTx_5 = await lockupContractFactory.deployLockupContract(C, twoYearsFromSystemDeployment, { from: fluidAG })
      const LCDeploymentTx_6 = await lockupContractFactory.deployLockupContract(D, twoYearsFromSystemDeployment, { from: multisig })

      // Check deployments succeeded
      assert.isTrue(LCTxReceipt_1.status)
      assert.isTrue(LCTxReceipt_2.status)
      assert.isTrue(LCTxReceipt_3.status)
      assert.isTrue(LCDeploymentTx_4.receipt.status)
      assert.isTrue(LCDeploymentTx_5.receipt.status)
      assert.isTrue(LCDeploymentTx_6.receipt.status)
    })

    it("Anyone can deploy LCs with unlockTime > one year from deployment, directly and through factory", async () => {
      const justOverOneYear = oneYearFromSystemDeployment.add(toBN('1'))
      const _17YearsFromDeployment = oneYearFromSystemDeployment.add(toBN(timeValues.SECONDS_IN_ONE_YEAR).mul(toBN('2')))
      
      // Deploy directly
      const LC_1 = await LockupContract.new(floToken.address, A, twoYearsFromSystemDeployment, { from: D })
      const LCTxReceipt_1 = await web3.eth.getTransactionReceipt(LC_1.transactionHash)

      const LC_2 = await LockupContract.new(floToken.address, B, justOverOneYear, { from: multisig })
      const LCTxReceipt_2 = await web3.eth.getTransactionReceipt(LC_2.transactionHash)

      const LC_3 = await LockupContract.new(floToken.address, E, _17YearsFromDeployment, { from: E })
      const LCTxReceipt_3 = await web3.eth.getTransactionReceipt(LC_3.transactionHash)

      // Deploy through factory
      const LCDeploymentTx_4 = await lockupContractFactory.deployLockupContract(A, oneYearFromSystemDeployment, { from: E })
      const LCDeploymentTx_5 = await lockupContractFactory.deployLockupContract(C, twoYearsFromSystemDeployment, { from: multisig })
      const LCDeploymentTx_6 = await lockupContractFactory.deployLockupContract(D, twoYearsFromSystemDeployment, { from: teamMember_2 })

      // Check deployments succeeded
      assert.isTrue(LCTxReceipt_1.status)
      assert.isTrue(LCTxReceipt_2.status)
      assert.isTrue(LCTxReceipt_3.status)
      assert.isTrue(LCDeploymentTx_4.receipt.status)
      assert.isTrue(LCDeploymentTx_5.receipt.status)
      assert.isTrue(LCDeploymentTx_6.receipt.status)
    })

    it("No one can deploy LCs with unlockTime < one year from deployment, directly or through factory", async () => {
      const justUnderOneYear = oneYearFromSystemDeployment.sub(toBN('1'))
     
      // Attempt to deploy directly
      const directDeploymentTxPromise_1 = LockupContract.new(floToken.address, A, justUnderOneYear, { from: D })
      const directDeploymentTxPromise_2 = LockupContract.new(floToken.address, B, '43200', { from: multisig })
      const directDeploymentTxPromise_3 =  LockupContract.new(floToken.address, E, '354534', { from: E })
  
      // Attempt to deploy through factory
      const factoryDploymentTxPromise_1 = lockupContractFactory.deployLockupContract(A, justUnderOneYear, { from: E })
      const factoryDploymentTxPromise_2 = lockupContractFactory.deployLockupContract(C, '43200', { from: multisig })
      const factoryDploymentTxPromise_3 = lockupContractFactory.deployLockupContract(D, '354534', { from: teamMember_2 })

      // Check deployments reverted
      await assertRevert(directDeploymentTxPromise_1, "LockupContract: unlock time must be at least one year after system deployment")
      await assertRevert(directDeploymentTxPromise_2, "LockupContract: unlock time must be at least one year after system deployment")
      await assertRevert(directDeploymentTxPromise_3, "LockupContract: unlock time must be at least one year after system deployment")
      await assertRevert(factoryDploymentTxPromise_1, "LockupContract: unlock time must be at least one year after system deployment")
      await assertRevert(factoryDploymentTxPromise_2, "LockupContract: unlock time must be at least one year after system deployment")
      await assertRevert(factoryDploymentTxPromise_3, "LockupContract: unlock time must be at least one year after system deployment")
    })


    describe('Withdrawal Attempts on LCs before unlockTime has passed ', async accounts => {
      it("Fluid multisig can't withdraw from a funded LC they deployed for another beneficiary through the Factory before the unlockTime", async () => {

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
        const unlockTime = await LC_T1.unlockTime()
        assert.isTrue(currentTime.lt(unlockTime))

        // Fluid multisig attempts withdrawal from LC they deployed through the Factory
        try {
          const withdrawalAttempt = await LC_T1.withdrawFLO({ from: multisig })
          assert.isFalse(withdrawalAttempt.receipt.status)
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary")
        }
      })

      it("Fluid multisig can't withdraw from a funded LC that someone else deployed before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: D })
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

        //FLO multisig fund the newly deployed LCs
        await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
        const unlockTime = await LC_B.unlockTime()
        assert.isTrue(currentTime.lt(unlockTime))

        // Fluid multisig attempts withdrawal from LCs
        try {
          const withdrawalAttempt_B = await LC_B.withdrawFLO({ from: multisig })
          assert.isFalse(withdrawalAttempt_B.receipt.status)
        } catch (error) {
          assert.include(error.message, "LockupContract: caller is not the beneficiary")
        }
      })

      it("Beneficiary can't withdraw from their funded LC before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: D })
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

        // Fluid multisig funds contracts
        await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
        const unlockTime = await LC_B.unlockTime()
        assert.isTrue(currentTime.lt(unlockTime))

        /* Beneficiaries of all LCS - team, investor, and newly created LCs - 
        attempt to withdraw from their respective funded contracts */
        const LCs = [
          LC_T1,
          LC_T2,
          LC_T3,
          LC_I1,
          LC_I2,
          LC_T3,
          LC_B
        ]

        for (LC of LCs) {
          try {
            const beneficiary = await LC.beneficiary()
            const withdrawalAttempt = await LC.withdrawFLO({ from: beneficiary })
            assert.isFalse(withdrawalAttempt.receipt.status)
          } catch (error) {
            assert.include(error.message, "LockupContract: The lockup duration must have passed")
          }
        }
      })

      it("No one can withdraw from a beneficiary's funded LC before the unlockTime", async () => {
        // Account D deploys a new LC via the Factory
        const deployedLCtx_B = await lockupContractFactory.deployLockupContract(B, oneYearFromSystemDeployment, { from: D })
        const LC_B = await th.getLCFromDeploymentTx(deployedLCtx_B)

        // Fluid multisig funds contract
        await floToken.transfer(LC_B.address, dec(2, 18), { from: multisig })

        // Check currentTime < unlockTime
        const currentTime = toBN(await th.getLatestBlockTimestamp(web3))
        const unlockTime = await LC_B.unlockTime()
        assert.isTrue(currentTime.lt(unlockTime))

        const variousEOAs = [teamMember_2, fluidAG, multisig, investor_1, A, C, D, E]

        // Several EOAs attempt to withdraw from LC deployed by D
        for (account of variousEOAs) {
          try {
            const withdrawalAttempt = await LC_B.withdrawFLO({ from: account })
            assert.isFalse(withdrawalAttempt.receipt.status)
          } catch (error) {
            assert.include(error.message, "LockupContract: caller is not the beneficiary")
          }
        }

        // Several EOAs attempt to withdraw from LC_T1 deployed by FLO deployer
        for (account of variousEOAs) {
          try {
            const withdrawalAttempt = await LC_T1.withdrawFLO({ from: account })
            assert.isFalse(withdrawalAttempt.receipt.status)
          } catch (error) {
            assert.include(error.message, "LockupContract: caller is not the beneficiary")
          }
        }
      })
    })
  })
})