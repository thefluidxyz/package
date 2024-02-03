import React from "react";
import { createClient, WagmiConfig, Chain } from "wagmi";
import { mainnet, localhost } from "wagmi/chains";
import { ConnectKitProvider } from "connectkit";
import { Flex, Heading, ThemeProvider, Paragraph, Link } from "theme-ui";

import getDefaultClient from "./connectkit/defaultClient";
import { FluidProvider } from "./hooks/FluidContext";
import { WalletConnector } from "./components/WalletConnector";
import { TransactionProvider } from "./components/Transaction";
import { Icon } from "./components/Icon";
import { getConfig } from "./config";
import theme from "./theme";

import { DisposableWalletProvider } from "./testUtils/DisposableWalletProvider";
import { FluidFrontend } from "./FluidFrontend";
import { AppLoader } from "./components/AppLoader";
import { useAsyncValue } from "./hooks/AsyncValue";

const isDemoMode = import.meta.env.VITE_APP_DEMO_MODE === "true";

const seiV2Testnet = {
  id: 713715,
  name: "Sei Testnet Network",
  network: "sei",
  nativeCurrency: {
    decimals: 18,
    name: "Sei",
    symbol: "SEI",
  },
  rpcUrls: {
    public: { http: ["https://evm-rpc.arctic-1.seinetwork.io"] },
    default: { http: ["https://evm-rpc.arctic-1.seinetwork.io"] },
  },
} as const satisfies Chain;

if (isDemoMode) {
  const ethereum = new DisposableWalletProvider(
    import.meta.env.VITE_APP_RPC_URL || `http://${window.location.hostname || "localhost"}:8545`,
    "0x4d5db4107d237df6a3d58ee5f70ae63d73d7658d4026f2eefd2f204c81682cb7"
  );

  Object.assign(window, { ethereum });
}

// Start pre-fetching the config
getConfig().then(config => {
  // console.log("Frontend config:");
  // console.log(config);
  Object.assign(window, { config });
});

const UnsupportedMainnetFallback: React.FC = () => (
  <Flex
    sx={{
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      textAlign: "center"
    }}
  >
    <Heading sx={{ mb: 3 }}>
      <Icon name="exclamation-triangle" /> This app is for testing purposes only.
    </Heading>

    <Paragraph sx={{ mb: 3 }}>Please change your network to Sei V2 Testnet.</Paragraph>

    <Paragraph>
      If you'd like to use the Fluid Protocol on mainnet, please pick a frontend{" "}
      <Link href="https://app.thefluid.xyz/frontend">
        here <Icon name="external-link-alt" size="xs" />
      </Link>
      .
    </Paragraph>
  </Flex>
);

const UnsupportedNetworkFallback: React.FC = () => (
  <Flex
    sx={{
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      textAlign: "center"
    }}
  >
    <Heading sx={{ mb: 3 }}>
      <Icon name="exclamation-triangle" /> Fluid is not supported on this network.
    </Heading>
    Please switch to mainnet, Sei V2 Testnet.
  </Flex>
);

const App = () => {
  const config = useAsyncValue(getConfig);
  const loader = <AppLoader />;

  return (
    <ThemeProvider theme={theme}>
      {config.loaded && (
        <WagmiConfig
          client={createClient(
            getDefaultClient({
              appName: "Fluid",
              chains:
                isDemoMode || import.meta.env.MODE === "test"
                  ? [localhost]
                  : config.value.testnetOnly
                  ? [seiV2Testnet]
                  : [seiV2Testnet, mainnet],
              walletConnectProjectId: config.value.walletConnectProjectId,
              infuraId: config.value.infuraApiKey,
              alchemyId: config.value.alchemyApiKey
            })
          )}
        >
          <ConnectKitProvider options={{ hideBalance: true }}>
            <WalletConnector loader={loader}>
              <FluidProvider
                loader={loader}
                unsupportedNetworkFallback={<UnsupportedNetworkFallback />}
                unsupportedMainnetFallback={<UnsupportedMainnetFallback />}
              >
                <TransactionProvider>
                  <FluidFrontend loader={loader} />
                </TransactionProvider>
              </FluidProvider>
            </WalletConnector>
          </ConnectKitProvider>
        </WagmiConfig>
      )}
    </ThemeProvider>
  );
};

export default App;
