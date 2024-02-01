const fs = require('fs')
const { ethers } = require('hardhat')

const ZERO_ADDRESS = '0x' + '0'.repeat(40)
const maxBytes32 = '0x' + 'f'.repeat(64)
const multiCallABI = require("../seiv2Deployment/ABIs/multiCall")
const priceFeedABI = require("../seiv2Deployment/ABIs/priceFeed")

class SEIV2TestnetDeploymentHelper {
  constructor(configParams, deployerWallet) {
    this.configParams = configParams
    this.deployerWallet = deployerWallet
    this.hre = require("hardhat")
  }

  loadPreviousDeployment() {
    let previousDeployment = {}
    if (fs.existsSync(this.configParams.OUTPUT_FILE)) {
      console.log(`Loading previous deployment...`)
      previousDeployment = require('../' + this.configParams.OUTPUT_FILE)
    }

    return previousDeployment
  }

  saveDeployment(deploymentState) {
    const deploymentStateJSON = JSON.stringify(deploymentState, null, 2)
    fs.writeFileSync(this.configParams.OUTPUT_FILE, deploymentStateJSON)

  }
  // --- Deployer methods ---

  async getFactory(name) {
    let options = undefined
    const factory = await ethers.getContractFactory(name, options)
    return factory
  }

  async sendAndWaitForTransaction(txPromise) {
    const tx = await txPromise
    // const minedTx = await ethers.provider.waitForTransaction(tx.hash, this.configParams.TX_CONFIRMATIONS)
    const ret = await tx.wait()

    return ret
  }

  async loadOrDeploy(factory, name, deploymentState, params=[]) {
    if (deploymentState[name] && deploymentState[name].address) {
      console.log(`Using previously deployed ${name} contract at address ${deploymentState[name].address}`)
      return new ethers.Contract(
        deploymentState[name].address,
        factory.interface,
        this.deployerWallet
      );
    }

    const contract = await factory.deploy(...params)
    const deployed = await contract.deployTransaction.wait()
    // await this.deployerWallet.provider.waitForTransaction(contract.deployTransaction.hash, this.configParams.TX_CONFIRMATIONS)

    deploymentState[name] = {
      address: contract.address,
      txHash: contract.deployTransaction.hash
    }
 
    this.saveDeployment(deploymentState)

    return contract
  }

  async deployFluidCoreSEIV2Testnet(tellorMasterAddr, deploymentState) {
    // Get contract factories
    const priceFeedFactory = await this.getFactory("PriceFeed")
    const sortedTrovesFactory = await this.getFactory("SortedTroves")
    const troveManagerFactory = await this.getFactory("TroveManager")
    const activePoolFactory = await this.getFactory("ActivePool")
    const stabilityPoolFactory = await this.getFactory("StabilityPool")
    const gasPoolFactory = await this.getFactory("GasPool")
    const defaultPoolFactory = await this.getFactory("DefaultPool")
    const collSurplusPoolFactory = await this.getFactory("CollSurplusPool")
    const borrowerOperationsFactory = await this.getFactory("BorrowerOperations")
    const hintHelpersFactory = await this.getFactory("HintHelpers")
    const saiTokenFactory = await this.getFactory("SAIToken")
    const tellorCallerFactory = await this.getFactory("TellorCaller")

    // Deploy txs
    const priceFeed = await this.loadOrDeploy(priceFeedFactory, 'priceFeed', deploymentState)
    const sortedTroves = await this.loadOrDeploy(sortedTrovesFactory, 'sortedTroves', deploymentState)
    const troveManager = await this.loadOrDeploy(troveManagerFactory, 'troveManager', deploymentState)
    const activePool = await this.loadOrDeploy(activePoolFactory, 'activePool', deploymentState)
    const stabilityPool = await this.loadOrDeploy(stabilityPoolFactory, 'stabilityPool', deploymentState)
    const gasPool = await this.loadOrDeploy(gasPoolFactory, 'gasPool', deploymentState)
    const defaultPool = await this.loadOrDeploy(defaultPoolFactory, 'defaultPool', deploymentState)
    const collSurplusPool = await this.loadOrDeploy(collSurplusPoolFactory, 'collSurplusPool', deploymentState)
    const borrowerOperations = await this.loadOrDeploy(borrowerOperationsFactory, 'borrowerOperations', deploymentState)
    const hintHelpers = await this.loadOrDeploy(hintHelpersFactory, 'hintHelpers', deploymentState)
    const tellorCaller = await this.loadOrDeploy(tellorCallerFactory, 'tellorCaller', deploymentState, [tellorMasterAddr])

    const saiTokenParams = [
      troveManager.address,
      stabilityPool.address,
      borrowerOperations.address
    ]
    const saiToken = await this.loadOrDeploy(
      saiTokenFactory,
      'saiToken',
      deploymentState,
      saiTokenParams
    )

    if (!this.configParams.SEIV2SCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('priceFeed', deploymentState)
      await this.verifyContract('sortedTroves', deploymentState)
      await this.verifyContract('troveManager', deploymentState)
      await this.verifyContract('activePool', deploymentState)
      await this.verifyContract('stabilityPool', deploymentState)
      await this.verifyContract('gasPool', deploymentState)
      await this.verifyContract('defaultPool', deploymentState)
      await this.verifyContract('collSurplusPool', deploymentState)
      await this.verifyContract('borrowerOperations', deploymentState)
      await this.verifyContract('hintHelpers', deploymentState)
      await this.verifyContract('tellorCaller', deploymentState, [tellorMasterAddr])
      await this.verifyContract('saiToken', deploymentState, saiTokenParams)
    }

    const coreContracts = {
      priceFeed,
      saiToken,
      sortedTroves,
      troveManager,
      activePool,
      stabilityPool,
      gasPool,
      defaultPool,
      collSurplusPool,
      borrowerOperations,
      hintHelpers,
      tellorCaller
    }
    return coreContracts
  }

