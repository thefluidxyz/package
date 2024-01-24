import { useContext } from "react";

import { FluidStore } from "@fluid/lib-base";

import { LiquityStoreContext } from "../components/LiquityStoreProvider";

export const useLiquityStore = <T>(): FluidStore<T> => {
  const store = useContext(LiquityStoreContext);

  if (!store) {
    throw new Error("You must provide a LiquityStore via LiquityStoreProvider");
  }

  return store as FluidStore<T>;
};
