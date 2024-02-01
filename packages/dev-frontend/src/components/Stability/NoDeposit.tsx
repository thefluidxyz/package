import React, { useCallback } from "react";
import { Card, Heading, Box, Flex, Button } from "theme-ui";
import { InfoMessage } from "../InfoMessage";
import { useStabilityView } from "./context/StabilityViewContext";
import { RemainingFLO } from "./RemainingFLO";
import { Yield } from "./Yield";

export const NoDeposit: React.FC = () => {
  const { dispatchEvent } = useStabilityView();

  const handleOpenTrove = useCallback(() => {
    dispatchEvent("DEPOSIT_PRESSED");
  }, [dispatchEvent]);

  return (
    <Card>
      <Heading>
        Stability Pool
        <Flex sx={{ justifyContent: "flex-end" }}>
          <RemainingFLO />
        </Flex>
      </Heading>
      <Box sx={{ p: [2, 3] }}>
        <InfoMessage title="You have no SAI in the Stability Pool.">
          You can earn ETH and FLO rewards by depositing SAI.
        </InfoMessage>

        <Flex variant="layout.actions">
          <Flex sx={{ justifyContent: "flex-start", flex: 1, alignItems: "center" }}>
            <Yield />
          </Flex>
          <Button onClick={handleOpenTrove}>Deposit</Button>
        </Flex>
      </Box>
    </Card>
  );
};
