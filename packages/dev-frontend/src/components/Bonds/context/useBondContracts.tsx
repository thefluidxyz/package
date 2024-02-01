import { Decimal } from "@fluid/lib-base";
import {
  BSAILPZap,
  BSAILPZap__factory,
  BSAIToken,
  BondNFT,
  ChickenBondManager,
  ERC20Faucet,
  ERC20Faucet__factory
} from "@fluid/chicken-bonds/sai/types";
import {
  CurveCryptoSwap2ETH,
  CurveLiquidityGaugeV5__factory
} from "@fluid/chicken-bonds/sai/types/external";
import { CurveCryptoSwap2ETH__factory } from "@fluid/chicken-bonds/sai/types/external";
import {
  BSAIToken__factory,
  BondNFT__factory,
  ChickenBondManager__factory
} from "@fluid/chicken-bonds/sai/types";
import type { SAIToken } from "@fluid/lib-ethers/dist/types";
import SAITokenAbi from "@fluid/lib-ethers/abi/SAIToken.json";
import { useContract } from "../../../hooks/useContract";
import { useFluid } from "../../../hooks/FluidContext";
import { useCallback } from "react";
import type { BondsApi } from "./api";
import type { BSaiLpRewards, Bond, ProtocolInfo, Stats } from "./transitions";
import { BSaiAmmTokenIndex } from "./transitions";
import type { Addresses } from "./transitions";
import { useChainId } from "wagmi";
import { useBondAddresses } from "./BondAddressesContext";
import type { CurveLiquidityGaugeV5 } from "@fluid/chicken-bonds/sai/types/external/CurveLiquidityGaugeV5";

type BondsInformation = {
  protocolInfo: ProtocolInfo;
  bonds: Bond[];
  stats: Stats;
  bSaiBalance: Decimal;
  saiBalance: Decimal;
  lpTokenBalance: Decimal;
  stakedLpTokenBalance: Decimal;
  lpTokenSupply: Decimal;
  bSaiAmmBSaiBalance: Decimal;
  bSaiAmmSaiBalance: Decimal;
  lpRewards: BSaiLpRewards;
};

type BondContracts = {
  addresses: Addresses;
  saiToken: SAIToken | undefined;
  bSaiToken: BSAIToken | undefined;
  bondNft: BondNFT | undefined;
  chickenBondManager: ChickenBondManager | undefined;
  bSaiAmm: CurveCryptoSwap2ETH | undefined;
  bSaiAmmZapper: BSAILPZap | undefined;
  bSaiGauge: CurveLiquidityGaugeV5 | undefined;
  hasFoundContracts: boolean;
  getLatestData: (account: string, api: BondsApi) => Promise<BondsInformation | undefined>;
};

