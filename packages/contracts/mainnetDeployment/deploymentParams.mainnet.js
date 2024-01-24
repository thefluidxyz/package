const externalAddrs  = {
  // https://data.chain.link/eth-usd
  CHAINLINK_ETHUSD_PROXY: "0xD4a33860578De61DBAbDc8BFdb98FD742fA7028e", 
  // https://docs.tellor.io/tellor/integration/reference-page
  TELLOR_MASTER:"0x51c59c6cAd28ce3693977F2feB4CfAebec30d8a2",
  // https://uniswap.org/docs/v2/smart-contracts/factory/
  UNISWAP_V2_FACTORY: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
  UNISWAP_V2_ROUTER02: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  // https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
  WETH_ERC20: "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
}

const liquityAddrs = {
  GENERAL_SAFE:"0x42d0b8efF2fFF1a70B57C8E96bE77C2e49A774c3", // to be passed to LQTYToken as the bounties/hackathons address
  LQTY_SAFE:"0x42d0b8efF2fFF1a70B57C8E96bE77C2e49A774c3", // to be passed to LQTYToken as the LQTY multisig address
  DEPLOYER: "0x552594b83058882C2263DBe23235477f63e7D60B" // Mainnet REAL deployment address
}

// Beneficiaries for lockup contracts. 
const beneficiaries = {
  ACCOUNT_1: "0xBBdc88676759D09617C288E29f2Eb7Ce94592f25",  
  ACCOUNT_2: "0x77616b3a57C9ACf018E87c92ae187C8Cc0B112D6",
}

const OUTPUT_FILE = './mainnetDeployment/mainnetDeploymentOutput.json'

const delay = ms => new Promise(res => setTimeout(res, ms));
const waitFunction = async () => {
  return delay(90000) // wait 90s
}

const GAS_PRICE = 25000000000
const TX_CONFIRMATIONS = 3 // for mainnet

const ETHERSCAN_BASE_URL = 'https://etherscan.io/address'

module.exports = {
  externalAddrs,
  liquityAddrs,
  beneficiaries,
  OUTPUT_FILE,
  waitFunction,
  GAS_PRICE,
  TX_CONFIRMATIONS,
  ETHERSCAN_BASE_URL,
};