const deploymentHelper = require("../../utils/deploymentHelpers.js")
const testHelpers = require("../../utils/testHelpers.js")
const CommunityIssuance = artifacts.require("./CommunityIssuance.sol")


const th = testHelpers.TestHelper
const timeValues = testHelpers.TimeValues
const assertRevert = th.assertRevert
const toBN = th.toBN
const dec = th.dec

contract('Deploying the FLO contracts: LCF, CI, FLOStaking, and FLOToken ', async accounts => {
  const [fluidAG, A, B] = accounts;
  const [bountyAddress, lpRewardsAddress, multisig] = accounts.slice(997, 1000)

  let FLOContracts

  const oneMillion = toBN(1000000)
  const digits = toBN(1e18)
  const thirtyTwo = toBN(32)
  const expectedCISupplyCap = thirtyTwo.mul(oneMillion).mul(digits)

  beforeEach(async () => {
    // Deploy all contracts from the first account
    FLOContracts = await deploymentHelper.deployFLOContracts(bountyAddress, lpRewardsAddress, multisig)
    await deploymentHelper.connectFLOContracts(FLOContracts)

    floStaking = FLOContracts.floStaking
    floToken = FLOContracts.floToken
    communityIssuance = FLOContracts.communityIssuance
    lockupContractFactory = FLOContracts.lockupContractFactory

    //FLO Staking and CommunityIssuance have not yet had their setters called, so are not yet
    // connected to the rest of the system
  })


  describe('CommunityIssuance deployment', async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await communityIssuance.owner()

      assert.equal(fluidAG, storedDeployerAddress)
    })
  })

  describe('FLOStaking deployment', async accounts => {
    it("Stores the deployer's address", async () => {
      const storedDeployerAddress = await floStaking.owner()

      assert.equal(fluidAG, storedDeployerAddress)
    })
  })

  describe('FLOToken deployment', async accounts => {
    it("Stores the multisig's address", async () => {
      const storedMultisigAddress = await floToken.multisigAddress()

      assert.equal(multisig, storedMultisigAddress)
    })

    it("Stores the CommunityIssuance address", async () => {
      const storedCIAddress = await floToken.communityIssuanceAddress()

      assert.equal(communityIssuance.address, storedCIAddress)
    })

    it("Stores the LockupContractFactory address", async () => {
      const storedLCFAddress = await floToken.lockupContractFactory()

      assert.equal(lockupContractFactory.address, storedLCFAddress)
    })

    it("Mints the correct FLO amount to the multisig's address: (64.66 million)", async () => {
      const multisigFLOEntitlement = await floToken.balanceOf(multisig)

     const twentyThreeSixes = "6".repeat(23)
      const expectedMultisigEntitlement = "64".concat(twentyThreeSixes).concat("7")
      assert.equal(multisigFLOEntitlement, expectedMultisigEntitlement)
    })

    it("Mints the correct FLO amount to the CommunityIssuance contract address: 32 million", async () => {
      const communityFLOEntitlement = await floToken.balanceOf(communityIssuance.address)
      // 32 million as 18-digit decimal
      const _32Million = dec(32, 24)

      assert.equal(communityFLOEntitlement, _32Million)
    })

    it("Mints the correct FLO amount to the bountyAddress EOA: 2 million", async () => {
      const bountyAddressBal = await floToken.balanceOf(bountyAddress)
      // 2 million as 18-digit decimal
      const _2Million = dec(2, 24)

      assert.equal(bountyAddressBal, _2Million)
    })

    it("Mints the correct FLO amount to the lpRewardsAddress EOA: 1.33 million", async () => {
      const lpRewardsAddressBal = await floToken.balanceOf(lpRewardsAddress)
      // 1.3 million as 18-digit decimal
      const _1pt33Million = "1".concat("3".repeat(24))

      assert.equal(lpRewardsAddressBal, _1pt33Million)
    })
  })

  describe('Community Issuance deployment', async accounts => {
    it("Stores the deployer's address", async () => {

      const storedDeployerAddress = await communityIssuance.owner()

      assert.equal(storedDeployerAddress, fluidAG)
    })

    it("Has a supply cap of 32 million", async () => {
      const supplyCap = await communityIssuance.FLOSupplyCap()

      assert.isTrue(expectedCISupplyCap.eq(supplyCap))
    })

    it("Fluid AG can set addresses if CI's FLO balance is equal or greater than 32 million ", async () => {
      const FLOBalance = await floToken.balanceOf(communityIssuance.address)
      assert.isTrue(FLOBalance.eq(expectedCISupplyCap))

      // Deploy core contracts, just to get the Stability Pool address
      const coreContracts = await deploymentHelper.deployFluidCore()

      const tx = await communityIssuance.setAddresses(
        floToken.address,
        coreContracts.stabilityPool.address,
        { from: fluidAG }
      );
      assert.isTrue(tx.receipt.status)
    })

    it("Fluid AG can't set addresses if CI's FLO balance is < 32 million ", async () => {
      const newCI = await CommunityIssuance.new()

      const FLOBalance = await floToken.balanceOf(newCI.address)
      assert.equal(FLOBalance, '0')

      // Deploy core contracts, just to get the Stability Pool address
      const coreContracts = await deploymentHelper.deployFluidCore()

      await th.fastForwardTime(timeValues.SECONDS_IN_ONE_YEAR, web3.currentProvider)
      await floToken.transfer(newCI.address, '31999999999999999999999999', {from: multisig}) // 1e-18 less than CI expects (32 million)

      try {
        const tx = await newCI.setAddresses(
          floToken.address,
          coreContracts.stabilityPool.address,
          { from: fluidAG }
        );
      
        // Check it gives the expected error message for a failed Solidity 'assert'
      } catch (err) {
        assert.include(err.message, "invalid opcode")
      }
    })
  })

  describe('Connecting FLOToken to LCF, CI and FLOStaking', async accounts => {
    it('sets the correct FLOToken address in FLOStaking', async () => {
      // Deploy core contracts and set the FLOToken address in the CI and FLOStaking
      const coreContracts = await deploymentHelper.deployFluidCore()
      await deploymentHelper.connectFLOContractsToCore(FLOContracts, coreContracts)

      const floTokenAddress = floToken.address

      const recordedFLOTokenAddress = await floStaking.floToken()
      assert.equal(floTokenAddress, recordedFLOTokenAddress)
    })

    it('sets the correct FLOToken address in LockupContractFactory', async () => {
      const floTokenAddress = floToken.address

      const recordedFLOTokenAddress = await lockupContractFactory.floTokenAddress()
      assert.equal(floTokenAddress, recordedFLOTokenAddress)
    })

    it('sets the correct FLOToken address in CommunityIssuance', async () => {
      // Deploy core contracts and set the FLOToken address in the CI and FLOStaking
      const coreContracts = await deploymentHelper.deployFluidCore()
      await deploymentHelper.connectFLOContractsToCore(FLOContracts, coreContracts)

      const floTokenAddress = floToken.address

      const recordedFLOTokenAddress = await communityIssuance.floToken()
      assert.equal(floTokenAddress, recordedFLOTokenAddress)
    })
  })
})
