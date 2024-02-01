// Test with:
// GAS_PRICE=70832172907 BLOCK_NUMBER=15122486 npx hardhat run mainnetDeployment/aaveSeiOracleDeployment.js --config hardhat.config.mainnet-fork.js

// Deploy on mainnet with:
// GAS_PRICE=40000000000 npx hardhat run mainnetDeployment/aaveSeiOracleDeployment.js --network mainnet
// make sure you have the right private key for DEPLOYER_PRIVATEKEY in secrets.js

async function main() {
  // Uncomment for testing:
  /*
  const impersonateAddress = "0x31c57298578f7508B5982062cfEc5ec8BD346247";
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [ impersonateAddress ]
  });
  const deployerWallet = await ethers.provider.getSigner(impersonateAddress);
  const deployerWalletAddress = impersonateAddress;
  */

  const deployerWallet = (await ethers.getSigners())[0];
  const deployerWalletAddress = deployerWallet.address;
  console.log('Deployer: ', deployerWalletAddress);

  const SAIUsdToSAISeiEthersFactory = await ethers.getContractFactory("SAIUsdToSAISei", deployerWallet)
  const SeisaiUsdToSAISei = await SAIUsdToSAISeiEthersFactory.deploy()
  console.log(`SAIUsdToSAISei address: ${SeisaiUsdToSAISei.address}`)
  console.log(`SAIUsdToSAISei price:   ${await SeisaiUsdToSAISei.latestAnswer()}`)

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
