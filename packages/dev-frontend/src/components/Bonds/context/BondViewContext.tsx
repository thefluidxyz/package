import { createContext, useContext } from "react";
import type {
  BondView,
  BondEvent,
  Payload,
  Bond,
  Stats,
  BondTransactionStatuses,
  ProtocolInfo,
  OptimisticBond,
  BSaiAmmTokenIndex,
  Addresses,
  BSaiLpRewards
} from "./transitions";
import { PENDING_STATUS, CANCELLED_STATUS, CLAIMED_STATUS } from "../lexicon";
import { Decimal } from "@fluid/lib-base";

export type BondViewContextType = {
  view: BondView;
  dispatchEvent: (event: BondEvent, payload?: Payload) => void;
  selectedBondId?: string;
  protocolInfo?: ProtocolInfo;
  stats?: Stats;
  bonds?: Bond[];
  selectedBond?: Bond;
  optimisticBond?: OptimisticBond;
  bSaiBalance?: Decimal;
  saiBalance?: Decimal;
  lpTokenBalance?: Decimal;
  stakedLpTokenBalance?: Decimal;
  lpTokenSupply?: Decimal;
  bSaiAmmBSaiBalance?: Decimal;
  bSaiAmmSaiBalance?: Decimal;
  statuses: BondTransactionStatuses;
  isInfiniteBondApproved: boolean;
  isSynchronizing: boolean;
  getSaiFromFaucet: () => Promise<void>;
  simulatedProtocolInfo?: ProtocolInfo;
  setSimulatedMarketPrice: (marketPrice: Decimal) => void;
  resetSimulatedMarketPrice: () => void;
  hasFoundContracts: boolean;
  isBSaiApprovedWithBsaiAmm: boolean;
  isSaiApprovedWithBsaiAmm: boolean;
  isSaiApprovedWithAmmZapper: boolean;
  isBSaiApprovedWithAmmZapper: boolean;
  isBSaiLpApprovedWithAmmZapper: boolean;
  isBSaiLpApprovedWithGauge: boolean;
  inputToken: BSaiAmmTokenIndex.BSAI | BSaiAmmTokenIndex.SAI;
  isInputTokenApprovedWithBSaiAmm: boolean;
  getExpectedSwapOutput: (inputToken: BSaiAmmTokenIndex, inputAmount: Decimal) => Promise<Decimal>;
  getExpectedLpTokens: (bSaiAmount: Decimal, saiAmount: Decimal) => Promise<Decimal>;
  getExpectedWithdrawal: (
    burnLp: Decimal,
    output: BSaiAmmTokenIndex | "both"
  ) => Promise<Map<BSaiAmmTokenIndex, Decimal>>;
  isBootstrapPeriodActive?: boolean;
  hasLoaded: boolean;
  addresses: Addresses;
  lpRewards: BSaiLpRewards | undefined;
};

export const BondViewContext = createContext<BondViewContextType | null>(null);

export const useBondView = (): BondViewContextType => {
  const context: BondViewContextType | null = useContext(BondViewContext);

  if (context === null) {
    throw new Error("You must add a <BondViewProvider> into the React tree");
  }

  return context;
};

export const statuses = {
  PENDING: PENDING_STATUS.term,
  CANCELLED: CANCELLED_STATUS.term,
  CLAIMED: CLAIMED_STATUS.term,
  NON_EXISTENT: "NON_EXISTENT"
};