export const useBondContracts = (): BondContracts => {
  const { fluid } = useFluid();
  const chainId = useChainId();
  const isMainnet = chainId === 1;

  const addresses = useBondAddresses();

  const {
    BSAI_AMM_ADDRESS,
    BSAI_TOKEN_ADDRESS,
    BOND_NFT_ADDRESS,
    CHICKEN_BOND_MANAGER_ADDRESS,
    SAI_OVERRIDE_ADDRESS,
    BSAI_LP_ZAP_ADDRESS,
    BSAI_AMM_STAKING_ADDRESS
  } = addresses;

  const [saiTokenDefault, saiTokenDefaultStatus] = useContract<SAIToken>(
    fluid.connection.addresses.saiToken,
    SAITokenAbi
  );

  const [saiTokenOverride, saiTokenOverrideStatus] = useContract<ERC20Faucet>(
    SAI_OVERRIDE_ADDRESS,
    ERC20Faucet__factory.abi
  );

  const [saiToken, saiTokenStatus] =
    SAI_OVERRIDE_ADDRESS === null
      ? [saiTokenDefault, saiTokenDefaultStatus]
      : [(saiTokenOverride as unknown) as SAIToken, saiTokenOverrideStatus];

  const [bSaiToken, bSaiTokenStatus] = useContract<BSAIToken>(
    BSAI_TOKEN_ADDRESS,
    BSAIToken__factory.abi
  );

  const [bondNft, bondNftStatus] = useContract<BondNFT>(BOND_NFT_ADDRESS, BondNFT__factory.abi);
  const [chickenBondManager, chickenBondManagerStatus] = useContract<ChickenBondManager>(
    CHICKEN_BOND_MANAGER_ADDRESS,
    ChickenBondManager__factory.abi
  );

  const [bSaiAmm, bSaiAmmStatus] = useContract<CurveCryptoSwap2ETH>(
    BSAI_AMM_ADDRESS,
    CurveCryptoSwap2ETH__factory.abi
  );

  const [bSaiAmmZapper, bSaiAmmZapperStatus] = useContract<BSAILPZap>(
    BSAI_LP_ZAP_ADDRESS,
    BSAILPZap__factory.abi
  );

  const [bSaiGauge, bSaiGaugeStatus] = useContract<CurveLiquidityGaugeV5>(
    BSAI_AMM_STAKING_ADDRESS,
    CurveLiquidityGaugeV5__factory.abi
  );

  const hasFoundContracts =
    [
      saiTokenStatus,
      bondNftStatus,
      chickenBondManagerStatus,
      bSaiTokenStatus,
      bSaiAmmStatus,
      ...(isMainnet ? [bSaiAmmZapperStatus] : []),
      bSaiGaugeStatus
    ].find(status => status === "FAILED") === undefined;

  const getLatestData = useCallback(
    async (account: string, api: BondsApi): Promise<BondsInformation | undefined> => {
      if (
        saiToken === undefined ||
        bondNft === undefined ||
        chickenBondManager === undefined ||
        bSaiToken === undefined ||
        bSaiAmm === undefined ||
        bSaiGauge === undefined
      ) {
        return undefined;
      }

      const protocolInfoPromise = api.getProtocolInfo(
        bSaiToken,
        bSaiAmm,
        chickenBondManager,
        isMainnet
      );

      const bondsPromise = api.getAccountBonds(
        account,
        bondNft,
        chickenBondManager,
        await protocolInfoPromise
      );

      const [protocolInfo, stats, lpToken] = await Promise.all([
        protocolInfoPromise,
        api.getStats(chickenBondManager),
        api.getLpToken(bSaiAmm)
      ]);

      const [
        bSaiBalance,
        saiBalance,
        lpTokenBalance,
        stakedLpTokenBalance,
        lpTokenSupply,
        bSaiAmmCoinBalances,
        lpRewards
      ] = await Promise.all([
        api.getTokenBalance(account, bSaiToken),
        api.getTokenBalance(account, saiToken),
        api.getTokenBalance(account, lpToken),
        isMainnet ? api.getTokenBalance(account, bSaiGauge) : Decimal.ZERO,
        api.getTokenTotalSupply(lpToken),
        api.getCoinBalances(bSaiAmm),
        isMainnet ? api.getLpRewards(account, bSaiGauge) : []
      ]);

      const bonds = await bondsPromise;

      return {
        protocolInfo,
        bonds,
        stats,
        bSaiBalance,
        saiBalance,
        lpTokenBalance,
        stakedLpTokenBalance,
        lpTokenSupply,
        bSaiAmmBSaiBalance: bSaiAmmCoinBalances[BSaiAmmTokenIndex.BSAI],
        bSaiAmmSaiBalance: bSaiAmmCoinBalances[BSaiAmmTokenIndex.SAI],
        lpRewards
      };
    },
    [chickenBondManager, bondNft, bSaiToken, saiToken, bSaiAmm, isMainnet, bSaiGauge]
  );

  return {
    addresses,
    saiToken,
    bSaiToken,
    bondNft,
    chickenBondManager,
    bSaiAmm,
    bSaiAmmZapper,
    bSaiGauge,
    getLatestData,
    hasFoundContracts
  };
};
