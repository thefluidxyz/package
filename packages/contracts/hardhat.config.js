require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("solidity-coverage");
require("hardhat-gas-reporter");

const ENV = require ("./env.json")
const accounts = require("./hardhatAccountsList2k.js");
const accountsList = accounts.accountsList

const fs = require('fs')
const getSecret = (secretKey, defaultValue='') => {
    const SECRETS_FILE = "./secrets.js"
    let secret = defaultValue
    if (fs.existsSync(SECRETS_FILE)) {
        const { secrets } = require(SECRETS_FILE)
        if (secrets[secretKey]) { secret = secrets[secretKey] }
    }

    return secret
}
const alchemyUrl = () => {
    // return `https://goerli.infura.io/v3/${getSecret('alchemyAPIKey')}`
    return `https://eth-mainnet.alchemyapi.io/v2/${getSecret('alchemyAPIKey')}`
}

const alchemyUrlRinkeby = () => {
    // return `https://goerli.infura.io/v3/${getSecret('alchemyAPIKeyRinkeby')}`
    // return `https://evm-devnet.seinetwork.io`
    return `https://eth-rinkeby.alchemyapi.io/v2/${getSecret('alchemyAPIKeyRinkeby')}`
}

const seiv2TestnetRPCUrl = "https://evm-devnet.seinetwork.io"

module.exports = {
    paths: {
        // contracts: "./contracts",
        // artifacts: "./artifacts"
    },
    solidity: {
        compilers: [
            {
                version: "0.4.23",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
            {
                version: "0.5.17",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
            {
                version: "0.6.11",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100
                    }
                }
            },
        ]
    },
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545/",
            chainId: 31337,
            gasPrice: 20000000000,
            // timeout: 12000
            // accounts: {
            //     mnemonic: "test test test test test test test test test test test junk",
            //     path: "m/44'/60'/0'/0",
            //     initialIndex: 0,
            //     count:10,
            //     passphrase: ""
            // }
        },
        hardhat: {
            accounts: accountsList,
            gas: 10000000,  // tx gas limit
            blockGasLimit: 15000000,
            gas: 2100000,
            gasPrice: 110000000000,
            initialBaseFeePerGas: 0,
            // forking: {
            //     url: "https://eth.llamarpc.com",
            //     // blockNumber can be specified if you want to fork from a specific block
            //     blockNumber: 1234567 // Example block number
            // }
        },
        mainnet: {
            url: alchemyUrl(),
            gasPrice: process.env.GAS_PRICE ? parseInt(process.env.GAS_PRICE) : 20000000000,
            accounts: [
                getSecret('DEPLOYER_PRIVATEKEY', ''),
                getSecret('ACCOUNT2_PRIVATEKEY', '')
            ]
        },
        goerli: {
            url: `https://goerli.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161`,
            gasPrice: process.env.GAS_PRICE ? parseInt(process.env.GAS_PRICE) : 20000000000,
            accounts: [
                getSecret('DEPLOYER_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY1),
                getSecret('ACCOUNT2_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY2)
            ]
        },
        seiv2testnet: {
            url: seiv2TestnetRPCUrl,
            gasPrice: process.env.GAS_PRICE ? parseInt(process.env.GAS_PRICE) : 5000000000,
            accounts: [
                getSecret('DEPLOYER_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY1),
                getSecret('ACCOUNT2_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY2)
            ],
            chainId: 713715
        },
        rinkeby: {
            url: alchemyUrlRinkeby(),
            gas: 10000000,  // tx gas limit
            accounts: [getSecret('RINKEBY_DEPLOYER_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY1)]
        },
    },
    etherscan: {
        apiKey: getSecret("ETHERSCAN_API_KEY"),
        customChains: [
            {
                network: "seiv2testnet",
                chainId: 713715,
                urls: {
                    apiURL: "https://testnet.seiv2scan.metabest.tech/api",
                    browserURL: "https://testnet.seiv2scan.metabest.tech/"
                }
            },
            {
                network: "goerli",
                chainId: 5,
                urls: {
                    apiURL: "https://api-goerli.etherscan.io/api",
                    browserURL: "https://goerli.etherscan.io/"
                }
            }
        ]
    },
    mocha: { timeout: 12000000 },
    rpc: {
        host: "localhost",
        port: 8545
    },
    gasReporter: {
        enabled: (process.env.REPORT_GAS) ? true : false
    }
};