  async deployPriceFeedSEIV2Testnet(deploymentState) {
    // const multicall = new ethers.Contract("0xEe8d287B844959ADe40d718Dc23077ba920e2f07", multiCallABI.multiCall.abi, this.deployerWallet)
    // const priceFeedInterface = new ethers.utils.Interface(priceFeedABI.priceFeed.abi)
    // const calls = [
    //   ["0x1Fc8970d71c365c3d1A0D10Fc6B3Ca50bc42f78b", priceFeedInterface.encodeFunctionData("latestAnswer", [])]
    // ]
    // const tx = await multicall.getEthBalance("0x552594b83058882C2263DBe23235477f63e7D60B");
    // // const tx = await multicall.callStatic.aggregate(calls);
    // // await tx.wait()
    // console.log (tx, ">>>>>>>>>>>>>>>>>")

    // const saiToken = new ethers.Contract("0x36B820c7A8ed89AA5b894C5fD1CeaA674ae79E3E", multiCallABI.multiCall.abi, this.deployerWallet)


    const seiOraclePriceFeedFactory = await this.getFactory("SEIOraclePriceFeed")
    const seiOraclePriceFeed = await this.loadOrDeploy(seiOraclePriceFeedFactory, 'seiOraclePriceFeed', deploymentState)
    const saiOraclePriceFeedFactory = await this.getFactory("SAIOraclePriceFeed")
    const saiOraclePriceFeed = await this.loadOrDeploy(saiOraclePriceFeedFactory, 'saiOraclePriceFeed', deploymentState)
    const tellorMasterFactory = await this.getFactory("TellorMaster")
    const tellorMaster = await this.loadOrDeploy(tellorMasterFactory, 'tellorMaster', deploymentState)

    if (!this.configParams.SEIV2SCAN_BASE_URL) {
        console.log('No SEIV2Testnet Url defined, skipping verification')
    } else {
        await this.verifyContract('seiOraclePriceFeed', deploymentState)
        await this.verifyContract('tellorMaster', deploymentState)
    }
    const FLOContracts = {
        seiOraclePriceFeed,
        saiOraclePriceFeed,
        tellorMaster,
    }
    return FLOContracts
  }

