import { Button } from "theme-ui";
import { Decimal, FluidStoreState, StabilityDepositChange } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { useFluid } from "../../hooks/FluidContext";
import { useTransactionFunction } from "../Transaction";

type StabilityDepositActionProps = {
  transactionId: string;
  change: StabilityDepositChange<Decimal>;
};

const selectFrontendRegistered = ({ frontend }: FluidStoreState) =>
  frontend.status === "registered";

export const StabilityDepositAction: React.FC<StabilityDepositActionProps> = ({
  children,
  transactionId,
  change
}) => {
  const { config, fluid } = useFluid();
  const frontendRegistered = useLiquitySelector(selectFrontendRegistered);

  const frontendTag = frontendRegistered ? config.frontendTag : undefined;

  const [sendTransaction] = useTransactionFunction(
    transactionId,
    change.depositSAI
      ? fluid.send.depositSAIInStabilityPool.bind(fluid.send, change.depositSAI, frontendTag)
      : fluid.send.withdrawSAIFromStabilityPool.bind(fluid.send, change.withdrawSAI)
  );

  return <Button onClick={sendTransaction}>{children}</Button>;
};
