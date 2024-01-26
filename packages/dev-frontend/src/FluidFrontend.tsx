import React from "react";
// import { Flex, Container } from "theme-ui";
import { HashRouter as Router, Switch, Route } from "react-router-dom";
import { Wallet } from "@ethersproject/wallet";

import { Decimal, Difference, Trove } from "@fluid/lib-base";
import { LiquityStoreProvider } from "@fluid/lib-react";

import { useFluid } from "./hooks/FluidContext";
import { TransactionMonitor } from "./components/Transaction";
import { UserAccount } from "./components/UserAccount";
// import { SystemStatsPopup } from "./components/SystemStatsPopup";
// import { Header } from "./components/Header";
import { FluidLogo } from "./components/FluidLogo";

import { PageSwitcher } from "./pages/PageSwitcher";
import { Footer } from "./pages/Footer"
// import { RiskyTrovesPage } from "./pages/RiskyTrovesPage";
// import { Bonds } from "./pages/Bonds";

import { TroveViewProvider } from "./components/Trove/context/TroveViewProvider";
import { StabilityViewProvider } from "./components/Stability/context/StabilityViewProvider";
import { StakingViewProvider } from "./components/Staking/context/StakingViewProvider";
import "tippy.js/dist/tippy.css"; // Tooltip default style
import { BondsProvider } from "./components/Bonds/context/BondsProvider";

type FluidFrontendProps = {
  loader?: React.ReactNode;
};
export const FluidFrontend: React.FC<FluidFrontendProps> = ({ loader }) => {
  const { account, provider, fluid } = useFluid();

  // For console tinkering ;-)
  Object.assign(window, {
    account,
    provider,
    fluid,
    Trove,
    Decimal,
    Difference,
    Wallet
  });

  return (
    <LiquityStoreProvider 
      {...{ loader }} 
      // @ts-ignore
      store={fluid.store}>
      <Router>
        <TroveViewProvider>
          <StabilityViewProvider>
            <StakingViewProvider>
              <BondsProvider>
                <div className="flex flex-col min-h-full px-5 md:px-10 lg:px-[60px] pb-[166px]">
                  <div className="flex flex-row justify-between py-4 px-0 sm:px-4">
                    <FluidLogo />
                    <UserAccount />
                    {/* <SystemStatsPopup /> */}
                  </div>

                  {/* <Container
                    variant="main"
                    sx={{
                      display: "flex",
                      flexGrow: 1,
                      flexDirection: "column",
                      alignItems: "center"
                    }}
                  > */}
                    <Switch>
                      <Route path="/" exact>
                        <PageSwitcher />
                      </Route>
                      {/* <Route path="/bonds">
                        <Bonds />
                      </Route>
                      <Route path="/risky-troves">
                        <RiskyTrovesPage />
                      </Route> */}
                    </Switch>
                  {/* </Container> */}
                </div>
                <Footer />
              </BondsProvider>
            </StakingViewProvider>
          </StabilityViewProvider>
        </TroveViewProvider>
      </Router>
      <TransactionMonitor />
    </LiquityStoreProvider>
  );
};
