import React, { useState } from "react";
import { Heading, Box, Card, Button } from "theme-ui";

import { Decimal, Decimalish, Difference, FluidStoreState, FLOStake } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { COIN, GT } from "../../strings";

import { Icon } from "../Icon";
import { EditableRow, StaticRow } from "../Trove/Editor";
import { LoadingOverlay } from "../LoadingOverlay";

import { useStakingView } from "./context/StakingViewContext";

const select = ({ floBalance, totalStakedFLO }: FluidStoreState) => ({
  floBalance,
  totalStakedFLO
});

type StakingEditorProps = {
  title: string;
  originalStake: FLOStake;
  editedFLO: Decimal;
  dispatch: (action: { type: "setStake"; newValue: Decimalish } | { type: "revert" }) => void;
};

export const StakingEditor: React.FC<StakingEditorProps> = ({
  children,
  title,
  originalStake,
  editedFLO,
  dispatch
}) => {
  const { floBalance, totalStakedFLO } = useLiquitySelector(select);
  const { changePending } = useStakingView();
  const editingState = useState<string>();

  const edited = !editedFLO.eq(originalStake.stakedFLO);

  const maxAmount = originalStake.stakedFLO.add(floBalance);
  const maxedOut = editedFLO.eq(maxAmount);

  const totalStakedFLOAfterChange = totalStakedFLO.sub(originalStake.stakedFLO).add(editedFLO);

  const originalPoolShare = originalStake.stakedFLO.mulDiv(100, totalStakedFLO);
  const newPoolShare = editedFLO.mulDiv(100, totalStakedFLOAfterChange);
  const poolShareChange =
    originalStake.stakedFLO.nonZero && Difference.between(newPoolShare, originalPoolShare).nonZero;

  return (
    <Card>
      <Heading>
        {title}
        {edited && !changePending && (
          <Button
            variant="titleIcon"
            sx={{ ":enabled:hover": { color: "danger" } }}
            onClick={() => dispatch({ type: "revert" })}
          >
            <Icon name="history" size="lg" />
          </Button>
        )}
      </Heading>

      <Box sx={{ p: [2, 3] }}>
        <EditableRow
          label="Stake"
          inputId="stake-flo"
          amount={editedFLO.prettify()}
          maxAmount={maxAmount.toString()}
          maxedOut={maxedOut}
          unit={GT}
          {...{ editingState }}
          editedAmount={editedFLO.toString(2)}
          setEditedAmount={newValue => dispatch({ type: "setStake", newValue })}
        />

        {newPoolShare.infinite ? (
          <StaticRow label="Pool share" inputId="stake-share" amount="N/A" />
        ) : (
          <StaticRow
            label="Pool share"
            inputId="stake-share"
            amount={newPoolShare.prettify(4)}
            pendingAmount={poolShareChange?.prettify(4).concat("%")}
            pendingColor={poolShareChange?.positive ? "success" : "danger"}
            unit="%"
          />
        )}

        {!originalStake.isEmpty && (
          <>
            <StaticRow
              label="Redemption gain"
              inputId="stake-gain-eth"
              amount={originalStake.collateralGain.prettify(4)}
              color={originalStake.collateralGain.nonZero && "success"}
              unit="ETH"
            />

            <StaticRow
              label="Issuance gain"
              inputId="stake-gain-sai"
              amount={originalStake.saiGain.prettify()}
              color={originalStake.saiGain.nonZero && "success"}
              unit={COIN}
            />
          </>
        )}

        {children}
      </Box>

      {changePending && <LoadingOverlay />}
    </Card>
  );
};
