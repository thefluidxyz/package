require("@nomiclabs/hardhat-truffle5");
require("@nomiclabs/hardhat-ethers");
require("@nomicfoundation/hardhat-toolbox");
// require("@nomiclabs/hardhat-etherscan");
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

const seiv2TestnetRPCUrl = "https://evm-rpc.arctic-1.seinetwork.io"
// const seiv2TestnetRPCUrl = "https://evm-devnet.seinetwork.io"

module.exports = {
    paths: {
        contracts: "./contracts",
        artifacts: "./artifacts"
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
        },
        hardhat: {
            accounts: accountsList,
            gas: 10000000,  // tx gas limit
            blockGasLimit: 15000000,
            gas: 2100000,
            gasPrice: 110000000000,
            initialBaseFeePerGas: 0,
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
            gasPrice: process.env.GAS_PRICE ? parseInt(process.env.GAS_PRICE) : 3500000000,
            accounts: [
                getSecret('DEPLOYER_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY1),
                getSecret('ACCOUNT2_PRIVATEKEY', ENV.DEPLOY_PRIVATE_KEY2)
            ],
            // chainId: 713715,
            network_id: '*'
        }
    },
    etherscan: {
        apiKey: {
            seiv2testnet: "0"
        },
        customChains: [
            {
                network: "seiv2testnet",
                chainId: 713715,
                urls: {
                    apiURL: "https://arctic-1-api.seitrace.com/api/",
                    browserURL: "https://seitrace.com/"
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
