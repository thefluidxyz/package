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
  assert.equal(deployerWallet.address, configParams.liquityAddrs.DEPLOYER)
  // assert.equal(account2Wallet.address, configParams.beneficiaries.ACCOUNT_2)
  let deployerETHBalance = await ethers.provider.getBalance(deployerWallet.address)
  console.log (">>>>>>>>>>>", await ethers.provider.getBalance("0x566454eF325a5eA22a831eBb4fF236F74E1372CD"))
  console.log(`deployerETHBalance before: ${deployerETHBalance}`)

  // Get UniswapV2Factory instance at its deployed address
  const uniswapV2Factory = new ethers.Contract(
    configParams.externalAddrs.UNISWAP_V2_FACTORY,
    UniswapV2Factory.abi,
    deployerWallet
  )

  console.log(`Uniswp addr: ${uniswapV2Factory.address}`)
  const uniAllPairsLength = await uniswapV2Factory.allPairsLength();// ["allPairsLength()"]()
  console.log(`Uniswap Factory number of pairs: ${uniAllPairsLength}`)

  deployerETHBalance = await ethers.provider.getBalance(deployerWallet.address)
  console.log(`deployer's ETH balance before deployments: ${deployerETHBalance}`)

  // Deploy core logic contracts
  const liquityCore = await stdh.deployLiquityCoreSEIV2Testnet(configParams.externalAddrs.TELLOR_MASTER, deploymentState)
  await stdh.logContractObjects(liquityCore)

  // Check Uniswap Pair LUSD-ETH pair before pair creation
  let LUSDWSEIPairAddr = await uniswapV2Factory.getPair(liquityCore.lusdToken.address, configParams.externalAddrs.WSEI_ERC20)
  let WETHLUSDPairAddr = await uniswapV2Factory.getPair(configParams.externalAddrs.WSEI_ERC20, liquityCore.lusdToken.address)
  assert.equal(LUSDWSEIPairAddr, WETHLUSDPairAddr)

  if (LUSDWSEIPairAddr == th.ZERO_ADDRESS) {
    // Deploy Unipool for LUSD-WETH
    await stdh.sendAndWaitForTransaction(uniswapV2Factory.createPair(
      configParams.externalAddrs.WSEI_ERC20,
      liquityCore.lusdToken.address,
      { gasPrice }
    ))

    // Check Uniswap Pair LUSD-WETH pair after pair creation (forwards and backwards should have same address)
    LUSDWSEIPairAddr = await uniswapV2Factory.getPair(liquityCore.lusdToken.address, configParams.externalAddrs.WSEI_ERC20)
    assert.notEqual(LUSDWSEIPairAddr, th.ZERO_ADDRESS)
    WETHLUSDPairAddr = await uniswapV2Factory.getPair(configParams.externalAddrs.WSEI_ERC20, liquityCore.lusdToken.address)
    console.log(`LUSD-WETH pair contract address after Uniswap pair creation: ${LUSDWSEIPairAddr}`)
    assert.equal(WETHLUSDPairAddr, LUSDWSEIPairAddr)
  }

  // Deploy Unipool
  const unipool = await stdh.deployUnipoolSEIV2Testnet(deploymentState)
  // Deploy LQTY Contracts
  const LQTYContracts = await stdh.deployLQTYContractsSEIV2Testnet(
    configParams.liquityAddrs.GENERAL_SAFE, // bounty address
    unipool.address,  // lp rewards address
    configParams.liquityAddrs.LQTY_SAFE, // multisig LQTY endowment address
    deploymentState,
  )

  // Connect all core contracts up
  await stdh.connectCoreContractsSEIV2Testnet(liquityCore, LQTYContracts, configParams.externalAddrs.CHAINLINK_SEIUSD_PROXY)
  await stdh.connectLQTYContractsSEIV2Testnet(LQTYContracts)
  await stdh.connectLQTYContractsToCoreSEIV2Testnet(LQTYContracts, liquityCore)

  // Deploy a read-only multi-trove getter
  const multiTroveGetter = await stdh.deployMultiTroveGetterSEIV2Testnet(liquityCore, deploymentState)

  // Connect Unipool to LQTYToken and the LUSD-WETH pair address, with a 6 week duration
  const LPRewardsDuration = timeVals.SECONDS_IN_SIX_WEEKS
  await stdh.connectUnipoolSEIV2Testnet(unipool, LQTYContracts, LUSDWSEIPairAddr, LPRewardsDuration)

  // Log LQTY and Unipool addresses
  await stdh.logContractObjects(LQTYContracts)
  console.log(`Unipool address: ${unipool.address}`)
  
  // let latestBlock = await ethers.provider.getBlockNumber()
  let deploymentStartTime = await LQTYContracts.lqtyToken.getDeploymentStartTime()

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
      const txReceipt = await stdh.sendAndWaitForTransaction(LQTYContracts.lockupContractFactory.deployLockupContract(investorAddr, oneYearFromDeployment, { gasPrice }))

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

    const lqtyTokenAddr = LQTYContracts.lqtyToken.address
    // verify
    if (configParams.SEIV2SCAN_BASE_URL) {
      await stdh.verifyContract(investor, deploymentState, [lqtyTokenAddr, investorAddr, oneYearFromDeployment])
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
  let tellorPriceResponse = await liquityCore.tellorCaller.getTellorCurrentValue(1) // id == 1: the ETH-USD request ID
  console.log(`current Tellor price: ${tellorPriceResponse[1]}`)
  console.log(`current Tellor timestamp: ${tellorPriceResponse[2]}`)

  // // --- Lockup Contracts ---
  console.log("LOCKUP CONTRACT CHECKS")
  // Check lockup contracts exist for each beneficiary with correct unlock time
  for (investor of Object.keys(lockupContracts)) {
    const lockupContract = lockupContracts[investor]
    // check LC references correct LQTYToken 
    const storedLQTYTokenAddr = await lockupContract.lqtyToken()
    assert.equal(LQTYContracts.lqtyToken.address, storedLQTYTokenAddr)
    // Check contract has stored correct beneficary
    const onChainBeneficiary = await lockupContract.beneficiary()
    assert.equal(configParams.beneficiaries[investor].toLowerCase(), onChainBeneficiary.toLowerCase())
    // Check correct unlock time (1 yr from deployment)
    const unlockTime = await lockupContract.unlockTime()
    assert.equal(oneYearFromDeployment, unlockTime)

    console.log(
      `lockupContract addr: ${lockupContract.address},
            stored LQTYToken addr: ${storedLQTYTokenAddr}
            beneficiary: ${investor},
            beneficiary addr: ${configParams.beneficiaries[investor]},
            on-chain beneficiary addr: ${onChainBeneficiary},
            unlockTime: ${unlockTime}
            `
    )
  }

  const LUSDETHPair = await new ethers.Contract(
    LUSDWSEIPairAddr,
    UniswapV2Pair.abi,
    deployerWallet
  )

  reserves = await LUSDETHPair.getReserves()
  th.logBN("LUSD-ETH Pair's current LUSD reserves", reserves[0])
  th.logBN("LUSD-ETH Pair's current ETH reserves", reserves[1])

  // Number of troves
  const numTroves = await liquityCore.troveManager.getTroveOwnersCount()
  console.log(`number of troves: ${numTroves} `)

  // Sorted list size
  const listSize = await liquityCore.sortedTroves.getSize()
  console.log(`Trove list size: ${listSize} `)

  // Total system debt and coll
  const entireSystemDebt = await liquityCore.troveManager.getEntireSystemDebt()
  const entireSystemColl = await liquityCore.troveManager.getEntireSystemColl()
  th.logBN("Entire system debt", entireSystemDebt)
  th.logBN("Entire system coll", entireSystemColl)
  
  // TCR
  const TCR = await liquityCore.troveManager.getTCR(chainlinkPrice)
  console.log(`TCR: ${TCR}`)

  // current borrowing rate
  const baseRate = await liquityCore.troveManager.baseRate()
  const currentBorrowingRate = await liquityCore.troveManager.getBorrowingRateWithDecay()
  th.logBN("Base rate", baseRate)
  th.logBN("Current borrowing rate", currentBorrowingRate)

  // total SP deposits
  const totalSPDeposits = await liquityCore.stabilityPool.getTotalLUSDDeposits()
  th.logBN("Total LUSD SP deposits", totalSPDeposits)

  // total LQTY Staked in LQTYStaking
  const totalLQTYStaked = await LQTYContracts.lqtyStaking.totalLQTYStaked()
  th.logBN("Total LQTY staked", totalLQTYStaked)

  // total LP tokens staked in Unipool
  const totalLPTokensStaked = await unipool.totalSupply()
  th.logBN("Total LP (LUSD-ETH) tokens staked in unipool", totalLPTokensStaked)

  // --- State variables ---

  // TroveManager 
  console.log("TroveManager state variables:")
  const totalStakes = await liquityCore.troveManager.totalStakes()
  const totalStakesSnapshot = await liquityCore.troveManager.totalStakesSnapshot()
  const totalCollateralSnapshot = await liquityCore.troveManager.totalCollateralSnapshot()
  th.logBN("Total trove stakes", totalStakes)
  th.logBN("Snapshot of total trove stakes before last liq. ", totalStakesSnapshot)
  th.logBN("Snapshot of total trove collateral before last liq. ", totalCollateralSnapshot)

  const L_ETH = await liquityCore.troveManager.L_ETH()
  const L_LUSDDebt = await liquityCore.troveManager.L_LUSDDebt()
  th.logBN("L_ETH", L_ETH)
  th.logBN("L_LUSDDebt", L_LUSDDebt)

  // StabilityPool
  console.log("StabilityPool state variables:")
  const P = await liquityCore.stabilityPool.P()
  const currentScale = await liquityCore.stabilityPool.currentScale()
  const currentEpoch = await liquityCore.stabilityPool.currentEpoch()
  const S = await liquityCore.stabilityPool.epochToScaleToSum(currentEpoch, currentScale)
  const G = await liquityCore.stabilityPool.epochToScaleToG(currentEpoch, currentScale)
  th.logBN("Product P", P)
  th.logBN("Current epoch", currentEpoch)
  th.logBN("Current scale", currentScale)
  th.logBN("Sum S, at current epoch and scale", S)
  th.logBN("Sum G, at current epoch and scale", G)

  // LQTYStaking
  console.log("LQTYStaking state variables:")
  const F_LUSD = await LQTYContracts.lqtyStaking.F_LUSD()
  const F_ETH = await LQTYContracts.lqtyStaking.F_ETH()
  th.logBN("F_LUSD", F_LUSD)
  th.logBN("F_ETH", F_ETH)


  // CommunityIssuance
  console.log("CommunityIssuance state variables:")
  const totalLQTYIssued = await LQTYContracts.communityIssuance.totalLQTYIssued()
  th.logBN("Total LQTY issued to depositors / front ends", totalLQTYIssued)

}

module.exports = {
  seiv2Deploy
}
