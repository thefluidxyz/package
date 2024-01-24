import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Provider } from "@ethersproject/abstract-provider";
import { FallbackProvider } from "@ethersproject/providers";
import { useProvider, useSigner, useAccount, useChainId } from "wagmi";

import {
  BlockPolledLiquityStore,
  EthersLiquity,
  EthersLiquityWithStore,
  _connectByChainId
} from "@fluid/lib-ethers";

import { FluidFrontendConfig, getConfig } from "../config";
import { BatchedProvider } from "../providers/BatchingProvider";

type FluidContextValue = {
  config: FluidFrontendConfig;
  account: string;
  provider: Provider;
  // @ts-ignore
  fluid: EthersLiquityWithStore<BlockPolledLiquityStore>;
};

const FluidContext = createContext<FluidContextValue | undefined>(undefined);

type FluidProviderProps = {
  loader?: React.ReactNode;
  unsupportedNetworkFallback?: React.ReactNode;
  unsupportedMainnetFallback?: React.ReactNode;
};

export const FluidProvider: React.FC<FluidProviderProps> = ({
  children,
  loader,
  unsupportedNetworkFallback,
  unsupportedMainnetFallback
}) => {
  const provider = useProvider<FallbackProvider>();
  const signer = useSigner();
  const account = useAccount();
  const chainId = useChainId();
  const [config, setConfig] = useState<FluidFrontendConfig>();

  const connection = useMemo(() => {
    if (config && provider && signer.data && account.address) {
      const batchedProvider = new BatchedProvider(provider, chainId);
      // batchedProvider._debugLog = true;

      try {
        return _connectByChainId(batchedProvider, signer.data, chainId, {
          userAddress: account.address,
          frontendTag: config.frontendTag,
          useStore: "blockPolled"
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [config, provider, signer.data, account.address, chainId]);

  useEffect(() => {
    getConfig().then(setConfig);
  }, []);

  if (!config || !provider || !signer.data || !account.address) {
    return <>{loader}</>;
  }

  if (config.testnetOnly && chainId === 1) {
    return <>{unsupportedMainnetFallback}</>;
  }

  if (!connection) {
    return <>{unsupportedNetworkFallback}</>;
  }

  const fluid = EthersLiquity._from(connection);
  fluid.store.logging = true;

  return (
    <FluidContext.Provider
      value={{ config, account: account.address, provider: connection.provider, fluid }}
    >
      {children}
    </FluidContext.Provider>
  );
};

export const useFluid = () => {
  const fluidContext = useContext(FluidContext);

  if (!fluidContext) {
    throw new Error("You must provide a FluidContext via FluidProvider");
  }

  return fluidContext;
};
