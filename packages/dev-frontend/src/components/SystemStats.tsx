import React from "react";
import { Card, Heading, Link, Box, Text } from "theme-ui";
import { AddressZero } from "@ethersproject/constants";
import { Decimal, Percent, FluidStoreState } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";

import { useFluid } from "../hooks/FluidContext";
import { Statistic } from "./Statistic";
import * as l from "../lexicon";

const selectBalances = ({ accountBalance, saiBalance, floBalance }: FluidStoreState) => ({
  accountBalance,
  saiBalance,
  floBalance
});

const Balances: React.FC = () => {
  const { accountBalance, saiBalance, floBalance } = useLiquitySelector(selectBalances);

  return (
    <Box sx={{ mb: 3 }}>
      <Heading>My Account Balances</Heading>
      <Statistic lexicon={l.ETH}>{accountBalance.prettify(4)}</Statistic>
      <Statistic lexicon={l.SAI}>{saiBalance.prettify()}</Statistic>
      <Statistic lexicon={l.FLO}>{floBalance.prettify()}</Statistic>
    </Box>
  );
};

const GitHubCommit: React.FC<{ children?: string }> = ({ children }) =>
  children?.match(/[0-9a-f]{40}/) ? (
    <Link href={`https://github.com/liquity/dev/commit/${children}`}>{children.substr(0, 7)}</Link>
  ) : (
    <>unknown</>
  );

type SystemStatsProps = {
  variant?: string;
  showBalances?: boolean;
};

const select = ({
  numberOfTroves,
  price,
  total,
  saiInStabilityPool,
  borrowingRate,
  redemptionRate,
  totalStakedFLO,
  frontend
}: FluidStoreState) => ({
  numberOfTroves,
  price,
  total,
  saiInStabilityPool,
  borrowingRate,
  redemptionRate,
  totalStakedFLO,
  kickbackRate: frontend.status === "registered" ? frontend.kickbackRate : null
});

export const SystemStats: React.FC<SystemStatsProps> = ({ variant = "info", showBalances }) => {
  const {
    fluid: {
      connection: { version: contractsVersion, deploymentDate, frontendTag }
    }
  } = useFluid();

  const {
    numberOfTroves,
    price,
    saiInStabilityPool,
    total,
    borrowingRate,
    totalStakedFLO,
    kickbackRate
  } = useLiquitySelector(select);

  const saiInStabilityPoolPct =
    total.debt.nonZero && new Percent(saiInStabilityPool.div(total.debt));
  const totalCollateralRatioPct = new Percent(total.collateralRatio(price));
  const borrowingFeePct = new Percent(borrowingRate);
  const kickbackRatePct = frontendTag === AddressZero ? "100" : kickbackRate?.mul(100).prettify();

  return (
    <Card {...{ variant }}>
      {showBalances && <Balances />}

      <Heading>Liquity statistics</Heading>

      <Heading as="h2" sx={{ mt: 3, fontWeight: "body" }}>
        Protocol
      </Heading>

      <Statistic lexicon={l.BORROW_FEE}>{borrowingFeePct.toString(2)}</Statistic>

      <Statistic lexicon={l.TVL}>
        {total.collateral.shorten()} <Text sx={{ fontSize: 1 }}>&nbsp;ETH</Text>
        <Text sx={{ fontSize: 1 }}>
          &nbsp;(${Decimal.from(total.collateral.mul(price)).shorten()})
        </Text>
      </Statistic>
      <Statistic lexicon={l.TROVES}>{Decimal.from(numberOfTroves).prettify(0)}</Statistic>
      <Statistic lexicon={l.SAI_SUPPLY}>{total.debt.shorten()}</Statistic>
      {saiInStabilityPoolPct && (
        <Statistic lexicon={l.STABILITY_POOL_SAI}>
          {saiInStabilityPool.shorten()}
          <Text sx={{ fontSize: 1 }}>&nbsp;({saiInStabilityPoolPct.toString(1)})</Text>
        </Statistic>
      )}
      <Statistic lexicon={l.STAKED_FLO}>{totalStakedFLO.shorten()}</Statistic>
      <Statistic lexicon={l.TCR}>{totalCollateralRatioPct.prettify()}</Statistic>
      <Statistic lexicon={l.RECOVERY_MODE}>
        {total.collateralRatioIsBelowCritical(price) ? <Box color="danger">Yes</Box> : "No"}
      </Statistic>
      {}

      <Heading as="h2" sx={{ mt: 3, fontWeight: "body" }}>
        Frontend
      </Heading>
      {kickbackRatePct && <Statistic lexicon={l.KICKBACK_RATE}>{kickbackRatePct}%</Statistic>}

      <Box sx={{ mt: 3, opacity: 0.66 }}>
        <Box sx={{ fontSize: 0 }}>
          Contracts version: <GitHubCommit>{contractsVersion}</GitHubCommit>
        </Box>
        <Box sx={{ fontSize: 0 }}>Deployed: {deploymentDate.toLocaleString()}</Box>
        <Box sx={{ fontSize: 0 }}>
          Frontend version:{" "}
          {import.meta.env.DEV ? (
            "development"
          ) : (
            <GitHubCommit>{import.meta.env.VITE_APP_VERSION}</GitHubCommit>
          )}
        </Box>
      </Box>
    </Card>
  );
};
