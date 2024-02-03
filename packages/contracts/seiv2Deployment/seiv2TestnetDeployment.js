const { UniswapV2Factory } = require("./ABIs/UniswapV2Factory.js")
const { UniswapV2Pair } = require("./ABIs/UniswapV2Pair.js")
const { UniswapV2Router02 } = require("./ABIs/UniswapV2Router02.js")
const { ChainlinkAggregatorV3Interface } = require("./ABIs/ChainlinkAggregatorV3Interface.js")
const { TestHelper: th, TimeValues: timeVals } = require("../utils/testHelpers.js")
const { dec } = th
const SEIV2TestnetDeploymentHelper = require("../utils/seiv2TestnetDeploymentHelpers.js")
const { EDIT_DISTANCE_THRESHOLD } = require("hardhat/internal/constants.js")
const { ethers } = require("hardhat")
const { experimentalAddHardhatNetworkMessageTraceHook } = require("hardhat/config.js")
const toBigNum = ethers.BigNumber.from

async function seiv2Deploy(configParams) {
  const date = new Date()
  console.log(date.toUTCString())
  const deployerWallet = (await ethers.getSigners())[0]
  // const account2Wallet = (await ethers.getSigners())[1]
  const stdh = new SEIV2TestnetDeploymentHelper(configParams, deployerWallet)
  const gasPrice = configParams.GAS_PRICE

  const deploymentState = stdh.loadPreviousDeployment()

  console.log(`deployer address: ${deployerWallet.address}`)
  assert.equal(deployerWallet.address, configParams.fluidAddrs.DEPLOYER)
  // assert.equal(account2Wallet.address, configParams.beneficiaries.ACCOUNT_2)
  let deployerSEIBalance = await ethers.provider.getBalance(deployerWallet.address)
  console.log(`deployerSEIBalance before: ${deployerSEIBalance}`)

  // Get UniswapV2Factory instance at its deployed address
  const uniswapV2Factory = new ethers.Contract(
    configParams.externalAddrs.UNISWAP_V2_FACTORY,
    UniswapV2Factory.abi,
    deployerWallet
  )

  console.log(`Uniswp addr: ${uniswapV2Factory.address}`)
  const uniAllPairsLength = await uniswapV2Factory.allPairsLength();// ["allPairsLength()"]()
  console.log(`Uniswap Factory number of pairs: ${uniAllPairsLength}`)

  deployerSEIBalance = await ethers.provider.getBalance(deployerWallet.address)
  console.log(`deployer's SEI balance before deployments: ${deployerSEIBalance}`)

  // Deploy core logic contracts
  const fluidCore = await stdh.deployFluidCoreSEIV2Testnet(configParams.externalAddrs.TELLOR_MASTER, deploymentState)
  await stdh.logContractObjects(fluidCore)

  // Check Uniswap Pair SAI-SEI pair before pair creation
  let SAIWSEIPairAddr = await uniswapV2Factory.getPair(fluidCore.saiToken.address, configParams.externalAddrs.WSEI_ERC20)
  let WSEISAIPairAddr = await uniswapV2Factory.getPair(configParams.externalAddrs.WSEI_ERC20, fluidCore.saiToken.address)
  assert.equal(SAIWSEIPairAddr, WSEISAIPairAddr)

  if (SAIWSEIPairAddr == th.ZERO_ADDRESS) {
    // Deploy Unipool for SAI-WSEI
    await stdh.sendAndWaitForTransaction(uniswapV2Factory.createPair(
      configParams.externalAddrs.WSEI_ERC20,
      fluidCore.saiToken.address,
      { gasPrice }
    ))

    // Check Uniswap Pair SAI-WSEI pair after pair creation (forwards and backwards should have same address)
    SAIWSEIPairAddr = await uniswapV2Factory.getPair(fluidCore.saiToken.address, configParams.externalAddrs.WSEI_ERC20)
    assert.notEqual(SAIWSEIPairAddr, th.ZERO_ADDRESS)
    WSEISAIPairAddr = await uniswapV2Factory.getPair(configParams.externalAddrs.WSEI_ERC20, fluidCore.saiToken.address)
    console.log(`SAI-WSEI pair contract address after Uniswap pair creation: ${SAIWSEIPairAddr}`)
    assert.equal(WSEISAIPairAddr, SAIWSEIPairAddr)
  }

  // Deploy Unipool
  const unipool = await stdh.deployUnipoolSEIV2Testnet(deploymentState)
  // Deploy FLO Contracts
  const FLOContracts = await stdh.deployFLOContractsSEIV2Testnet(
    configParams.fluidAddrs.GENERAL_SAFE, // bounty address
    unipool.address,  // lp rewards address
    configParams.fluidAddrs.FLO_SAFE, // multisig FLO endowment address
    deploymentState,
  )

  // Connect all core contracts up
  await stdh.connectCoreContractsSEIV2Testnet(fluidCore, FLOContracts, configParams.externalAddrs.CHAINLINK_SEIUSD_PROXY)
  await stdh.connectFLOContractsSEIV2Testnet(FLOContracts)
  await stdh.connectFLOContractsToCoreSEIV2Testnet(FLOContracts, fluidCore)

  // Deploy a read-only multi-trove getter
  const multiTroveGetter = await stdh.deployMultiTroveGetterSEIV2Testnet(fluidCore, deploymentState)

  // Connect Unipool to FLOToken and the SAI-WSEI pair address, with a 6 week duration
  const LPRewardsDuration = timeVals.SECONDS_IN_SIX_WEEKS
  await stdh.connectUnipoolSEIV2Testnet(unipool, FLOContracts, SAIWSEIPairAddr, LPRewardsDuration)

  // Log FLO and Unipool addresses
  await stdh.logContractObjects(FLOContracts)
  console.log(`Unipool address: ${unipool.address}`)
  
  // let latestBlock = await ethers.provider.getBlockNumber()
  let deploymentStartTime = await FLOContracts.floToken.getDeploymentStartTime()

  console.log(`deployment start time: ${deploymentStartTime}`)
  const oneYearFromDeployment = (Number(deploymentStartTime) + timeVals.SECONDS_IN_ONE_YEAR).toString()
  console.log(`time oneYearFromDeployment: ${oneYearFromDeployment}`)

  // Deploy LockupContracts - one for each beneficiary
  const lockupContracts = {}

  for (const [investor, investorAddr] of Object.entries(configParams.beneficiaries)) {
    const lockupContractEthersFactory = await ethers.getContractFactory("LockupContract", deployerWallet)
    if (deploymentState[investor] && deploymentState[investor].address) {
      console.log(`Using previously deployed ${investor} lockup contract at address ${deploymentState[investor].address}`)
      lockupContracts[investor] = new ethers.Contract(
        deploymentState[investor].address,
        lockupContractEthersFactory.interface,
        deployerWallet
      )
    } else {
      const txReceipt = await stdh.sendAndWaitForTransaction(FLOContracts.lockupContractFactory.deployLockupContract(investorAddr, oneYearFromDeployment, { gasPrice }))

      const address = await txReceipt.logs[0].address // The deployment event emitted from the LC itself is is the first of two events, so this is its address 
      lockupContracts[investor] = new ethers.Contract(
        address,
        lockupContractEthersFactory.interface,
        deployerWallet
      )

      deploymentState[investor] = {
        address: address,
        txHash: txReceipt.transactionHash
      }

      stdh.saveDeployment(deploymentState)
    }

    const floTokenAddr = FLOContracts.floToken.address
    // verify
    if (configParams.SEIV2SCAN_BASE_URL) {
      await stdh.verifyContract(investor, deploymentState, [floTokenAddr, investorAddr, oneYearFromDeployment])
    }
  }

  const chainlinkProxy = new ethers.Contract(
    configParams.externalAddrs.CHAINLINK_SEIUSD_PROXY,
    ChainlinkAggregatorV3Interface,
    deployerWallet
  )

  // Get latest price
  let chainlinkPrice = await chainlinkProxy.latestAnswer()
  console.log(`current Chainlink price: ${chainlinkPrice}`)

  // Check Tellor price directly (through our TellorCaller)
  let tellorPriceResponse = await fluidCore.tellorCaller.getTellorCurrentValue(1) // id == 1: the SEI-USD request ID
  console.log(`current Tellor price: ${tellorPriceResponse[1]}`)
  console.log(`current Tellor timestamp: ${tellorPriceResponse[2]}`)

  // // --- Lockup Contracts ---
  console.log("LOCKUP CONTRACT CHECKS")
  // Check lockup contracts exist for each beneficiary with correct unlock time
  for (investor of Object.keys(lockupContracts)) {
    const lockupContract = lockupContracts[investor]
    // check LC references correct FLOToken 
    const storedFLOTokenAddr = await lockupContract.floToken()
    assert.equal(FLOContracts.floToken.address, storedFLOTokenAddr)
    // Check contract has stored correct beneficary
    const onChainBeneficiary = await lockupContract.beneficiary()
    assert.equal(configParams.beneficiaries[investor].toLowerCase(), onChainBeneficiary.toLowerCase())
    // Check correct unlock time (1 yr from deployment)
    const unlockTime = await lockupContract.unlockTime()
    assert.equal(oneYearFromDeployment, unlockTime)

    console.log(
      `lockupContract addr: ${lockupContract.address},
            stored FLOToken addr: ${storedFLOTokenAddr}
            beneficiary: ${investor},
            beneficiary addr: ${configParams.beneficiaries[investor]},
            on-chain beneficiary addr: ${onChainBeneficiary},
            unlockTime: ${unlockTime}
            `
    )
  }

  const SAISEIPair = await new ethers.Contract(
    SAIWSEIPairAddr,
    UniswapV2Pair.abi,
    deployerWallet
  )

  reserves = await SAISEIPair.getReserves()
  th.logBN("SAI-SEI Pair's current SAI reserves", reserves[0])
  th.logBN("SAI-SEI Pair's current SEI reserves", reserves[1])

  // Number of troves
  const numTroves = await fluidCore.troveManager.getTroveOwnersCount()
  console.log(`number of troves: ${numTroves} `)

  // Sorted list size
  const listSize = await fluidCore.sortedTroves.getSize()
  console.log(`Trove list size: ${listSize} `)

  // Total system debt and coll
  const entireSystemDebt = await fluidCore.troveManager.getEntireSystemDebt()
  const entireSystemColl = await fluidCore.troveManager.getEntireSystemColl()
  th.logBN("Entire system debt", entireSystemDebt)
  th.logBN("Entire system coll", entireSystemColl)
  
  // TCR
  const TCR = await fluidCore.troveManager.getTCR(chainlinkPrice)
  console.log(`TCR: ${TCR}`)

  // current borrowing rate
  const baseRate = await fluidCore.troveManager.baseRate()
  const currentBorrowingRate = await fluidCore.troveManager.getBorrowingRateWithDecay()
  th.logBN("Base rate", baseRate)
  th.logBN("Current borrowing rate", currentBorrowingRate)

  // total SP deposits
  const totalSPDeposits = await fluidCore.stabilityPool.getTotalSAIDeposits()
  th.logBN("Total SAI SP deposits", totalSPDeposits)

  // total FLO Staked in FLOStaking
  const totalFLOStaked = await FLOContracts.floStaking.totalFLOStaked()
  th.logBN("Total FLO staked", totalFLOStaked)

  // total LP tokens staked in Unipool
  const totalLPTokensStaked = await unipool.totalSupply()
  th.logBN("Total LP (SAI-SEI) tokens staked in unipool", totalLPTokensStaked)

  // --- State variables ---

  // TroveManager 
  console.log("TroveManager state variables:")
  const totalStakes = await fluidCore.troveManager.totalStakes()
  const totalStakesSnapshot = await fluidCore.troveManager.totalStakesSnapshot()
  const totalCollateralSnapshot = await fluidCore.troveManager.totalCollateralSnapshot()
  th.logBN("Total trove stakes", totalStakes)
  th.logBN("Snapshot of total trove stakes before last liq. ", totalStakesSnapshot)
  th.logBN("Snapshot of total trove collateral before last liq. ", totalCollateralSnapshot)

  const L_SEI = await fluidCore.troveManager.L_SEI()
  const L_SAIDebt = await fluidCore.troveManager.L_SAIDebt()
  th.logBN("L_SEI", L_SEI)
  th.logBN("L_SAIDebt", L_SAIDebt)

  // StabilityPool
  console.log("StabilityPool state variables:")
  const P = await fluidCore.stabilityPool.P()
  const currentScale = await fluidCore.stabilityPool.currentScale()
  const currentEpoch = await fluidCore.stabilityPool.currentEpoch()
  const S = await fluidCore.stabilityPool.epochToScaleToSum(currentEpoch, currentScale)
  const G = await fluidCore.stabilityPool.epochToScaleToG(currentEpoch, currentScale)
  th.logBN("Product P", P)
  th.logBN("Current epoch", currentEpoch)
  th.logBN("Current scale", currentScale)
  th.logBN("Sum S, at current epoch and scale", S)
  th.logBN("Sum G, at current epoch and scale", G)

  // FLOStaking
  console.log("FLOStaking state variables:")
  const F_SAI = await FLOContracts.floStaking.F_SAI()
  const F_SEI = await FLOContracts.floStaking.F_SEI()
  th.logBN("F_SAI", F_SAI)
  th.logBN("F_SEI", F_SEI)


  // CommunityIssuance
  console.log("CommunityIssuance state variables:")
  const totalFLOIssued = await FLOContracts.communityIssuance.totalFLOIssued()
  th.logBN("Total FLO issued to depositors / front ends", totalFLOIssued)

}

module.exports = {
  seiv2Deploy
}
