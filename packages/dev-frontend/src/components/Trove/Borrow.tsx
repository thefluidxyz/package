import React, { useCallback, useEffect, useState, useRef } from "react";
import { Flex, Button, Text } from "theme-ui";
import {
  FluidStoreState,
  Decimal,
  Trove,
  SAI_LIQUIDATION_RESERVE,
  // Difference
} from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { useStableTroveChange } from "../../hooks/useStableTroveChange";
import { useMyTransactionState } from "../Transaction";
import { TroveAction } from "./TroveAction";
import { useTroveView } from "./context/TroveViewContext";
import { Icon } from "../Icon";
import { ExpensiveTroveChangeWarning, GasEstimationState } from "./ExpensiveTroveChangeWarning";
import {
  selectForTroveChangeValidation,
  validateTroveChange
} from "./validation/validateTroveChange";

const selector = (state: FluidStoreState) => {
  const { trove, fees, price, accountBalance } = state;
  return {
    trove,
    fees,
    price,
    accountBalance,
    validationContext: selectForTroveChangeValidation(state)
  };
};

const TRANSACTION_ID = "trove-creation";
const GAS_ROOM_ETH = Decimal.from(0.1);

const feeFrom = (original: Trove, edited: Trove, borrowingRate: Decimal): Decimal => {
  const change = original.whatChanged(edited, borrowingRate);

  if (change && change.type !== "invalidCreation" && change.params.borrowSAI) {
    return change.params.borrowSAI.mul(borrowingRate);
  } else {
    return Decimal.ZERO;
  }
};

// const applyUnsavedCollateralChanges = (unsavedChanges: Difference, trove: Trove) => {
//   if (unsavedChanges.absoluteValue) {
//     if (unsavedChanges.positive) {
//       return trove.collateral.add(unsavedChanges.absoluteValue);
//     }
//     if (unsavedChanges.negative) {
//       if (unsavedChanges.absoluteValue.lt(trove.collateral)) {
//         return trove.collateral.sub(unsavedChanges.absoluteValue);
//       }
//     }
//     return trove.collateral;
//   }
//   return trove.collateral;
// };

// const applyUnsavedNetDebtChanges = (unsavedChanges: Difference, trove: Trove) => {
//   if (unsavedChanges.absoluteValue) {
//     if (unsavedChanges.positive) {
//       return trove.netDebt.add(unsavedChanges.absoluteValue);
//     }
//     if (unsavedChanges.negative) {
//       if (unsavedChanges.absoluteValue.lt(trove.netDebt)) {
//         return trove.netDebt.sub(unsavedChanges.absoluteValue);
//       }
//     }
//     return trove.netDebt;
//   }
//   return trove.netDebt;
// };

