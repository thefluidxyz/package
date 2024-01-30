import React, { useCallback } from "react";
// import { Text, Box, Card } from "theme-ui";

import {
  // Percent,
  // Difference,
  Decimalish,
  Decimal,
  Trove,
  FluidStoreState,
  // LUSD_LIQUIDATION_RESERVE
} from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";
import { useTroveView } from "./context/TroveViewContext";

// import { COIN } from "../../strings";

// import { StaticRow } from "./Editor";
import { LoadingOverlay } from "../LoadingOverlay";
// import { CollateralRatio } from "./CollateralRatio";
// import { InfoIcon } from "../InfoIcon";

type TroveEditorProps = {
  original: Trove;
  edited: Trove;
  fee: Decimal;
  borrowingRate: Decimal;
  changePending: boolean;
  dispatch: (
    action: { type: "setCollateral" | "setDebt"; newValue: Decimalish } | { type: "revert" }
  ) => void;
};

const select = ({ trove, fees, price, accountBalance }: FluidStoreState) => ({ 
  trove,
  fees,
  price,
  accountBalance
 });
const GAS_ROOM_ETH = Decimal.from(0.1);

export const TroveEditor: React.FC<TroveEditorProps> = ({
  children,
  // original,
  // edited,
  // fee,
  // borrowingRate,
  changePending
}) => {
  const { dispatchEvent } = useTroveView();
  const { trove, accountBalance } = useLiquitySelector(select);

  // const feePct = new Percent(borrowingRate);

  // const originalCollateralRatio = !original.isEmpty ? original.collateralRatio(price) : undefined;
  // const collateralRatio = !edited.isEmpty ? edited.collateralRatio(price) : undefined;
  // const collateralRatioChange = Difference.between(collateralRatio, originalCollateralRatio);
  const availableEth = accountBalance.gt(GAS_ROOM_ETH)
    ? accountBalance.sub(GAS_ROOM_ETH)
    : Decimal.ZERO;

  const handleOpenTrove = useCallback(() => {
    dispatchEvent("TROVE_ADJUSTED");
  }, [dispatchEvent]);

  return (
    <div className="mt-7 lg:mt-8">
      <div className="flex flex-row justify-between text-[32px] font-semibold p-0 sm:pl-4 sm:pr-2 py-2">
        <div><span className="cursor-pointer opacity-[0.3]" onClick={handleOpenTrove}>Borrow</span> &nbsp; <span className="">Redeem</span></div>
      </div>

      <div className="px-0 py-4 sm:p-4">
        <div className="mb-[28px]">
          <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
              <div>Pay back</div>
              <div className="flex flex-row">
                  <div>Balance</div>
                  <div className="ml-2 font-normal">{`${availableEth.prettify(4)}`} SEI</div>
              </div>
          </div>
          <div className={`flex flex-row items-center justify-between border border-[#BDFAE2] rounded-md p-[14px]`}>
            <input 
                className="bg-transparent text-lg w-full outline-none"
                value={trove.collateral.toString(4)}
                disabled
            />
            <div className="flex flex-row items-center font-medium text-lg">
                <span className="w-4 h-4 rounded-full bg-[#BDFAE2] mr-2" />
                SEI
            </div>
          </div>
        </div>
        <div className="mb-[28px]">
          <div className="flex flex-row font-medium text-lg justify-between mb-[14px]">
              <div>SEI to be redeemed</div>
          </div>
          <div className={`flex flex-row items-center justify-between border border-[#BDFAE2] rounded-md p-[14px]`}>
            <input 
                className="bg-transparent text-lg w-full outline-none"
                value={trove.debt.toString(4)}
                disabled
            />
            <div className="flex flex-row items-center font-medium text-lg">
                <span className="w-4 h-4 rounded-full bg-[#BDFAE2] mr-2" />
                SAI
            </div>
          </div>
        </div>
        <div className="mb-[14px]">
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>+ Redeemption fee</div>
                <div>{`${0}`} SAI</div>
            </div>
            <div className="my-[14px] h-0 w-full border-t border-[#BDFAE2]" />
            <div className="flex flex-row justify-between text-lg font-normal mb-[14px]">
                <div>Total debt</div>
                <div>{(trove.collateral).prettify(2)} SAI</div>
            </div>
        </div>
      </div>
{/* 
      <Box sx={{ p: [2, 3] }}>
        <StaticRow
          label="Collateral"
          inputId="trove-collateral"
          amount={edited.collateral.prettify(4)}
          unit="ETH"
        />

        <StaticRow label="Debt" inputId="trove-debt" amount={edited.debt.prettify()} unit={COIN} />

        {original.isEmpty && (
          <StaticRow
            label="Liquidation Reserve"
            inputId="trove-liquidation-reserve"
            amount={`${LUSD_LIQUIDATION_RESERVE}`}
            unit={COIN}
            infoIcon={
              <InfoIcon
                tooltip={
                  <Card variant="tooltip" sx={{ width: "200px" }}>
                    An amount set aside to cover the liquidator’s gas costs if your Trove needs to be
                    liquidated. The amount increases your debt and is refunded if you close your
                    Trove by fully paying off its net debt.
                  </Card>
                }
              />
            }
          />
        )}

        <StaticRow
          label="Borrowing Fee"
          inputId="trove-borrowing-fee"
          amount={fee.toString(2)}
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
        />

        <CollateralRatio value={collateralRatio} change={collateralRatioChange} />

        {children}
      </Box> */}
      {children}
      {changePending && <LoadingOverlay />}
    </div>
  );
};
