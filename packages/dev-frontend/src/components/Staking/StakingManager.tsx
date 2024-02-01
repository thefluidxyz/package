import React from "react";
import { Button, Flex } from "theme-ui";

import {
  Decimal,
  Decimalish,
  FluidStoreState,
  FLOStake,
  FLOStakeChange
} from "@fluid/lib-base";

import { LiquityStoreUpdate, useLiquityReducer, useLiquitySelector } from "@fluid/lib-react";

import { GT, COIN } from "../../strings";

import { useStakingView } from "./context/StakingViewContext";
import { StakingEditor } from "./StakingEditor";
import { StakingManagerAction } from "./StakingManagerAction";
import { ActionDescription, Amount } from "../ActionDescription";
import { ErrorDescription } from "../ErrorDescription";

const init = ({ floStake }: FluidStoreState) => ({
  originalStake: floStake,
  editedFLO: floStake.stakedFLO
});

type StakeManagerState = ReturnType<typeof init>;
type StakeManagerAction =
  | LiquityStoreUpdate
  | { type: "revert" }
  | { type: "setStake"; newValue: Decimalish };

const reduce = (state: StakeManagerState, action: StakeManagerAction): StakeManagerState => {
  // console.log(state);
  // console.log(action);

  const { originalStake, editedFLO } = state;

  switch (action.type) {
    case "setStake":
      return { ...state, editedFLO: Decimal.from(action.newValue) };

    case "revert":
      return { ...state, editedFLO: originalStake.stakedFLO };

    case "updateStore": {
      const {
        stateChange: { floStake: updatedStake }
      } = action;

      if (updatedStake) {
        return {
          originalStake: updatedStake,
          editedFLO: updatedStake.apply(originalStake.whatChanged(editedFLO))
        };
      }
    }
  }

  return state;
};

const selectFLOBalance = ({ floBalance }: FluidStoreState) => floBalance;

type StakingManagerActionDescriptionProps = {
  originalStake: FLOStake;
  change: FLOStakeChange<Decimal>;
};

const StakingManagerActionDescription: React.FC<StakingManagerActionDescriptionProps> = ({
  originalStake,
  change
}) => {
  const stakeFLO = change.stakeFLO?.prettify().concat(" ", GT);
  const unstakeFLO = change.unstakeFLO?.prettify().concat(" ", GT);
  const collateralGain = originalStake.collateralGain.nonZero?.prettify(4).concat(" ETH");
  const saiGain = originalStake.saiGain.nonZero?.prettify().concat(" ", COIN);

  if (originalStake.isEmpty && stakeFLO) {
    return (
      <ActionDescription>
        You are staking <Amount>{stakeFLO}</Amount>.
      </ActionDescription>
    );
  }

  return (
    <ActionDescription>
      {stakeFLO && (
        <>
          You are adding <Amount>{stakeFLO}</Amount> to your stake
        </>
      )}
      {unstakeFLO && (
        <>
          You are withdrawing <Amount>{unstakeFLO}</Amount> to your wallet
        </>
      )}
      {(collateralGain || saiGain) && (
        <>
          {" "}
          and claiming{" "}
          {collateralGain && saiGain ? (
            <>
              <Amount>{collateralGain}</Amount> and <Amount>{saiGain}</Amount>
            </>
          ) : (
            <>
              <Amount>{collateralGain ?? saiGain}</Amount>
            </>
          )}
        </>
      )}
      .
    </ActionDescription>
  );
};

export const StakingManager: React.FC = () => {
  const { dispatch: dispatchStakingViewAction } = useStakingView();
  const [{ originalStake, editedFLO }, dispatch] = useLiquityReducer(reduce, init);
  const floBalance = useLiquitySelector(selectFLOBalance);

  const change = originalStake.whatChanged(editedFLO);
  const [validChange, description] = !change
    ? [undefined, undefined]
    : change.stakeFLO?.gt(floBalance)
    ? [
        undefined,
        <ErrorDescription>
          The amount you're trying to stake exceeds your balance by{" "}
          <Amount>
            {change.stakeFLO.sub(floBalance).prettify()} {GT}
          </Amount>
          .
        </ErrorDescription>
      ]
    : [change, <StakingManagerActionDescription originalStake={originalStake} change={change} />];

  const makingNewStake = originalStake.isEmpty;

  return (
    <StakingEditor title={"Staking"} {...{ originalStake, editedFLO, dispatch }}>
      {description ??
        (makingNewStake ? (
          <ActionDescription>Enter the amount of {GT} you'd like to stake.</ActionDescription>
        ) : (
          <ActionDescription>Adjust the {GT} amount to stake or withdraw.</ActionDescription>
        ))}

      <Flex variant="layout.actions">
        <Button
          variant="cancel"
          onClick={() => dispatchStakingViewAction({ type: "cancelAdjusting" })}
        >
          Cancel
        </Button>

        {validChange ? (
          <StakingManagerAction change={validChange}>Confirm</StakingManagerAction>
        ) : (
          <Button disabled>Confirm</Button>
        )}
      </Flex>
    </StakingEditor>
  );
};
