import { Button } from "theme-ui";

import { FluidStoreState } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { useFluid } from "../../hooks/FluidContext";
import { useTransactionFunction } from "../Transaction";

const selectLQTYStake = ({ lqtyStake }: FluidStoreState) => lqtyStake;

export const StakingGainsAction: React.FC = () => {
  const { fluid } = useFluid();
  const { collateralGain, lusdGain } = useLiquitySelector(selectLQTYStake);

  const [sendTransaction] = useTransactionFunction(
    "stake",
    fluid.send.withdrawGainsFromStaking.bind(fluid.send)
  );

  return (
    <Button onClick={sendTransaction} disabled={collateralGain.isZero && lusdGain.isZero}>
      Claim gains
    </Button>
  );
};
