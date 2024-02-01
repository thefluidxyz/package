import React from "react";
import { Grid } from "theme-ui";
import { useLiquitySelector } from "@fluid/lib-react";
import { FluidStoreState } from "@fluid/lib-base";
import { DisabledEditableRow } from "./Editor";
// import { useTroveView } from "./context/TroveViewContext";
// import { Icon } from "../Icon";
import { COIN } from "../../strings";
// import { CollateralRatio } from "./CollateralRatio";

// import { Percent } from "@fluid/lib-base";

const select = ({ trove, price }: FluidStoreState) => ({ trove, price });

export const ReadOnlyTrove: React.FC = () => {
  // const { dispatchEvent } = useTroveView();
  // const handleAdjustTrove = useCallback(() => {
  //   dispatchEvent("ADJUST_TROVE_PRESSED");
  // }, [dispatchEvent]);
  // const handleCloseTrove = useCallback(() => {
  //   dispatchEvent("CLOSE_TROVE_PRESSED");
  // }, [dispatchEvent]);

  const { trove, price } = useLiquitySelector(select);

  const liquidationPrice = trove.collateral.eq(0) ? price : trove.debt.mulDiv(1.1, trove.collateral)

  return (
    <div className="mt-7 sm:mt-8">
      <div className="text-[32px] font-semibold p-0 sm:pl-4 sm:pr-2 py-2">Borrowing</div>
      <div className="px-0 py-4 sm:p-4">
        {/* <Box> */}
        <Grid gap={2} columns={[2, '1fr 2fr']}>
          <DisabledEditableRow
            label="Net Asset Value"
            inputId="trove-collateral"
            amount={"$" + trove.collateral.mul(price).prettify(4)}
            unit=""
          />
          <DisabledEditableRow
            label="Amount Borrowed"
            inputId="trove-debt"
            amount={trove.debt.prettify()}
            unit={COIN}
          />
          <DisabledEditableRow
            label="Collateral Health"
            inputId="trove-ratio"
            amount={(trove.collateralRatio(price).mul(100)).prettify(1)}
            unit="%"
          />
          <DisabledEditableRow
            label="Liquidation Price"
            inputId="trove-price"
            amount={"$" + liquidationPrice.prettify(4)}
            unit=""
          />
        </Grid>
          {/* <DisabledEditableRow
            label="Collateral"
            inputId="trove-collateral"
            amount={trove.collateral.prettify(4)}
            unit="ETH"
          />

          <DisabledEditableRow
            label="Debt"
            inputId="trove-debt"
            amount={trove.debt.prettify()}
            unit={COIN}
          /> */}

          {/* <CollateralRatio value={trove.collateralRatio(price)} /> */}
        {/* </Box> */}

        {/* <Flex variant="layout.actions">
          <Button variant="outline" onClick={handleCloseTrove}>
            Close Trove
          </Button>
          <Button onClick={handleAdjustTrove}>
            <Icon name="pen" size="sm" />
            &nbsp;Adjust
          </Button>
        </Flex> */}
      </div>
    </div>
  );
};
