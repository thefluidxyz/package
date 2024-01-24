import React from "react";
import { Button } from "theme-ui";
import { useFluid } from "../../../hooks/FluidContext";
import { useTransactionFunction } from "../../Transaction";

type ClaimAndMoveProps = {
  disabled?: boolean;
};

export const ClaimAndMove: React.FC<ClaimAndMoveProps> = ({ disabled, children }) => {
  const { fluid } = useFluid();

  const [sendTransaction] = useTransactionFunction(
    "stability-deposit",
    fluid.send.transferCollateralGainToTrove.bind(fluid.send)
  );

  return (
    <Button
      variant="outline"
      sx={{ mt: 3, width: "100%" }}
      onClick={sendTransaction}
      disabled={disabled}
    >
      {children}
    </Button>
  );
};
