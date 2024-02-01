import { Button } from "theme-ui";

import { Decimal, FLOStakeChange } from "@fluid/lib-base";

import { useFluid } from "../../hooks/FluidContext";
import { useTransactionFunction } from "../Transaction";

type StakingActionProps = {
  change: FLOStakeChange<Decimal>;
};

export const StakingManagerAction: React.FC<StakingActionProps> = ({ change, children }) => {
  const { fluid } = useFluid();

  const [sendTransaction] = useTransactionFunction(
    "stake",
    change.stakeFLO
      ? fluid.send.stakeFLO.bind(fluid.send, change.stakeFLO)
      : fluid.send.unstakeFLO.bind(fluid.send, change.unstakeFLO)
  );

  return <Button onClick={sendTransaction}>{children}</Button>;
};
