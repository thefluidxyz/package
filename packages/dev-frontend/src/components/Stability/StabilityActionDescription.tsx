import React from "react";

import { Decimal, StabilityDeposit, StabilityDepositChange } from "@fluid/lib-base";

import { COIN, GT } from "../../strings";
import { ActionDescription, Amount } from "../ActionDescription";

type StabilityActionDescriptionProps = {
  originalDeposit: StabilityDeposit;
  change: StabilityDepositChange<Decimal>;
};

export const StabilityActionDescription: React.FC<StabilityActionDescriptionProps> = ({
  originalDeposit,
  change
}) => {
  const collateralGain = originalDeposit.collateralGain.nonZero?.prettify(4).concat(" ETH");
  const floReward = originalDeposit.floReward.nonZero?.prettify().concat(" ", GT);

  return (
    <ActionDescription>
      {change.depositSAI ? (
        <>
          You are depositing{" "}
          <Amount>
            {change.depositSAI.prettify()} {COIN}
          </Amount>{" "}
          in the Stability Pool
        </>
      ) : (
        <>
          You are withdrawing{" "}
          <Amount>
            {change.withdrawSAI.prettify()} {COIN}
          </Amount>{" "}
          to your wallet
        </>
      )}
      {(collateralGain || floReward) && (
        <>
          {" "}
          and claiming at least{" "}
          {collateralGain && floReward ? (
            <>
              <Amount>{collateralGain}</Amount> and <Amount>{floReward}</Amount>
            </>
          ) : (
            <Amount>{collateralGain ?? floReward}</Amount>
          )}
        </>
      )}
      .
    </ActionDescription>
  );
};