  async deployFLOContractsSEIV2Testnet(bountyAddress, lpRewardsAddress, multisigAddress, deploymentState) {
    const floStakingFactory = await this.getFactory("FLOStaking")
    const lockupContractFactory_Factory = await this.getFactory("LockupContractFactory")
    const communityIssuanceFactory = await this.getFactory("CommunityIssuance")
    const floTokenFactory = await this.getFactory("FLOToken")

    const floStaking = await this.loadOrDeploy(floStakingFactory, 'floStaking', deploymentState)
    const lockupContractFactory = await this.loadOrDeploy(lockupContractFactory_Factory, 'lockupContractFactory', deploymentState)
    const communityIssuance = await this.loadOrDeploy(communityIssuanceFactory, 'communityIssuance', deploymentState)

    // Deploy FLO Token, passing Community Issuance and Factory addresses to the constructor
    const floTokenParams = [
      communityIssuance.address,
      floStaking.address,
      lockupContractFactory.address,
      bountyAddress,
      lpRewardsAddress,
      multisigAddress
    ]

    const floToken = await this.loadOrDeploy(
      floTokenFactory,
      'floToken',
      deploymentState,
      floTokenParams
    )

    if (!this.configParams.SEIV2SCAN_BASE_URL) {
      console.log('No SEIV2Testnet Url defined, skipping verification')
    } else {
      await this.verifyContract('floStaking', deploymentState)
      await this.verifyContract('lockupContractFactory', deploymentState)
      await this.verifyContract('communityIssuance', deploymentState)
      await this.verifyContract('floToken', deploymentState, floTokenParams)
    }

    const FLOContracts = {
      floStaking,
      lockupContractFactory,
      communityIssuance,
      floToken
    }
    return FLOContracts
  }

  async deployUnipoolSEIV2Testnet(deploymentState) {
    const unipoolFactory = await this.getFactory("Unipool")
    const unipool = await this.loadOrDeploy(unipoolFactory, 'unipool', deploymentState)

    if (!this.configParams.SEIV2SCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('unipool', deploymentState)
    }

    return unipool
  }

  async deployMultiTroveGetterSEIV2Testnet(fluidCore, deploymentState) {
    const multiTroveGetterFactory = await this.getFactory("MultiTroveGetter")
    const multiTroveGetterParams = [
      fluidCore.troveManager.address,
      fluidCore.sortedTroves.address
    ]
    const multiTroveGetter = await this.loadOrDeploy(
      multiTroveGetterFactory,
      'multiTroveGetter',
      deploymentState,
      multiTroveGetterParams
    )

    if (!this.configParams.SEIV2SCAN_BASE_URL) {
      console.log('No Etherscan Url defined, skipping verification')
    } else {
      await this.verifyContract('multiTroveGetter', deploymentState, multiTroveGetterParams)
    }

    return multiTroveGetter
  }
  // --- Connector methods ---

