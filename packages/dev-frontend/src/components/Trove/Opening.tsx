import React, { useCallback, useEffect, useState } from "react";
import { Flex, Button, Box, Spinner, Text } from "theme-ui";
import {
  FluidStoreState,
  Decimal,
  Trove,
  LUSD_LIQUIDATION_RESERVE,
  LUSD_MINIMUM_NET_DEBT,
} from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { useStableTroveChange } from "../../hooks/useStableTroveChange";
// import { ActionDescription } from "../ActionDescription";
import { useMyTransactionState } from "../Transaction";
import { TroveAction } from "./TroveAction";
// import { useTroveView } from "./context/TroveViewContext";
// import { COIN } from "../../strings";
import { Icon } from "../Icon";
// import { InfoIcon } from "../InfoIcon";
import { LoadingOverlay } from "../LoadingOverlay";
// import { CollateralRatio } from "./CollateralRatio";
// import { EditableRow, StaticRow } from "./Editor";
import { GasEstimationState } from "./ExpensiveTroveChangeWarning";
import {
  selectForTroveChangeValidation,
  validateTroveChange
} from "./validation/validateTroveChange";

const selector = (state: FluidStoreState) => {
  const { fees, price, accountBalance } = state;
  return {
    fees,
    price,
    accountBalance,
    validationContext: selectForTroveChangeValidation(state)
  };
};

const EMPTY_TROVE = new Trove(Decimal.ZERO, Decimal.ZERO);
const TRANSACTION_ID = "trove-creation";
// const GAS_ROOM_ETH = Decimal.from(0.1);

