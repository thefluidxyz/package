import React, { useCallback, useEffect, useState } from "react";
import { Flex, Button, Box, Spinner, Text, Input } from "theme-ui";
import {
  FluidStoreState,
  Decimal,
  Trove,
  SAI_LIQUIDATION_RESERVE,
  SAI_MINIMUM_NET_DEBT,
} from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { useStableTroveChange } from "../../hooks/useStableTroveChange";
import { useMyTransactionState } from "../Transaction";
import { TroveAction } from "./TroveAction";
import { Icon } from "../Icon";
import { ExpensiveTroveChangeWarning, GasEstimationState } from "./ExpensiveTroveChangeWarning";
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
  const totalDebt = borrowAmount.add(SAI_LIQUIDATION_RESERVE).add(fee);
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
      setBorrowAmount(SAI_MINIMUM_NET_DEBT);
      setCollateralRatio(Decimal.from(collateral.mulDiv(price, SAI_MINIMUM_NET_DEBT.add(SAI_LIQUIDATION_RESERVE).add(fee))))
    }
  }, [collateral, borrowAmount]);

  const onCollateralRatioChange = (e: any) => {
    if (isNaN(Number(e.target.value))) return
    if (Number(e.target.value) <= 0) {
      setCollateralRatio(Decimal.from(1.11))
      setBorrowAmount(Decimal.from(collateral.mulDiv(price, Decimal.from(1.1)).sub(SAI_LIQUIDATION_RESERVE)))
      return
    }
    setCollateralRatio(Decimal.from(Number(e.target.value)/100))
    setBorrowAmount(Decimal.from(collateral.mulDiv(price, Decimal.from(Number(e.target.value)/100)).sub(SAI_LIQUIDATION_RESERVE)))
  }

  const onBorrowingAmountChange = (e: any) => {
    setBorrowAmount(Decimal.from(e.target.value))
    setCollateralRatio(Decimal.from(collateral.mulDiv(price, Decimal.from(e.target.value).add(SAI_LIQUIDATION_RESERVE).add(fee))))
  }

  const onCollateralChange = (e: any) => {
    if (Number(e.target.value) === 0) {
      setCollateralRatio(Decimal.from(0))
      return
    }
    if (!collateral.isZero && Number(e.target.value) > 0) {
      setCollateralRatio(Decimal.from(e.target.value).mulDiv(price, borrowAmount.add(SAI_LIQUIDATION_RESERVE).add(fee)))
    }
    setCollateral(Decimal.from(e.target.value))
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
        <div className="mb-[28px]">
            <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
                <div>Collateral</div>
                <div className="flex flex-row">
                    <div>Balance</div>
                    <div className="ml-2 font-normal">{`${accountBalance}`} SEI</div>
                </div>
            </div>
            <div 
              className={`flex flex-row items-center justify-between border ${editing !== "collateral" && collateral.eq(0) ? "border-[#F45348]" : "border-[#BDFAE2]"} rounded-md p-[14px]`}
              onClick={() => setEditing("collateral")}
            >
                {/* <input 
                    className="bg-transparent text-lg w-full outline-none"
                    value={collateral.toString(4)}
                    onChange={(e) => onCollateralChange(e)}
                    onBlur={() => setEditing(undefined)}
                    onClick={() => setEditing("collateral")}
                /> */}
                {
                  editing === "collateral" ? (
                    <Input
                      autoFocus
                      id="trove-collateral"
                      type="number"
                      step="any"
                      defaultValue={collateral.toString(4)}
                      onChange={e => onCollateralChange(e)}
                      
                      onBlur={() => {setEditing(undefined)}}
                      variant="editor"
                      sx={{
                        backgroundColor: "transparent",
                        fontSize: "18px",
                        fontWeight: "medium",
                        width: "100%",
                        outline: "2px solid transparent",
                        outlineOffset: "2px",
                        borderColor: "transparent",
                        padding: 0,
                        marginRight: "4px"
                      }}
                    />
                  ):(
                    <div>{collateral.prettify(4)}</div>
                  )
                }
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
                        value={collateralRatio?.mul(100).toString(1)}
                        disabled={custom?false:true}
                        onChange={(e) => onCollateralRatioChange(e)}
                    />
                    <div className="text-lg font-medium">%</div>
                </div>
                
            </div>
        </div>
        <div className="mb-[28px]">
            <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
                SAI to be minted
            </div>
            <div 
              className={`flex flex-row items-center justify-between border ${editing !== "netdebt" && borrowAmount.eq(0) ? "border-[#F45348]" : "border-[#BDFAE2]"} rounded-md p-[14px]`}
              onClick={() => setEditing("netdebt")}
            >
                {/* <input 
                    className="bg-transparent text-lg w-full outline-none"
                    onChange={(e) => onBorrowingAmountChange(e)}
                    value={borrowAmount.toString(2)}
                    onBlur={() => setEditing(undefined)}
                    onClick={() => setEditing("netdebt")}
                /> */}
                {
                  editing === "netdebt" ? (
                    <Input
                      autoFocus
                      id="trove-collateral"
                      type="number"
                      step="any"
                      defaultValue={borrowAmount.toString(4)}
                      onChange={e => onBorrowingAmountChange(e)}
                      onBlur={() => {setEditing(undefined)}}
                      variant="editor"
                      sx={{
                        backgroundColor: "transparent",
                        fontSize: "18px",
                        fontWeight: "medium",
                        width: "100%",
                        outline: "2px solid transparent",
                        outlineOffset: "2px",
                        borderColor: "transparent",
                        padding: 0,
                        marginRight: "4px"
                      }}
                    />
                  ):(
                    <div>{borrowAmount.prettify(4)}</div>
                  )
                }
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
                <div>{`${SAI_LIQUIDATION_RESERVE}`} SAI</div>
            </div>
            <div className="my-[14px] h-0 w-full border-t border-[#BDFAE2]" />
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>Total debt</div>
                <div>{totalDebt.prettify(2)} SAI</div>
            </div>
        </div>

        <ExpensiveTroveChangeWarning
          troveChange={stableTroveChange}
          maxBorrowingRate={maxBorrowingRate}
          borrowingFeeDecayToleranceMinutes={60}
          gasEstimationState={gasEstimationState}
          setGasEstimationState={setGasEstimationState}
        />

        {description ?? <div />}

        <Flex variant="layout.actions">
          {
            !isTransactionPending ? (
            gasEstimationState.type === "inProgress" ? (
              <Button sx={{width: "100%"}} disabled>
                <Spinner size="24px" sx={{ color: "background" }} />
              </Button>
            ) : stableTroveChange ? (
              <TroveAction
                transactionId={TRANSACTION_ID}
                change={stableTroveChange}
                maxBorrowingRate={maxBorrowingRate.mul(2)}
                borrowingFeeDecayToleranceMinutes={60}
              >
                Complete transaction
              </TroveAction>
            ) : (
              <Button sx={{width: "100%"}} disabled>Complete transaction</Button>
            )) : (<Button sx={{width: "100%"}} disabled>Transaction in progress</Button>)
          }
        </Flex>
      </Box>
    </div>
  );
};
