
const deploymentHelpers = require("../utils/truffleDeploymentHelpers.js")
const testHelpers = require("../utils/testHelpers.js")

const deployFluid = deploymentHelpers.deployFluid
const getAddresses = deploymentHelpers.getAddresses
const connectContracts = deploymentHelpers.connectContracts

const th  = testHelpers.TestHelper
const dec = th.dec

contract('Pool Manager: Sum-Product rounding errors', async accounts => {

  const whale = accounts[0]

  let contracts

  let priceFeed
  let saiToken
  let stabilityPool
  let troveManager
  let borrowerOperations

  beforeEach(async () => {
    contracts = await deployFluid()
    
    priceFeed = contracts.priceFeedTestnet
    saiToken = contracts.saiToken
    stabilityPool = contracts.stabilityPool
    troveManager = contracts.troveManager
    borrowerOperations = contracts.borrowerOperations

    const contractAddresses = getAddresses(contracts)
    await connectContracts(contracts, contractAddresses)
  })

  // skipped to not slow down CI
  it.skip("Rounding errors: 100 deposits of 100SAI into SP, then 200 liquidations of 49SAI", async () => {
    const owner = accounts[0]
    const depositors = accounts.slice(1, 101)
    const defaulters = accounts.slice(101, 301)

    for (let account of depositors) {
      await openTrove({ extraSAIAmount: toBN(dec(10000, 18)), ICR: toBN(dec(2, 18)), extraParams: { from: account } })
      await stabilityPool.provideToSP(dec(100, 18), { from: account })
    }

    // Defaulter opens trove with 200% ICR
    for (let defaulter of defaulters) {
      await openTrove({ ICR: toBN(dec(2, 18)), extraParams: { from: defaulter } })
      }
    const price = await priceFeed.getPrice()

    // price drops by 50%: defaulter ICR falls to 100%
    await priceFeed.setPrice(dec(105, 18));

    // Defaulters liquidated
    for (let defaulter of defaulters) {
      await troveManager.liquidate(defaulter, { from: owner });
    }

    const SP_TotalDeposits = await stabilityPool.getTotalSAIDeposits()
    const SP_SEI = await stabilityPool.getSEI()
    const compoundedDeposit = await stabilityPool.getCompoundedSAIDeposit(depositors[0])
    const SEI_Gain = await stabilityPool.getCurrentSEIGain(depositors[0])

    // Check depostiors receive their share without too much error
    assert.isAtMost(th.getDifference(SP_TotalDeposits.div(th.toBN(depositors.length)), compoundedDeposit), 100000)
    assert.isAtMost(th.getDifference(SP_SEI.div(th.toBN(depositors.length)), SEI_Gain), 100000)
  })
})

contract('Reset chain state', async accounts => { })