  async isOwnershipRenounced(contract) {
    const owner = await contract.owner()
    return owner == ZERO_ADDRESS
  }
  // Connect contracts to their dependencies
  async connectCoreContractsSEIV2Testnet(contracts, FLOContracts, chainlinkProxyAddress) {
    const gasPrice = this.configParams.GAS_PRICE

    // Set ChainlinkAggregatorProxy and TellorCaller in the PriceFeed
    await this.isOwnershipRenounced(contracts.priceFeed) ||
      await this.sendAndWaitForTransaction(contracts.priceFeed.setAddresses(chainlinkProxyAddress, contracts.tellorCaller.address, {gasPrice}))

    // set TroveManager addr in SortedTroves
    await this.isOwnershipRenounced(contracts.sortedTroves) ||
      await this.sendAndWaitForTransaction(contracts.sortedTroves.setParams(
        maxBytes32,
        contracts.troveManager.address,
        contracts.borrowerOperations.address, 
	{gasPrice}
      ))

    // set contracts in the Trove Manager
    await this.isOwnershipRenounced(contracts.troveManager) ||
      await this.sendAndWaitForTransaction(contracts.troveManager.setAddresses(
        contracts.borrowerOperations.address,
        contracts.activePool.address,
        contracts.defaultPool.address,
        contracts.stabilityPool.address,
        contracts.gasPool.address,
        contracts.collSurplusPool.address,
        contracts.priceFeed.address,
        contracts.saiToken.address,
        contracts.sortedTroves.address,
        FLOContracts.floToken.address,
        FLOContracts.floStaking.address,
	{gasPrice}
      ))

    // set contracts in BorrowerOperations 
    await this.isOwnershipRenounced(contracts.borrowerOperations) ||
      await this.sendAndWaitForTransaction(contracts.borrowerOperations.setAddresses(
        contracts.troveManager.address,
        contracts.activePool.address,
        contracts.defaultPool.address,
        contracts.stabilityPool.address,
        contracts.gasPool.address,
        contracts.collSurplusPool.address,
        contracts.priceFeed.address,
        contracts.sortedTroves.address,
        contracts.saiToken.address,
        FLOContracts.floStaking.address,
	{gasPrice}
      ))

    // set contracts in the Pools
    await this.isOwnershipRenounced(contracts.stabilityPool) ||
      await this.sendAndWaitForTransaction(contracts.stabilityPool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.activePool.address,
        contracts.saiToken.address,
        contracts.sortedTroves.address,
        contracts.priceFeed.address,
        FLOContracts.communityIssuance.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(contracts.activePool) ||
      await this.sendAndWaitForTransaction(contracts.activePool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.stabilityPool.address,
        contracts.defaultPool.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(contracts.defaultPool) ||
      await this.sendAndWaitForTransaction(contracts.defaultPool.setAddresses(
        contracts.troveManager.address,
        contracts.activePool.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(contracts.collSurplusPool) ||
      await this.sendAndWaitForTransaction(contracts.collSurplusPool.setAddresses(
        contracts.borrowerOperations.address,
        contracts.troveManager.address,
        contracts.activePool.address,
	{gasPrice}
      ))

    // set contracts in HintHelpers
    await this.isOwnershipRenounced(contracts.hintHelpers) ||
      await this.sendAndWaitForTransaction(contracts.hintHelpers.setAddresses(
        contracts.sortedTroves.address,
        contracts.troveManager.address,
	{gasPrice}
      ))
  }

  async connectFLOContractsSEIV2Testnet(FLOContracts) {
    const gasPrice = this.configParams.GAS_PRICE
    // Set FLOToken address in LCF
    await this.isOwnershipRenounced(FLOContracts.floStaking) ||
      await this.sendAndWaitForTransaction(FLOContracts.lockupContractFactory.setFLOTokenAddress(FLOContracts.floToken.address, {gasPrice}))
  }

  async connectFLOContractsToCoreSEIV2Testnet(FLOContracts, coreContracts) {
    const gasPrice = this.configParams.GAS_PRICE
    await this.isOwnershipRenounced(FLOContracts.floStaking) ||
      await this.sendAndWaitForTransaction(FLOContracts.floStaking.setAddresses(
        FLOContracts.floToken.address,
        coreContracts.saiToken.address,
        coreContracts.troveManager.address, 
        coreContracts.borrowerOperations.address,
        coreContracts.activePool.address,
	{gasPrice}
      ))

    await this.isOwnershipRenounced(FLOContracts.communityIssuance) ||
      await this.sendAndWaitForTransaction(FLOContracts.communityIssuance.setAddresses(
        FLOContracts.floToken.address,
        coreContracts.stabilityPool.address,
	{gasPrice}
      ))
  }

  async connectUnipoolSEIV2Testnet(uniPool, FLOContracts, SAIWETHPairAddr, duration) {
    const gasPrice = this.configParams.GAS_PRICE
    await this.isOwnershipRenounced(uniPool) ||
      await this.sendAndWaitForTransaction(uniPool.setParams(FLOContracts.floToken.address, SAIWETHPairAddr, duration, {gasPrice}))
  }

  // --- Verify on Ethrescan ---
  async verifyContract(name, deploymentState, constructorArguments=[]) {
    return;
    if (!deploymentState[name] || !deploymentState[name].address) {
      console.error(`  --> No deployment state for contract ${name}!!`)
      return
    }
    if (deploymentState[name].verification) {
      console.log(`Contract ${name} already verified`)
      return
    }

    try {
      await this.hre.run("verify:verify", {
        address: deploymentState[name].address,
        constructorArguments,
      })
    } catch (error) {
      // if it was already verified, it’s like a success, so let’s move forward and save it
      if (error.name != 'NomicLabsHardhatPluginError') {
        console.error(`Error verifying: ${error.name}`)
        console.error(error)
        return
      }
    }

    deploymentState[name].verification = `${this.configParams.SEIV2SCAN_BASE_URL}/${deploymentState[name].address}#code`

    this.saveDeployment(deploymentState)
  }

  // --- Helpers ---

  async logContractObjects (contracts) {
    console.log(`Contract objects addresses:`)
    for ( const contractName of Object.keys(contracts)) {
      console.log(`${contractName}: ${contracts[contractName].address}`);
    }
  }
}

module.exports = SEIV2TestnetDeploymentHelper
