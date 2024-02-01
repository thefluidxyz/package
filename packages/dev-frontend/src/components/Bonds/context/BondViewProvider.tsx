import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { BondViewContext, BondViewContextType } from "./BondViewContext";
import type {
  Stats,
  BondView,
  BondEvent,
  Payload,
  Bond,
  BondTransactionStatuses,
  CreateBondPayload,
  ProtocolInfo,
  OptimisticBond,
  SwapPayload,
  ApprovePressedPayload,
  ManageLiquidityPayload,
  BSaiLpRewards
} from "./transitions";
import { BSaiAmmTokenIndex } from "./transitions";
import { transitions } from "./transitions";
import { Decimal } from "@fluid/lib-base";
import { useFluid } from "../../../hooks/FluidContext";
import { api, _getProtocolInfo } from "./api";
import { useTransaction } from "../../../hooks/useTransaction";
import type { ERC20Faucet } from "@fluid/chicken-bonds/sai/types";
import { useBondContracts } from "./useBondContracts";
import { useChainId } from "wagmi";
import { useBondAddresses } from "./BondAddressesContext";

// Refresh backend values every 15 seconds
const SYNCHRONIZE_INTERVAL_MS = 15 * 1000;

const isValidEvent = (view: BondView, event: BondEvent): boolean => {
  return transitions[view][event] !== undefined;
};

const transition = (view: BondView, event: BondEvent): BondView => {
  const nextView = transitions[view][event] ?? view;
  return nextView;
};

export const EXAMPLE_NFT = "./bonds/egg-nft.png";

