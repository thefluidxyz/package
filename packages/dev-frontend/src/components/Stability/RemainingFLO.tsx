import React from "react";
import { Flex } from "theme-ui";

import { FluidStoreState } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

const selector = ({ remainingStabilityPoolFLOReward }: FluidStoreState) => ({
  remainingStabilityPoolFLOReward
});

export const RemainingFLO: React.FC = () => {
  const { remainingStabilityPoolFLOReward } = useLiquitySelector(selector);

  return (
    <Flex sx={{ mr: 2, fontSize: 2, fontWeight: "medium" }}>
      {remainingStabilityPoolFLOReward.prettify(0)} FLO remaining
    </Flex>
  );
};
