const { seiv2Deploy } = require('./seiv2TestnetDeployment.js')
const { seiv2PriceFeedDeploy } = require('./deploymentPriceFeed.seiv2testnet.js')
const configParams = require("./deploymentParams.seiv2testnet.js")

async function main() {
  // await seiv2PriceFeedDeploy(configParams)
  await seiv2Deploy(configParams)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
