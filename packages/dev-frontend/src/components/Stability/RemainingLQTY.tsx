import React from "react";
import { Flex } from "theme-ui";

import { FluidStoreState } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

const selector = ({ remainingStabilityPoolLQTYReward }: FluidStoreState) => ({
  remainingStabilityPoolLQTYReward
});

export const RemainingLQTY: React.FC = () => {
  const { remainingStabilityPoolLQTYReward } = useLiquitySelector(selector);

  return (
    <Flex sx={{ mr: 2, fontSize: 2, fontWeight: "medium" }}>
      {remainingStabilityPoolLQTYReward.prettify(0)} LQTY remaining
    </Flex>
  );
};