export const BondViewProvider: React.FC = props => {
  const { children } = props;
  const [view, setView] = useState<BondView>("IDLE");
  const viewRef = useRef<BondView>(view);
  const [selectedBondId, setSelectedBondId] = useState<string>();
  const [optimisticBond, setOptimisticBond] = useState<OptimisticBond>();
  const [shouldSynchronize, setShouldSynchronize] = useState<boolean>(true);
  const [bonds, setBonds] = useState<Bond[]>();
  const [stats, setStats] = useState<Stats>();
  const [protocolInfo, setProtocolInfo] = useState<ProtocolInfo>();
  const [simulatedProtocolInfo, setSimulatedProtocolInfo] = useState<ProtocolInfo>();
  const [isInfiniteBondApproved, setIsInfiniteBondApproved] = useState(false);
  const [lpRewards, setLpRewards] = useState<BSaiLpRewards>();
  const [isSaiApprovedWithBsaiAmm, setIsSaiApprovedWithBsaiAmm] = useState(false);
  const [isBSaiApprovedWithBsaiAmm, setIsBSaiApprovedWithBsaiAmm] = useState(false);
  const [isSaiApprovedWithAmmZapper, setIsSaiApprovedWithAmmZapper] = useState(false);
  const [isBSaiApprovedWithAmmZapper, setIsBSaiApprovedWithAmmZapper] = useState(false);
  const [isBSaiLpApprovedWithAmmZapper, setIsBSaiLpApprovedWithAmmZapper] = useState(false);
  const [isBSaiLpApprovedWithGauge, setIsBSaiLpApprovedWithGauge] = useState(false);
  const [isSynchronizing, setIsSynchronizing] = useState(false);
  const [inputToken, setInputToken] = useState<BSaiAmmTokenIndex.BSAI | BSaiAmmTokenIndex.SAI>(
    BSaiAmmTokenIndex.BSAI
  );
  const [statuses, setStatuses] = useState<BondTransactionStatuses>({
    APPROVE: "IDLE",
    CREATE: "IDLE",
    CANCEL: "IDLE",
    CLAIM: "IDLE",
    APPROVE_AMM: "IDLE",
    APPROVE_SPENDER: "IDLE",
    SWAP: "IDLE",
    MANAGE_LIQUIDITY: "IDLE"
  });
  const [bSaiBalance, setBSaiBalance] = useState<Decimal>();
  const [saiBalance, setSaiBalance] = useState<Decimal>();
  const [lpTokenBalance, setLpTokenBalance] = useState<Decimal>();
  const [stakedLpTokenBalance, setStakedLpTokenBalance] = useState<Decimal>();

  const [lpTokenSupply, setLpTokenSupply] = useState<Decimal>();
  const [bSaiAmmBSaiBalance, setBSaiAmmBSaiBalance] = useState<Decimal>();
  const [bSaiAmmSaiBalance, setBSaiAmmSaiBalance] = useState<Decimal>();
  const [isBootstrapPeriodActive, setIsBootstrapPeriodActive] = useState<boolean>();
  const { account, fluid } = useFluid();
  const {
    SAI_OVERRIDE_ADDRESS,
    BSAI_AMM_ADDRESS,
    BSAI_LP_ZAP_ADDRESS,
    BSAI_AMM_STAKING_ADDRESS
  } = useBondAddresses();
  const contracts = useBondContracts();
  const chainId = useChainId();
  const isMainnet = chainId === 1;

  const setSimulatedMarketPrice = useCallback(
    (marketPrice: Decimal) => {
      if (protocolInfo === undefined) return;
      const simulatedProtocolInfo = _getProtocolInfo(
        marketPrice,
        protocolInfo.floorPrice,
        protocolInfo.claimBondFee,
        protocolInfo.alphaAccrualFactor
      );

      setSimulatedProtocolInfo({
        ...protocolInfo,
        ...simulatedProtocolInfo,
        simulatedMarketPrice: marketPrice
      });
    },
    [protocolInfo]
  );

  const resetSimulatedMarketPrice = useCallback(() => {
    if (protocolInfo === undefined) return;

    setSimulatedProtocolInfo({ ...protocolInfo });
  }, [protocolInfo]);

  const removeBondFromList = useCallback(
    (bondId: string) => {
      if (bonds === undefined) return;
      const idx = bonds.findIndex(bond => bond.id === bondId);
      const nextBonds = bonds.slice(0, idx).concat(bonds.slice(idx + 1));
      setBonds(nextBonds);
    },
    [bonds]
  );

  const changeBondStatusToClaimed = useCallback(
    (bondId: string) => {
      if (bonds === undefined) return;
      const idx = bonds.findIndex(bond => bond.id === bondId);
      const updatedBond: Bond = { ...bonds[idx], status: "CLAIMED" };
      const nextBonds = bonds
        .slice(0, idx)
        .concat(updatedBond)
        .concat(bonds.slice(idx + 1));
      setBonds(nextBonds);
    },
    [bonds]
  );

  const getSaiFromFaucet = useCallback(async () => {
    if (contracts.saiToken === undefined || fluid.connection.signer === undefined) return;

    if (
      SAI_OVERRIDE_ADDRESS !== null &&
      (await contracts.saiToken.balanceOf(account)).eq(0) &&
      "tap" in contracts.saiToken
    ) {
      await (
        await ((contracts.saiToken as unknown) as ERC20Faucet)
          .connect(fluid.connection.signer)
          .tap()
      ).wait();
      setShouldSynchronize(true);
    }
  }, [contracts.saiToken, account, SAI_OVERRIDE_ADDRESS, fluid.connection.signer]);

  useEffect(() => {
    (async () => {
      if (
        contracts.saiToken === undefined ||
        contracts.chickenBondManager === undefined ||
        account === undefined ||
        isInfiniteBondApproved
      )
        return;
      const isApproved = await api.isInfiniteBondApproved(
        account,
        contracts.saiToken,
        contracts.chickenBondManager
      );
      setIsInfiniteBondApproved(isApproved);
    })();
  }, [contracts.saiToken, contracts.chickenBondManager, account, isInfiniteBondApproved]);

  useEffect(() => {
    (async () => {
      if (
        BSAI_AMM_ADDRESS === null ||
        contracts.saiToken === undefined ||
        isSaiApprovedWithBsaiAmm
      ) {
        return;
      }
      const isApproved = await (isMainnet
        ? api.isTokenApprovedWithBSaiAmmMainnet(account, contracts.saiToken)
        : api.isTokenApprovedWithBSaiAmm(account, contracts.saiToken, BSAI_AMM_ADDRESS));

      setIsSaiApprovedWithBsaiAmm(isApproved);
    })();
  }, [contracts.saiToken, account, isSaiApprovedWithBsaiAmm, isMainnet, BSAI_AMM_ADDRESS]);

  useEffect(() => {
    (async () => {
      if (
        BSAI_AMM_ADDRESS === null ||
        contracts.bSaiToken === undefined ||
        isBSaiApprovedWithBsaiAmm
      ) {
        return;
      }

      const isApproved = await (isMainnet
        ? api.isTokenApprovedWithBSaiAmmMainnet(account, contracts.bSaiToken)
        : api.isTokenApprovedWithBSaiAmm(account, contracts.bSaiToken, BSAI_AMM_ADDRESS));

      setIsBSaiApprovedWithBsaiAmm(isApproved);
    })();
  }, [contracts.bSaiToken, account, isBSaiApprovedWithBsaiAmm, isMainnet, BSAI_AMM_ADDRESS]);

  useEffect(() => {
    (async () => {
      if (
        BSAI_LP_ZAP_ADDRESS === null ||
        contracts.saiToken === undefined ||
        isSaiApprovedWithAmmZapper
      ) {
        return;
      }

      const isSaiApproved = await api.isTokenApprovedWithAmmZapper(
        account,
        contracts.saiToken,
        BSAI_LP_ZAP_ADDRESS
      );

      setIsSaiApprovedWithAmmZapper(isSaiApproved);
    })();
  }, [contracts.saiToken, account, isSaiApprovedWithAmmZapper, BSAI_LP_ZAP_ADDRESS]);

  useEffect(() => {
    (async () => {
      if (contracts.bSaiAmm === undefined || isBSaiLpApprovedWithAmmZapper) return;
      const lpToken = await api.getLpToken(contracts.bSaiAmm);
      const isLpApproved = await api.isTokenApprovedWithAmmZapper(
        account,
        lpToken,
        BSAI_LP_ZAP_ADDRESS
      );

      setIsBSaiLpApprovedWithAmmZapper(isLpApproved);
    })();
  }, [contracts.bSaiAmm, account, isBSaiLpApprovedWithAmmZapper, BSAI_LP_ZAP_ADDRESS]);

  useEffect(() => {
    (async () => {
      if (
        BSAI_LP_ZAP_ADDRESS === null ||
        contracts.bSaiToken === undefined ||
        isBSaiApprovedWithAmmZapper
      ) {
        return;
      }

      const isBSaiApproved = await api.isTokenApprovedWithAmmZapper(
        account,
        contracts.bSaiToken,
        BSAI_LP_ZAP_ADDRESS
      );

      setIsSaiApprovedWithAmmZapper(isBSaiApproved);
    })();
  }, [contracts.bSaiToken, account, isBSaiApprovedWithAmmZapper, BSAI_LP_ZAP_ADDRESS]);

  useEffect(() => {
    if (isSynchronizing) return;
    const timer = setTimeout(() => setShouldSynchronize(true), SYNCHRONIZE_INTERVAL_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [isSynchronizing]);

  useEffect(() => {
    (async () => {
      try {
        if (
          contracts.saiToken === undefined ||
          contracts.bondNft === undefined ||
          contracts.chickenBondManager === undefined ||
          contracts.bSaiToken === undefined ||
          contracts.bSaiAmm === undefined ||
          contracts.bSaiGauge === undefined ||
          !shouldSynchronize ||
          isSynchronizing
        ) {
          return;
        }
        setIsSynchronizing(true);

        const latest = await contracts.getLatestData(account, api);
        if (latest === undefined) {
          setIsSynchronizing(false);
          return;
        }

        const {
          protocolInfo,
          bonds,
          stats,
          bSaiBalance,
          saiBalance,
          lpTokenBalance,
          stakedLpTokenBalance,
          lpTokenSupply,
          bSaiAmmBSaiBalance,
          bSaiAmmSaiBalance,
          lpRewards
        } = latest;

        setProtocolInfo(protocolInfo);

        // Don't change the simualted price if we already have one since only the user should change it
        if (simulatedProtocolInfo === undefined) {
          const simulatedProtocolInfo = _getProtocolInfo(
            protocolInfo.simulatedMarketPrice,
            protocolInfo.floorPrice,
            protocolInfo.claimBondFee,
            protocolInfo.alphaAccrualFactor
          );
          setSimulatedProtocolInfo({
            ...protocolInfo,
            ...simulatedProtocolInfo,
            simulatedMarketPrice: protocolInfo.simulatedMarketPrice
          });
        }

        setShouldSynchronize(false);
        setLpRewards(lpRewards);
        setBSaiBalance(bSaiBalance);
        setSaiBalance(saiBalance);
        setLpTokenBalance(lpTokenBalance);
        setStakedLpTokenBalance(stakedLpTokenBalance);
        setLpTokenSupply(lpTokenSupply);
        setBSaiAmmBSaiBalance(bSaiAmmBSaiBalance);
        setBSaiAmmSaiBalance(bSaiAmmSaiBalance);
        setStats(stats);
        setBonds(bonds);
        setOptimisticBond(undefined);
      } catch (error: unknown) {
        console.error("Synchronising effect exception", error);
      }

      setIsSynchronizing(false);
    })();
  }, [isSynchronizing, shouldSynchronize, account, contracts, simulatedProtocolInfo]);

  const [approveInfiniteBond, approveStatus] = useTransaction(async () => {
    await api.approveInfiniteBond(
      contracts.saiToken,
      contracts.chickenBondManager,
      fluid.connection.signer
    );
    setIsInfiniteBondApproved(true);
  }, [contracts.saiToken, contracts.chickenBondManager, fluid.connection.signer]);

  const [approveAmm, approveAmmStatus] = useTransaction(
    async (tokensNeedingApproval: BSaiAmmTokenIndex[]) => {
      for (const token of tokensNeedingApproval) {
        if (token === BSaiAmmTokenIndex.BSAI) {
          await (isMainnet
            ? api.approveTokenWithBSaiAmmMainnet(contracts.bSaiToken, fluid.connection.signer)
            : api.approveTokenWithBSaiAmm(
                contracts.bSaiToken,
                BSAI_AMM_ADDRESS,
                fluid.connection.signer
              ));

          setIsBSaiApprovedWithBsaiAmm(true);
        } else {
          await (isMainnet
            ? api.approveTokenWithBSaiAmmMainnet(contracts.saiToken, fluid.connection.signer)
            : api.approveTokenWithBSaiAmm(
                contracts.saiToken,
                BSAI_AMM_ADDRESS,
                fluid.connection.signer
              ));

          setIsSaiApprovedWithBsaiAmm(true);
        }
      }
    },
    [
      contracts.bSaiToken,
      contracts.saiToken,
      isMainnet,
      BSAI_AMM_ADDRESS,
      fluid.connection.signer
    ]
  );

  const [approveTokens, approveTokensStatus] = useTransaction(
    async ({ tokensNeedingApproval }: ApprovePressedPayload) => {
      if (contracts.bSaiAmm === undefined) return;
      for (const [token, spender] of Array.from(tokensNeedingApproval)) {
        if (token === BSaiAmmTokenIndex.BSAI) {
          await api.approveToken(contracts.bSaiToken, spender, fluid.connection.signer);
          if (spender === BSAI_AMM_ADDRESS) {
            setIsBSaiApprovedWithBsaiAmm(true);
          } else if (spender === BSAI_LP_ZAP_ADDRESS) {
            setIsBSaiApprovedWithAmmZapper(true);
          }
        } else if (token === BSaiAmmTokenIndex.SAI) {
          await api.approveToken(
            contracts.saiToken,
            BSAI_LP_ZAP_ADDRESS,
            fluid.connection.signer
          );
          setIsSaiApprovedWithAmmZapper(true);
        } else if (token === BSaiAmmTokenIndex.BSAI_SAI_LP && spender === undefined) {
          const lpToken = await api.getLpToken(contracts.bSaiAmm);
          await api.approveToken(lpToken, BSAI_LP_ZAP_ADDRESS, fluid.connection.signer);
          setIsBSaiLpApprovedWithAmmZapper(true);
        } else if (token === BSaiAmmTokenIndex.BSAI_SAI_LP) {
          const lpToken = await api.getLpToken(contracts.bSaiAmm);
          await api.approveToken(lpToken, spender, fluid.connection.signer);
          if (spender === BSAI_LP_ZAP_ADDRESS) {
            setIsBSaiLpApprovedWithAmmZapper(true);
          } else if (spender === BSAI_AMM_STAKING_ADDRESS) {
            setIsBSaiLpApprovedWithGauge(true);
          }
        }
      }
    },
    [
      contracts.bSaiAmm,
      contracts.bSaiToken,
      contracts.saiToken,
      BSAI_LP_ZAP_ADDRESS,
      BSAI_AMM_STAKING_ADDRESS,
      BSAI_AMM_ADDRESS,
      fluid.connection.signer
    ]
  );

  const [createBond, createStatus] = useTransaction(
    async (saiAmount: Decimal) => {
      await api.createBond(
        saiAmount,
        account,
        contracts.chickenBondManager,
        fluid.connection.signer
      );
      const optimisticBond: OptimisticBond = {
        id: "OPTIMISTIC_BOND",
        deposit: saiAmount,
        startTime: Date.now(),
        status: "PENDING"
      };
      setOptimisticBond(optimisticBond);
      setShouldSynchronize(true);
    },
    [contracts.chickenBondManager, fluid.connection.signer, account]
  );

  const [cancelBond, cancelStatus] = useTransaction(
    async (bondId: string, minimumSai: Decimal) => {
      await api.cancelBond(
        bondId,
        minimumSai,
        account,
        contracts.chickenBondManager,
        fluid.connection.signer
      );
      removeBondFromList(bondId);
      setShouldSynchronize(true);
    },
    [contracts.chickenBondManager, removeBondFromList, fluid.connection.signer, account]
  );

  const [claimBond, claimStatus] = useTransaction(
    async (bondId: string) => {
      await api.claimBond(bondId, account, contracts.chickenBondManager, fluid.connection.signer);
      changeBondStatusToClaimed(bondId);
      setShouldSynchronize(true);
    },
    [contracts.chickenBondManager, changeBondStatusToClaimed, fluid.connection.signer, account]
  );

  const getExpectedSwapOutput = useCallback(
    async (inputToken: BSaiAmmTokenIndex, inputAmount: Decimal) =>
      contracts.bSaiAmm
        ? (isMainnet ? api.getExpectedSwapOutputMainnet : api.getExpectedSwapOutput)(
            inputToken,
            inputAmount,
            contracts.bSaiAmm
          )
        : Decimal.ZERO,
    [contracts.bSaiAmm, isMainnet]
  );

  const [swapTokens, swapStatus] = useTransaction(
    async (inputToken: BSaiAmmTokenIndex, inputAmount: Decimal, minOutputAmount: Decimal) => {
      await (isMainnet ? api.swapTokensMainnet : api.swapTokens)(
        inputToken,
        inputAmount,
        minOutputAmount,
        contracts.bSaiAmm,
        fluid.connection.signer,
        account
      );
      setShouldSynchronize(true);
    },
    [contracts.bSaiAmm, isMainnet, fluid.connection.signer, account]
  );

  const getExpectedLpTokens = useCallback(
    async (bSaiAmount: Decimal, saiAmount: Decimal) => {
      return contracts.bSaiAmmZapper
        ? api.getExpectedLpTokens(bSaiAmount, saiAmount, contracts.bSaiAmmZapper)
        : Decimal.ZERO;
    },
    [contracts.bSaiAmmZapper]
  );

  const [manageLiquidity, manageLiquidityStatus] = useTransaction(
    async (params: ManageLiquidityPayload) => {
      if (params.action === "addLiquidity") {
        await api.addLiquidity(
          params.bSaiAmount,
          params.saiAmount,
          params.minLpTokens,
          params.shouldStakeInGauge,
          contracts.bSaiAmmZapper,
          fluid.connection.signer,
          account
        );
      } else if (params.action === "removeLiquidity") {
        await api.removeLiquidity(
          params.burnLpTokens,
          params.minBSaiAmount,
          params.minSaiAmount,
          contracts.bSaiAmmZapper,
          fluid.connection.signer
        );
      } else if (params.action === "removeLiquidityOneCoin") {
        await api.removeLiquidityOneCoin(
          params.burnLpTokens,
          params.output,
          params.minAmount,
          contracts.bSaiAmmZapper,
          contracts.bSaiAmm,
          fluid.connection.signer,
          account
        );
      } else if (params.action === "stakeLiquidity") {
        await api.stakeLiquidity(
          params.stakeAmount,
          contracts.bSaiGauge,
          fluid.connection.signer
        );
      } else if (params.action === "unstakeLiquidity") {
        await api.unstakeLiquidity(
          params.unstakeAmount,
          contracts.bSaiGauge,
          fluid.connection.signer
        );
      } else if (params.action === "claimLpRewards") {
        await api.claimLpRewards(contracts.bSaiGauge, fluid.connection.signer);
      }
      setShouldSynchronize(true);
    },
    [
      contracts.bSaiAmmZapper,
      contracts.bSaiGauge,
      contracts.bSaiAmm,
      fluid.connection.signer,
      account
    ]
  );

  const getExpectedWithdrawal = useCallback(
    async (
      burnLp: Decimal,
      output: BSaiAmmTokenIndex | "both"
    ): Promise<Map<BSaiAmmTokenIndex, Decimal>> => {
      if (contracts.bSaiAmm === undefined)
        return new Map([
          [BSaiAmmTokenIndex.SAI, Decimal.ZERO],
          [BSaiAmmTokenIndex.BSAI, Decimal.ZERO]
        ]);

      return contracts.bSaiAmmZapper
        ? api.getExpectedWithdrawal(burnLp, output, contracts.bSaiAmmZapper, contracts.bSaiAmm)
        : new Map();
    },
    [contracts.bSaiAmmZapper, contracts.bSaiAmm]
  );

  const selectedBond = useMemo(() => bonds?.find(bond => bond.id === selectedBondId), [
    bonds,
    selectedBondId
  ]);

  const dispatchEvent = useCallback(
    async (event: BondEvent, payload?: Payload) => {
      if (!isValidEvent(viewRef.current, event)) {
        console.error("invalid event", event, payload, "in view", viewRef.current);
        return;
      }

      const nextView = transition(viewRef.current, event);
      setView(nextView);

      if (payload && "bondId" in payload && payload.bondId !== selectedBondId) {
        setSelectedBondId(payload.bondId);
      }

      if (payload && "inputToken" in payload && payload.inputToken !== inputToken) {
        setInputToken(payload.inputToken);
      }

      const isCurrentViewEvent = (_view: BondView, _event: BondEvent) =>
        viewRef.current === _view && event === _event;

      try {
        if (isCurrentViewEvent("CREATING", "APPROVE_PRESSED")) {
          await approveInfiniteBond();
        } else if (isCurrentViewEvent("CREATING", "CONFIRM_PRESSED")) {
          await createBond((payload as CreateBondPayload).deposit);
          await dispatchEvent("CREATE_BOND_CONFIRMED");
        } else if (isCurrentViewEvent("CANCELLING", "CONFIRM_PRESSED")) {
          if (selectedBond === undefined) {
            console.error(
              "dispatchEvent() handler: attempted to cancel a bond without selecting a bond"
            );
            return;
          }
          await cancelBond(selectedBond.id, selectedBond.deposit);
          await dispatchEvent("CANCEL_BOND_CONFIRMED");
        } else if (isCurrentViewEvent("CLAIMING", "CONFIRM_PRESSED")) {
          if (selectedBond === undefined) {
            console.error(
              "dispatchEvent() handler: attempted to claim a bond without selecting a bond"
            );
            return;
          }
          await claimBond(selectedBond.id);
          await dispatchEvent("CLAIM_BOND_CONFIRMED");
        } else if (isCurrentViewEvent("SWAPPING", "APPROVE_PRESSED")) {
          await approveAmm([inputToken]);
        } else if (isCurrentViewEvent("SWAPPING", "CONFIRM_PRESSED")) {
          const { inputAmount, minOutputAmount } = payload as SwapPayload;
          await swapTokens(inputToken, inputAmount, minOutputAmount);
          await dispatchEvent("SWAP_CONFIRMED");
        } else if (isCurrentViewEvent("MANAGING_LIQUIDITY", "APPROVE_PRESSED")) {
          await approveTokens(payload as ApprovePressedPayload);
        } else if (isCurrentViewEvent("MANAGING_LIQUIDITY", "CONFIRM_PRESSED")) {
          await manageLiquidity(payload as ManageLiquidityPayload);
          await dispatchEvent("MANAGE_LIQUIDITY_CONFIRMED");
        }
      } catch (error: unknown) {
        console.error("dispatchEvent(), event handler failed\n\n", error);
      }
    },
    [
      selectedBondId,
      approveInfiniteBond,
      cancelBond,
      createBond,
      claimBond,
      selectedBond,
      approveAmm,
      approveTokens,
      swapTokens,
      inputToken,
      manageLiquidity
    ]
  );

  useEffect(() => {
    setStatuses(statuses => ({
      ...statuses,
      APPROVE: approveStatus,
      CREATE: createStatus,
      CANCEL: cancelStatus,
      CLAIM: claimStatus,
      APPROVE_AMM: approveAmmStatus,
      APPROVE_SPENDER: approveTokensStatus,
      SWAP: swapStatus,
      MANAGE_LIQUIDITY: manageLiquidityStatus
    }));
  }, [
    approveStatus,
    createStatus,
    cancelStatus,
    claimStatus,
    approveAmmStatus,
    approveTokensStatus,
    swapStatus,
    manageLiquidityStatus
  ]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    (async () => {
      if (
        bonds === undefined ||
        protocolInfo === undefined ||
        contracts.chickenBondManager === undefined
      )
        return;

      if (protocolInfo.bSaiSupply.gt(0)) {
        setIsBootstrapPeriodActive(false);
        return;
      }

      const bootstrapPeriodMs =
        (await contracts.chickenBondManager.BOOTSTRAP_PERIOD_CHICKEN_IN()).toNumber() * 1000;

      const anyBondOlderThanBootstrapPeriod =
        bonds.find(bond => Date.now() - bond.startTime > bootstrapPeriodMs) !== undefined;

      setIsBootstrapPeriodActive(!anyBondOlderThanBootstrapPeriod);
    })();
  }, [bonds, protocolInfo, contracts.chickenBondManager]);

  const provider: BondViewContextType = {
    view,
    dispatchEvent,
    selectedBondId,
    optimisticBond,
    protocolInfo,
    stats,
    bonds,
    statuses,
    selectedBond,
    bSaiBalance,
    saiBalance,
    lpTokenBalance,
    stakedLpTokenBalance,
    lpTokenSupply,
    bSaiAmmBSaiBalance,
    bSaiAmmSaiBalance,
    isInfiniteBondApproved,
    isSynchronizing,
    getSaiFromFaucet,
    setSimulatedMarketPrice,
    resetSimulatedMarketPrice,
    simulatedProtocolInfo,
    hasFoundContracts: contracts.hasFoundContracts,
    isBSaiApprovedWithBsaiAmm,
    isSaiApprovedWithBsaiAmm,
    isSaiApprovedWithAmmZapper,
    isBSaiApprovedWithAmmZapper,
    isBSaiLpApprovedWithAmmZapper,
    isBSaiLpApprovedWithGauge,
    inputToken,
    isInputTokenApprovedWithBSaiAmm:
      inputToken === BSaiAmmTokenIndex.BSAI
        ? isBSaiApprovedWithBsaiAmm
        : isSaiApprovedWithBsaiAmm,
    getExpectedSwapOutput,
    getExpectedLpTokens,
    getExpectedWithdrawal,
    isBootstrapPeriodActive,
    hasLoaded: protocolInfo !== undefined && bonds !== undefined,
    addresses: contracts.addresses,
    lpRewards
  };

  return <BondViewContext.Provider value={provider}>{children}</BondViewContext.Provider>;
};