export const Opening: React.FC = () => {
  // const { dispatchEvent } = useTroveView();
  const { fees, price, accountBalance, validationContext } = useLiquitySelector(selector);

  const borrowingRate = fees.borrowingRate();
  const [editing, setEditing] = useState<string>();

  const [collateral, setCollateral] = useState<Decimal>(Decimal.ZERO);
  const [borrowAmount, setBorrowAmount] = useState<Decimal>(Decimal.ZERO);

  const [custom, setCustom] = useState<Boolean>(false)
  const maxBorrowingRate = borrowingRate.add(0.005);

  const fee = borrowAmount.mul(borrowingRate);
  // const feePct = new Percent(borrowingRate);
  const totalDebt = borrowAmount.add(LUSD_LIQUIDATION_RESERVE).add(fee);
  const isDirty = !collateral.isZero || !borrowAmount.isZero;
  const trove = isDirty ? new Trove(collateral, totalDebt) : EMPTY_TROVE;
  // const maxCollateral = accountBalance.gt(GAS_ROOM_ETH)
  //   ? accountBalance.sub(GAS_ROOM_ETH)
  //   : Decimal.ZERO;
  // const collateralMaxedOut = collateral.eq(maxCollateral);
  // const collateralRatio =
  //   !collateral.isZero && !borrowAmount.isZero ? trove.collateralRatio(price) : undefined;
  const [collateralRatio, setCollateralRatio] = useState (!collateral.isZero && !borrowAmount.isZero ? trove.collateralRatio(price) : undefined)

  const [troveChange, description] = validateTroveChange(
    EMPTY_TROVE,
    trove,
    borrowingRate,
    validationContext
  );

  const stableTroveChange = useStableTroveChange(troveChange);
  const [gasEstimationState, setGasEstimationState] = useState<GasEstimationState>({ type: "idle" });

  console.log (description, setGasEstimationState, troveChange, "KKKKKKKKKKKKKKKKKKK")

  const transactionState = useMyTransactionState(TRANSACTION_ID);
  const isTransactionPending =
    transactionState.type === "waitingForApproval" ||
    transactionState.type === "waitingForConfirmation";

  // const handleCancelPressed = useCallback(() => {
  //   dispatchEvent("CANCEL_ADJUST_TROVE_PRESSED");
  // }, [dispatchEvent]);

  const reset = useCallback(() => {
    setCollateral(Decimal.ZERO);
    setBorrowAmount(Decimal.ZERO);
  }, []);

  useEffect(() => {
    if (!collateral.isZero && borrowAmount.isZero) {
      setBorrowAmount(LUSD_MINIMUM_NET_DEBT);
    }
  }, [collateral, borrowAmount]);

  const onCollateralRatioChange = (e: any) => {
    if (isNaN(Number(e.target.value))) return
    setCollateralRatio(Decimal.from(Number(e.target.value)/100))
    setBorrowAmount(Decimal.from(collateral.mulDiv(price, Decimal.from(Number(e.target.value)/100)).sub(LUSD_LIQUIDATION_RESERVE)))
  }

  const onBorrowingAmountChange = (e: any) => {
    setBorrowAmount(Decimal.from(e.target.value))
    setCollateralRatio(Decimal.from(collateral.mulDiv(price, Decimal.from(e.target.value).add(LUSD_LIQUIDATION_RESERVE).add(fee))))
  }

  const onCollateralChange = (e: any) => {
    setCollateral(Decimal.from(e.target.value))
    setCollateralRatio(Decimal.from(e.target.value).mulDiv(price, borrowAmount.add(LUSD_LIQUIDATION_RESERVE).add(fee)))
  }

  return (
    <div className="mt-7 lg:mt-8">
      <div className="flex flex-row justify-between text-[32px] font-semibold p-0 sm:pl-4 sm:pr-2 py-2">
        <div>Borrow &nbsp;<Text sx={{ opacity: 0.3 }}>Redeem</Text></div>
        {isDirty && !isTransactionPending && (
          <Button variant="titleIcon" sx={{ ":enabled:hover": { color: "danger" } }} onClick={reset}>
            <Icon name="history" size="lg" />
          </Button>
        )}
      </div>

      <Box sx={{ p: [2, 3] }}>
        {/* <EditableRow
          label="Collateral"
          inputId="trove-collateral"
          amount={collateral.prettify(4)}
          maxAmount={maxCollateral.toString()}
          maxedOut={collateralMaxedOut}
          editingState={editingState}
          unit="ETH"
          editedAmount={collateral.toString(4)}
          setEditedAmount={(amount: string) => setCollateral(Decimal.from(amount))}
        /> */}
        <div className="mb-[28px]">
            <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
                <div>Collateral</div>
                <div className="flex flex-row">
                    <div>Balance</div>
                    <div className="ml-2 font-normal">{`${accountBalance}`} SEI</div>
                </div>
            </div>
            <div className={`flex flex-row items-center justify-between border ${editing !== "collateral" && collateral.eq(0) ? "border-[#F45348]" : "border-[#BDFAE2]"} rounded-md p-[14px]`}>
                <input 
                    className="bg-transparent text-lg w-full outline-none"
                    value={collateral.toString(4)}
                    onChange={(e) => onCollateralChange(e)}
                    onBlur={() => setEditing(undefined)}
                    onClick={() => setEditing("collateral")}
                />
                <div className="flex flex-row items-center font-medium text-lg">
                    <span className="w-4 h-4 rounded-full bg-[#BDFAE2] mr-2" />
                    SEI
                </div>
            </div>
            {
              editing !== "collateral" && collateral.eq(0) &&
              <span className="flex flex-row justify-end text-[#F45348] text-lg mt-1 italic">*Please enter a value</span>
            }
        </div>
        <div className="mb-[28px]">
            <div className="text-lg font-medium">Calculate Debt</div>
            <div className="flex flex-row items-center text-lg font-medium justify-between">
                <div className="flex flex-row gap-2">
                  <span className={`${custom?"opacity-30": "opacity-100"} cursor-pointer`} onClick={() => setCustom(!custom)}>Auto</span>
                  <span className={`${custom?"opacity-100": "opacity-30"} cursor-pointer`} onClick={() => setCustom(!custom)}>Custom</span>
                </div>
                <div className={`flex flex-row justify-between border ${custom?"border-[#BDFAE2]":"border-transparent"} rounded-md p-[14px]`}>
                    <input 
                        className="bg-transparent text-lg outline-none w-[100px]"
                        value={collateralRatio?.mul(100).prettify(1)}
                        disabled={custom?false:true}
                        onChange={(e) => onCollateralRatioChange(e)}
                    />
                    <div className="text-lg font-medium">%</div>
                </div>
                
            </div>
        </div>

        {/* <EditableRow
          label="Borrow"
          inputId="trove-borrow-amount"
          amount={borrowAmount.prettify()}
          unit={COIN}
          editingState={editingState}
          editedAmount={borrowAmount.toString(2)}
          setEditedAmount={(amount: string) => setBorrowAmount(Decimal.from(amount))}
        /> */}
        <div className="mb-[28px]">
            <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
                SAI to be minted
            </div>
            <div className={`flex flex-row items-center justify-between border ${editing !== "netdebt" && borrowAmount.eq(0) ? "border-[#F45348]" : "border-[#BDFAE2]"} rounded-md p-[14px]`}>
                <input 
                    className="bg-transparent text-lg w-full outline-none"
                    onChange={(e) => onBorrowingAmountChange(e)}
                    value={borrowAmount.toString(2)}
                    onBlur={() => setEditing(undefined)}
                    onClick={() => setEditing("netdebt")}
                />
                <div className="flex flex-row items-center font-medium text-lg">
                    <span className="w-4 h-4 rounded-full bg-[#BDFAE2] mr-2" />
                    SAI
                </div>
            </div>
            {
              editing !== "netdebt" && borrowAmount.eq(0) &&
              <span className="flex flex-row justify-end text-[#F45348] text-lg mt-1 italic">*Please enter a value</span>
            }
        </div>
        <div className="mb-[28px]">
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>+ Net debt</div>
                <div>{`${borrowAmount}`} SAI</div>
            </div>
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>+ Mint fee</div>
                <div>{`${fee}`} SAI</div>
            </div>
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>+ Liquidation reserve</div>
                <div>{`${LUSD_LIQUIDATION_RESERVE}`} SAI</div>
            </div>
            <div className="my-[14px] h-0 w-full border-t border-[#BDFAE2]" />
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>Total debt</div>
                <div>{totalDebt.prettify(2)} SAI</div>
            </div>
        </div>

        {/* <StaticRow
          label="Liquidation Reserve"
          inputId="trove-liquidation-reserve"
          amount={`${LUSD_LIQUIDATION_RESERVE}`}
          unit={COIN}
          infoIcon={
            <InfoIcon
              tooltip={
                <Card variant="tooltip" sx={{ width: "200px" }}>
                  An amount set aside to cover the liquidator’s gas costs if your Trove needs to be
                  liquidated. The amount increases your debt and is refunded if you close your Trove
                  by fully paying off its net debt.
                </Card>
              }
            />
          }
        />

        <StaticRow
          label="Borrowing Fee"
          inputId="trove-borrowing-fee"
          amount={fee.prettify(2)}
          pendingAmount={feePct.toString(2)}
          unit={COIN}
          infoIcon={
            <InfoIcon
              tooltip={
                <Card variant="tooltip" sx={{ width: "240px" }}>
                  This amount is deducted from the borrowed amount as a one-time fee. There are no
                  recurring fees for borrowing, which is thus interest-free.
                </Card>
              }
            />
          }
        /> */}

        {/* <StaticRow
          label="Total debt"
          inputId="trove-total-debt"
          amount={totalDebt.prettify(2)}
          unit={COIN}
          infoIcon={
            <InfoIcon
              tooltip={
                <Card variant="tooltip" sx={{ width: "240px" }}>
                  The total amount of LUSD your Trove will hold.{" "}
                  {isDirty && (
                    <>
                      You will need to repay {totalDebt.sub(LUSD_LIQUIDATION_RESERVE).prettify(2)}{" "}
                      LUSD to reclaim your collateral ({LUSD_LIQUIDATION_RESERVE.toString()} LUSD
                      Liquidation Reserve excluded).
                    </>
                  )}
                </Card>
              }
            />
          }
        />

        <CollateralRatio value={collateralRatio} />

        {description ?? (
          <ActionDescription>
            Start by entering the amount of ETH you'd like to deposit as collateral.
          </ActionDescription>
        )}

        <ExpensiveTroveChangeWarning
          troveChange={stableTroveChange}
          maxBorrowingRate={maxBorrowingRate}
          borrowingFeeDecayToleranceMinutes={60}
          gasEstimationState={gasEstimationState}
          setGasEstimationState={setGasEstimationState}
        /> */}

        <Flex variant="layout.actions">
          {/* <Button variant="cancel" onClick={handleCancelPressed}>
            Cancel
          </Button> */}

          {gasEstimationState.type === "inProgress" ? (
            <Button disabled>
              <Spinner size="24px" sx={{ color: "background" }} />
            </Button>
          ) : stableTroveChange ? (
            <TroveAction
              transactionId={TRANSACTION_ID}
              change={stableTroveChange}
              maxBorrowingRate={maxBorrowingRate}
              borrowingFeeDecayToleranceMinutes={60}
            >
              Complete transaction
            </TroveAction>
          ) : (
            <Button sx={{width: "100%"}} disabled>Complete transaction</Button>
          )}
        </Flex>
      </Box>
      {isTransactionPending && <LoadingOverlay />}
    </div>
  );
};
