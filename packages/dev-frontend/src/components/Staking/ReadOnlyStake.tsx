import { Heading, Box, Card, Flex, Button } from "theme-ui";

import { FluidStoreState } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { COIN, GT } from "../../strings";

import { DisabledEditableRow, StaticRow } from "../Trove/Editor";
import { LoadingOverlay } from "../LoadingOverlay";
import { Icon } from "../Icon";

import { useStakingView } from "./context/StakingViewContext";
import { StakingGainsAction } from "./StakingGainsAction";

const select = ({ floStake, totalStakedFLO }: FluidStoreState) => ({
  floStake,
  totalStakedFLO
});

export const ReadOnlyStake: React.FC = () => {
  const { changePending, dispatch } = useStakingView();
  const { floStake, totalStakedFLO } = useLiquitySelector(select);

  const poolShare = floStake.stakedFLO.mulDiv(100, totalStakedFLO);

  return (
    <Card>
      <Heading>Staking</Heading>

      <Box sx={{ p: [2, 3] }}>
        <DisabledEditableRow
          label="Stake"
          inputId="stake-flo"
          amount={floStake.stakedFLO.prettify()}
          unit={GT}
        />

        <StaticRow
          label="Pool share"
          inputId="stake-share"
          amount={poolShare.prettify(4)}
          unit="%"
        />

        <StaticRow
          label="Redemption gain"
          inputId="stake-gain-eth"
          amount={floStake.collateralGain.prettify(4)}
          color={floStake.collateralGain.nonZero && "success"}
          unit="ETH"
        />

        <StaticRow
          label="Issuance gain"
          inputId="stake-gain-sai"
          amount={floStake.saiGain.prettify()}
          color={floStake.saiGain.nonZero && "success"}
          unit={COIN}
        />

        <Flex variant="layout.actions">
          <Button variant="outline" onClick={() => dispatch({ type: "startAdjusting" })}>
            <Icon name="pen" size="sm" />
            &nbsp;Adjust
          </Button>

          <StakingGainsAction />
        </Flex>
      </Box>

      {changePending && <LoadingOverlay />}
    </Card>
  );
};
