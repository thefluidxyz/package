// import { Box, Container, Flex } from "theme-ui";

// import { Trove } from "../components/Trove/Trove";
// import { Stability } from "../components/Stability/Stability";
// import { SystemStats } from "../components/SystemStats";
// import { PriceManager } from "../components/PriceManager";
// import { Staking } from "../components/Staking/Staking";
// import { BondsTable } from "../components/Bonds/BondsTable";
import {
  Decimal,
} from "@fluid/lib-base";
import { TroveManager } from "../components/Trove/TroveManager";
import { ReadOnlyTrove } from "../components/Trove/ReadOnlyTrove";
import { ReadOnlyStats } from "../components/Trove/ReadOnlyStats";
// import { NoTrove } from "../components/Trove/NoTrove";
import { Opening } from "../components/Trove/Opening";
import { Borrow } from "../components/Trove/Borrow";
// import { RedeemedTrove } from "../components/Trove/RedeemedTrove";
import { useTroveView } from "../components/Trove/context/TroveViewContext";
// import { LiquidatedTrove } from "../components/Trove/LiquidatedTrove";
// import { Decimal } from "@fluid/lib-base";

export const Dashboard: React.FC = props => {
  const { view } = useTroveView();

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 w-full gap-0 sm:gap-8 px-0 sm:px-[100px] lg:px-0">
        <div className="border-r-0 lg:border-r-[1px] border-[#BDFAE2] pr-0 md:pr-8">
          <ReadOnlyTrove {...props} />
          <div className="mx-1 sm:mx-4 sm:mr-0 lg:mr-[22px] h-0 border-b border-[#BDFAE2]"/>
          <ReadOnlyStats {...props} />
          <div className="block lg:hidden mx-1 sm:mx-4 sm:mr-0 lg:mr-[22px] h-0 border-b border-[#BDFAE2]"/>
        </div>
        <div>
          {
            (view === "ACTIVE" || view === "ADJUSTING") && <Borrow />
          }
          {
            (view === "OPENING" || view === "LIQUIDATED" || view === "NONE" || view === "REDEEMED") && <Opening />
          }
          {
            view === "CLOSING" && <TroveManager {...props} collateral={Decimal.ZERO} debt={Decimal.ZERO}  />
          }
        </div>
      </div>
    </>
  );
}
