import { Button } from "theme-ui";

import { Decimal, TroveChange } from "@fluid/lib-base";

import { useFluid } from "../../hooks/FluidContext";
import { useTransactionFunction } from "../Transaction";

type TroveActionProps = {
  transactionId: string;
  change: Exclude<TroveChange<Decimal>, { type: "invalidCreation" }>;
  maxBorrowingRate: Decimal;
  borrowingFeeDecayToleranceMinutes: number;
};

export const TroveAction: React.FC<TroveActionProps> = ({
  children,
  transactionId,
  change,
  maxBorrowingRate,
  borrowingFeeDecayToleranceMinutes
}) => {
  const { fluid } = useFluid();

  const [sendTransaction] = useTransactionFunction(
    transactionId,
    change.type === "creation"
      ? fluid.send.openTrove.bind(fluid.send, change.params, {
          maxBorrowingRate,
          borrowingFeeDecayToleranceMinutes
        })
      : change.type === "closure"
      ? fluid.send.closeTrove.bind(fluid.send)
      : fluid.send.adjustTrove.bind(fluid.send, change.params, {
          maxBorrowingRate,
          borrowingFeeDecayToleranceMinutes
        })
  );

  return <Button sx={{width: "100%"}} onClick={sendTransaction}>{children}</Button>;
};
