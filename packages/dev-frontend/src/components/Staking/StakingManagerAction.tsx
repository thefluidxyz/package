import { Button } from "theme-ui";

import { Decimal, LQTYStakeChange } from "@fluid/lib-base";

import { useFluid } from "../../hooks/FluidContext";
import { useTransactionFunction } from "../Transaction";

type StakingActionProps = {
  change: LQTYStakeChange<Decimal>;
};

export const StakingManagerAction: React.FC<StakingActionProps> = ({ change, children }) => {
  const { fluid } = useFluid();

  const [sendTransaction] = useTransactionFunction(
    "stake",
    change.stakeLQTY
      ? fluid.send.stakeLQTY.bind(fluid.send, change.stakeLQTY)
      : fluid.send.unstakeLQTY.bind(fluid.send, change.unstakeLQTY)
  );

  return <Button onClick={sendTransaction}>{children}</Button>;
};
