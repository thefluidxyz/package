import React, { useEffect, useState } from "react";
import { Card, Box, Heading, Flex, Button } from "theme-ui";
import { Empty } from "./Empty";
import { BondList } from "./BondList";
import { useBondView } from "../../context/BondViewContext";
import { BONDS } from "../../lexicon";
import { InfoIcon } from "../../../InfoIcon";
import { BSaiAmmTokenIndex, SwapPressedPayload } from "../../context/transitions";
import { useFluid } from "../../../../hooks/FluidContext";
import { useBondAddresses } from "../../context/BondAddressesContext";

export const Idle: React.FC = () => {
  const { fluid } = useFluid();
  const { SAI_OVERRIDE_ADDRESS } = useBondAddresses();

  const { dispatchEvent, bonds, getSaiFromFaucet, saiBalance, hasLoaded } = useBondView();
  const [chain, setChain] = useState<number>();

  useEffect(() => {
    (async () => {
      if (fluid.connection.signer === undefined || chain !== undefined) return;
      const chainId = await fluid.connection.signer.getChainId();
      setChain(chainId);
    })();
  }, [chain, fluid.connection.signer]);

  if (!hasLoaded) return null;

  const hasBonds = bonds !== undefined && bonds.length > 0;

  const showSaiFaucet = SAI_OVERRIDE_ADDRESS !== null && saiBalance?.eq(0);

  const handleManageLiquidityPressed = () => dispatchEvent("MANAGE_LIQUIDITY_PRESSED");

  const handleBuyBSaiPressed = () =>
    dispatchEvent("SWAP_PRESSED", { inputToken: BSaiAmmTokenIndex.SAI } as SwapPressedPayload);

  const handleSellBSaiPressed = () =>
    dispatchEvent("SWAP_PRESSED", { inputToken: BSaiAmmTokenIndex.BSAI } as SwapPressedPayload);

  return (
    <>
      <Flex variant="layout.actions" sx={{ mt: 4, mb: 3 }}>
        <Button variant="outline" onClick={handleManageLiquidityPressed}>
          Manage liquidity
        </Button>

        <Button variant="outline" onClick={handleBuyBSaiPressed}>
          Buy bSAI
        </Button>

        <Button variant="outline" onClick={handleSellBSaiPressed}>
          Sell bSAI
        </Button>

        {showSaiFaucet && (
          <Button variant={hasBonds ? "outline" : "primary"} onClick={() => getSaiFromFaucet()}>
            Get 10k SAI
          </Button>
        )}

        {hasBonds && (
          <Button variant="primary" onClick={() => dispatchEvent("CREATE_BOND_PRESSED")}>
            Create another bond
          </Button>
        )}
      </Flex>

      {!hasBonds && (
        <Card>
          <Heading>
            <Flex>
              {BONDS.term}
              <InfoIcon
                placement="left"
                size="xs"
                tooltip={<Card variant="tooltip">{BONDS.description}</Card>}
              />
            </Flex>
          </Heading>
          <Box sx={{ p: [2, 3] }}>
            <Empty />

            <Flex variant="layout.actions" mt={4}>
              <Button variant="primary" onClick={() => dispatchEvent("CREATE_BOND_PRESSED")}>
                Create bond
              </Button>
            </Flex>
          </Box>
        </Card>
      )}

      {hasBonds && <BondList />}
    </>
  );
};