export const Borrow: React.FC = () => {
  const { dispatchEvent } = useTroveView();
  const { trove, fees, price, accountBalance, validationContext } = useLiquitySelector(selector);
  const [editing, setEditing] = useState<string>();
  const previousTrove = useRef<Trove>(trove);
  const [collateral, setCollateral] = useState<Decimal>(trove.collateral);
  const [netDebt, setNetDebt] = useState<Decimal>(trove.netDebt);
  const [custom, setCustom] = useState<Boolean>(false)

  const transactionState = useMyTransactionState(TRANSACTION_ID);
  const borrowingRate = fees.borrowingRate();

  useEffect(() => {
    if (transactionState.type === "confirmedOneShot") {
      dispatchEvent("TROVE_ADJUSTED");
    }
  }, [transactionState.type, dispatchEvent]);

  useEffect(() => {
    // if (!previousTrove.current.collateral.eq(trove.collateral)) {
      // const unsavedChanges = Difference.between(collateral, previousTrove.current.collateral);
      // const nextCollateral = applyUnsavedCollateralChanges(unsavedChanges, trove);
      // setCollateral(nextCollateral);
    // }
    // if (!previousTrove.current.netDebt.eq(trove.netDebt)) {
      // const unsavedChanges = Difference.between(netDebt, previousTrove.current.netDebt);
      // const nextNetDebt = applyUnsavedNetDebtChanges(unsavedChanges, trove);
      // setNetDebt(nextNetDebt);
    // }
    previousTrove.current = trove;
  }, [trove, collateral, netDebt]);

  const reset = useCallback(() => {
    setCollateral(trove.collateral);
    setNetDebt(trove.netDebt);
  }, [trove.collateral, trove.netDebt]);

  const isDirty = !collateral.eq(trove.collateral) || !netDebt.eq(trove.netDebt);
  const isDebtIncrease = netDebt.gt(trove.netDebt);
  const debtIncreaseAmount = isDebtIncrease ? netDebt.sub(trove.netDebt) : Decimal.ZERO;

  const fee = isDebtIncrease
    ? feeFrom(trove, new Trove(trove.collateral, trove.debt.add(debtIncreaseAmount)), borrowingRate)
    : Decimal.ZERO;
  const totalDebt = netDebt.add(SAI_LIQUIDATION_RESERVE).add(fee);
  const maxBorrowingRate = borrowingRate.add(0.005);
  const updatedTrove = isDirty ? new Trove(collateral, totalDebt) : trove;
  const availableEth = accountBalance.gt(GAS_ROOM_ETH)
    ? accountBalance.sub(GAS_ROOM_ETH)
    : Decimal.ZERO;
  const [collateralRatio, setCollateralRatio] = useState (!collateral.isZero && !netDebt.isZero ? updatedTrove.collateralRatio(price) : undefined)

  const [troveChange, description] = validateTroveChange(
    trove,
    updatedTrove,
    borrowingRate,
    validationContext
  );

  const stableTroveChange = useStableTroveChange(troveChange);
  const [gasEstimationState, setGasEstimationState] = useState<GasEstimationState>({ type: "idle" });

  const isTransactionPending =
    transactionState.type === "waitingForApproval" ||
    transactionState.type === "waitingForConfirmation";

  if (trove.status !== "open") {
    return null;
  }

  const onCollateralRatioChange = (e: any) => {
    if (isNaN(Number(e.target.value))) return
    setCollateralRatio(Decimal.from(Number(e.target.value)/100))
    setNetDebt(Decimal.from(collateral.mulDiv(price, Decimal.from(Number(e.target.value)/100)).sub(SAI_LIQUIDATION_RESERVE)))
  }

  const onNetDebtChange = (e: any) => {
    setNetDebt(Decimal.from(e.target.value))
    setCollateralRatio(Decimal.from(collateral.mulDiv(price, Decimal.from(e.target.value).add(SAI_LIQUIDATION_RESERVE).add(fee))))
  }

  const onCollateralChange = (e: any) => {
    if (Number(e.target.value) === 0) {
      setCollateralRatio(Decimal.from(0))
      return
    }
    if (!collateral.isZero && Number(e.target.value) > 0) {
      setCollateralRatio(Decimal.from(e.target.value).mulDiv(price, netDebt.add(SAI_LIQUIDATION_RESERVE).add(fee)))
    }
    setCollateral(Decimal.from(e.target.value))
  }

  const handleRedeemTrove = useCallback(() => {
    dispatchEvent("CLOSE_TROVE_PRESSED");
  }, [dispatchEvent]);

  return (
    <div className="mt-7 lg:mt-8">
      <div className="flex flex-row justify-between text-[32px] font-semibold p-0 sm:pl-4 sm:pr-2 py-2">
        <div>Borrow &nbsp; <Text sx={{ opacity: 0.3 }}><span className="cursor-pointer" onClick={handleRedeemTrove}>Redeem</span></Text></div>
        {isDirty && !isTransactionPending && (
          <Button variant="titleIcon" sx={{ ":enabled:hover": { color: "danger" } }} onClick={reset}>
            <Icon name="history" size="lg" />
          </Button>
        )}
      </div>

      <div className="px-0 py-4 sm:p-4">
        <div className="mb-[28px]">
            <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
                <div>Collateral</div>
                <div className="flex flex-row">
                    <div>Balance</div>
                    <div className="ml-2 font-normal">{`${availableEth.prettify(4)}`} SEI</div>
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
            <div className={`flex flex-row items-center justify-between border ${editing !== "netdebt" && netDebt.eq(0) ? "border-[#F45348]" : "border-[#BDFAE2]"} rounded-md p-[14px]`}>
                <input 
                    className="bg-transparent text-lg w-full outline-none"
                    onChange={(e) => onNetDebtChange(e)}
                    value={netDebt.toString(4)}
                    onBlur={() => setEditing(undefined)}
                    onClick={() => setEditing("netdebt")}
                />
                <div className="flex flex-row items-center font-medium text-lg">
                    <span className="w-4 h-4 rounded-full bg-[#BDFAE2] mr-2" />
                    SAI
                </div>
            </div>
            {
              editing !== "netdebt" && netDebt.eq(0) &&
              <span className="flex flex-row justify-end text-[#F45348] text-lg mt-1 italic">*Please enter a value</span>
            }
        </div>
        <div className="mb-[28px]">
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>+ Net debt</div>
                <div>{`${netDebt}`} SAI</div>
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
            stableTroveChange ? (
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
            )): (<Button sx={{width: "100%"}} disabled>Transaction in progress</Button>)
          }
        </Flex>
      </div>
    </div>
  );
};
