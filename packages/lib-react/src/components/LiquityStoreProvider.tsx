import { FluidStore } from "@fluid/lib-base";
import React, { createContext, useEffect, useState } from "react";

export const LiquityStoreContext = createContext<FluidStore | undefined>(undefined);

type LiquityStoreProviderProps = {
  store: FluidStore;
  loader?: React.ReactNode;
};

export const LiquityStoreProvider: React.FC<LiquityStoreProviderProps> = ({
  store,
  loader,
  children
}) => {
  const [loadedStore, setLoadedStore] = useState<FluidStore>();

  useEffect(() => {
    store.onLoaded = () => setLoadedStore(store);
    const stop = store.start();

    return () => {
      store.onLoaded = undefined;
      setLoadedStore(undefined);
      stop();
    };
  }, [store]);

  if (!loadedStore) {
    return <>{loader}</>;
  }

  return <LiquityStoreContext.Provider value={loadedStore}>{children}</LiquityStoreContext.Provider>;
};
