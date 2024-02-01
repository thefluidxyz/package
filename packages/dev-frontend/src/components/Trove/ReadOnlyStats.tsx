import React from "react";
// import { Card, Heading, Box, Flex, Button, Grid } from "theme-ui";
import { useLiquitySelector } from "@fluid/lib-react";
import { FluidStoreState } from "@fluid/lib-base";
import { DisabledEditableRow } from "./Editor";
// import { useTroveView } from "./context/TroveViewContext";
// import { Icon } from "../Icon";
// import { COIN } from "../../strings";
// import { CollateralRatio } from "./CollateralRatio";

import { Percent, Decimal } from "@fluid/lib-base";
// import { AddressZero } from "@ethersproject/constants";
// import { useFluid } from "../../hooks/FluidContext";

// const select = ({ trove, price }: FluidStoreState) => ({ trove, price });

const select = ({
    trove,
    numberOfTroves,
    price,
    total,
    saiInStabilityPool,
    borrowingRate,
    redemptionRate,
    totalStakedFLO,
    frontend
  }: FluidStoreState) => ({
    trove,
    numberOfTroves,
    price,
    total,
    saiInStabilityPool,
    borrowingRate,
    redemptionRate,
    totalStakedFLO,
    kickbackRate: frontend.status === "registered" ? frontend.kickbackRate : null
  });

export const ReadOnlyStats: React.FC = () => {
    // const {
    //     fluid: {
    //         connection: { version: contractsVersion, deploymentDate, frontendTag }
    //     }
    // } = useFluid();

//   const { trove, price } = useLiquitySelector(select);
  const {
    // trove,
    // numberOfTroves,
    price,
    saiInStabilityPool,
    total,
    borrowingRate,
    // totalStakedFLO,
    // kickbackRate
  } = useLiquitySelector(select);

  // const saiInStabilityPoolPct =
  //   total.debt.nonZero && new Percent(saiInStabilityPool.div(total.debt));
  // const totalCollateralRatioPct = new Percent(total.collateralRatio(price));
  const borrowingFeePct = new Percent(borrowingRate);
  // const kickbackRatePct = frontendTag === AddressZero ? "100" : kickbackRate?.mul(100).prettify();

  return (
    <div className="mt-7 sm:mt-8">
      <div className="text-[32px] font-semibold p-0 sm:pl-4 sm:pr-2 py-2">Stats</div>
      <div className="px-0 py-4 sm:p-4">
        {/* <Box> */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <DisabledEditableRow
            label="SEI TVL"
            inputId="trove-tvl"
            amount={"$" + Decimal.from(total.collateral.mul(price)).shorten()}
            unit=""
          />
          <DisabledEditableRow
            label="Minted SAI"
            inputId="trove-minted-sai"
            amount={total.debt.shorten() + " / " + saiInStabilityPool.shorten()}
            unit=""
          />
          <DisabledEditableRow
            label="Mint fee"
            inputId="trove-ratio"
            amount={borrowingFeePct.toString(2)}
            unit=""
          />
          {/* <DisabledEditableRow
            label="Staked SEI APR"
            inputId="trove-price"
            amount={trove.collateral.prettify(4)}
            unit="ETH"
          /> */}
          <DisabledEditableRow
            label="Borrow Interest rate"
            inputId="trove-price"
            amount={"0%"}
            unit=""
          />
          <DisabledEditableRow
            label="Minimum Collateral Ratio"
            inputId="trove-price"
            amount={"110%"}
            unit=""
          />
        </div>
      </div>
    </div>
  );
};
