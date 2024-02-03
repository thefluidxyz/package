const SEIV2TestnetDeploymentHelper = require("../utils/seiv2TestnetDeploymentHelpers.js")

async function seiv2PriceFeedDeploy(configParams) {
    const deployerWallet = (await ethers.getSigners())[0]
    const stdh = new SEIV2TestnetDeploymentHelper(configParams, deployerWallet)
    const deploymentState = stdh.loadPreviousDeployment()
    await stdh.deployPriceFeedSEIV2Testnet(deploymentState)
}

module.exports = {
    seiv2PriceFeedDeploy
}
  