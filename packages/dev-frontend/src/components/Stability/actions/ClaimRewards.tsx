import React from "react";
import { Button } from "theme-ui";

import { useFluid } from "../../../hooks/FluidContext";
import { useTransactionFunction } from "../../Transaction";

type ClaimRewardsProps = {
  disabled?: boolean;
};

export const ClaimRewards: React.FC<ClaimRewardsProps> = ({ disabled, children }) => {
  const { fluid } = useFluid();

  const [sendTransaction] = useTransactionFunction(
    "stability-deposit",
    fluid.send.withdrawGainsFromStabilityPool.bind(fluid.send)
  );

  return (
    <Button onClick={sendTransaction} disabled={disabled}>
      {children}
    </Button>
  );
};
