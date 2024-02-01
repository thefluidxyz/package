import React, { useEffect, useState } from "react";
import { Card, Paragraph, Text } from "theme-ui";
import { Decimal, FluidStoreState } from "@fluid/lib-base";
import { useLiquitySelector } from "@fluid/lib-react";
import { InfoIcon } from "../InfoIcon";
import { Badge } from "../Badge";
import { fetchFloPrice } from "./context/fetchFloPrice";

const selector = ({ saiInStabilityPool, remainingStabilityPoolFLOReward }: FluidStoreState) => ({
  saiInStabilityPool,
  remainingStabilityPoolFLOReward
});

const yearlyIssuanceFraction = 0.5;
const dailyIssuanceFraction = Decimal.from(1 - yearlyIssuanceFraction ** (1 / 365));
const dailyIssuancePercentage = dailyIssuanceFraction.mul(100);

export const Yield: React.FC = () => {
  const { saiInStabilityPool, remainingStabilityPoolFLOReward } = useLiquitySelector(selector);

  const [floPrice, setFloPrice] = useState<Decimal | undefined>(undefined);
  const hasZeroValue = remainingStabilityPoolFLOReward.isZero || saiInStabilityPool.isZero;

  useEffect(() => {
    (async () => {
      try {
        const { floPriceUSD } = await fetchFloPrice();
        setFloPrice(floPriceUSD);
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  if (hasZeroValue || floPrice === undefined) return null;

  const floIssuanceOneDay = remainingStabilityPoolFLOReward.mul(dailyIssuanceFraction);
  const floIssuanceOneDayInUSD = floIssuanceOneDay.mul(floPrice);
  const aprPercentage = floIssuanceOneDayInUSD.mulDiv(365 * 100, saiInStabilityPool);
  const remainingFloInUSD = remainingStabilityPoolFLOReward.mul(floPrice);

  if (aprPercentage.isZero) return null;

  return (
    <Badge>
      <Text>FLO APR {aprPercentage.toString(2)}%</Text>
      <InfoIcon
        tooltip={
          <Card variant="tooltip" sx={{ width: ["220px", "518px"] }}>
            <Paragraph>
              An <Text sx={{ fontWeight: "bold" }}>estimate</Text> of the FLO return on the SAI
              deposited to the Stability Pool over the next year, not including your ETH gains from
              liquidations.
            </Paragraph>
            <Paragraph sx={{ fontSize: "12px", fontFamily: "monospace", mt: 2 }}>
              ($FLO_REWARDS * DAILY_ISSUANCE% / DEPOSITED_SAI) * 365 * 100 ={" "}
              <Text sx={{ fontWeight: "bold" }}> APR</Text>
            </Paragraph>
            <Paragraph sx={{ fontSize: "12px", fontFamily: "monospace" }}>
              ($
              {remainingFloInUSD.shorten()} * {dailyIssuancePercentage.toString(4)}% / $
              {saiInStabilityPool.shorten()}) * 365 * 100 =
              <Text sx={{ fontWeight: "bold" }}> {aprPercentage.toString(2)}%</Text>
            </Paragraph>
          </Card>
        }
      ></InfoIcon>
    </Badge>
  );
};
