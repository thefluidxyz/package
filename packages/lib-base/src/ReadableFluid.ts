import { Decimal } from "./Decimal";
import { Trove, TroveWithPendingRedistribution, UserTrove } from "./Trove";
import { StabilityDeposit } from "./StabilityDeposit";
import { Fees } from "./Fees";
import { FLOStake } from "./FLOStake";

/**
 * Represents whether an address has been registered as a Liquity frontend.
 *
 * @remarks
 * Returned by the {@link ReadableFluid.getFrontendStatus | getFrontendStatus()} function.
 *
 * When `status` is `"registered"`, `kickbackRate` gives the frontend's kickback rate as a
 * {@link Decimal} between 0 and 1.
 *
 * @public
 */
export type FrontendStatus =
  | { status: "unregistered" }
  | { status: "registered"; kickbackRate: Decimal };

/**
 * Parameters of the {@link ReadableFluid.(getTroves:2) | getTroves()} function.
 *
 * @public
 */
export interface TroveListingParams {
  /** Number of Troves to retrieve. */
  readonly first: number;

  /** How the Troves should be sorted. */
  readonly sortedBy: "ascendingCollateralRatio" | "descendingCollateralRatio";

  /** Index of the first Trove to retrieve from the sorted list. */
  readonly startingAt?: number;

  /**
   * When set to `true`, the retrieved Troves won't include the liquidation shares received since
   * the last time they were directly modified.
   *
   * @remarks
   * Changes the type of returned Troves to {@link TroveWithPendingRedistribution}.
   */
  readonly beforeRedistribution?: boolean;
}

/**
 * Read the state of the Fluid protocol.
 *
 * @remarks
 * Implemented by {@link @fluid/lib-ethers#EthersLiquity}.
 *
 * @public
 */
export interface ReadableFluid {
  /**
   * Get the total collateral and debt per stake that has been liquidated through redistribution.
   *
   * @remarks
   * Needed when dealing with instances of {@link @fluid/lib-base#TroveWithPendingRedistribution}.
   */
  getTotalRedistributed(): Promise<Trove>;

  /**
   * Get a Trove in its state after the last direct modification.
   *
   * @param address - Address that owns the Trove.
   *
   * @remarks
   * The current state of a Trove can be fetched using
   * {@link @fluid/lib-base#ReadableFluid.getTrove | getTrove()}.
   */
  getTroveBeforeRedistribution(address?: string): Promise<TroveWithPendingRedistribution>;

  /**
   * Get the current state of a Trove.
   *
   * @param address - Address that owns the Trove.
   */
  getTrove(address?: string): Promise<UserTrove>;

  /**
   * Get number of Troves that are currently open.
   */
  getNumberOfTroves(): Promise<number>;

  /**
   * Get the current price of the native currency (e.g. Ether) in USD.
   */
  getPrice(): Promise<Decimal>;

  /**
   * Get the total amount of collateral and debt in the Liquity system.
   */
  getTotal(): Promise<Trove>;

  /**
   * Get the current state of a Stability Deposit.
   *
   * @param address - Address that owns the Stability Deposit.
   */
  getStabilityDeposit(address?: string): Promise<StabilityDeposit>;

  /**
   * Get the remaining FLO that will be collectively rewarded to stability depositors.
   */
  getRemainingStabilityPoolFLOReward(): Promise<Decimal>;

  /**
   * Get the total amount of SAI currently deposited in the Stability Pool.
   */
  getSAIInStabilityPool(): Promise<Decimal>;

  /**
   * Get the amount of SAI held by an address.
   *
   * @param address - Address whose balance should be retrieved.
   */
  getSAIBalance(address?: string): Promise<Decimal>;

  /**
   * Get the amount of FLO held by an address.
   *
   * @param address - Address whose balance should be retrieved.
   */
  getFLOBalance(address?: string): Promise<Decimal>;

  /**
   * Get the amount of Uniswap SEI/SAI LP tokens held by an address.
   *
   * @param address - Address whose balance should be retrieved.
   */
  getUniTokenBalance(address?: string): Promise<Decimal>;

  /**
   * Get the liquidity mining contract's allowance of a holder's Uniswap SEI/SAI LP tokens.
   *
   * @param address - Address holding the Uniswap SEI/SAI LP tokens.
   */
  getUniTokenAllowance(address?: string): Promise<Decimal>;

  /**
   * Get the remaining FLO that will be collectively rewarded to liquidity miners.
   */
  getRemainingLiquidityMiningFLOReward(): Promise<Decimal>;

  /**
   * Get the amount of Uniswap SEI/SAI LP tokens currently staked by an address in liquidity mining.
   *
   * @param address - Address whose LP stake should be retrieved.
   */
  getLiquidityMiningStake(address?: string): Promise<Decimal>;

  /**
   * Get the total amount of Uniswap SEI/SAI LP tokens currently staked in liquidity mining.
   */
  getTotalStakedUniTokens(): Promise<Decimal>;

  /**
   * Get the amount of FLO earned by an address through mining liquidity.
   *
   * @param address - Address whose FLO reward should be retrieved.
   */
  getLiquidityMiningFLOReward(address?: string): Promise<Decimal>;

  /**
   * Get the amount of leftover collateral available for withdrawal by an address.
   *
   * @remarks
   * When a Trove gets liquidated or redeemed, any collateral it has above 110% (in case of
   * liquidation) or 100% collateralization (in case of redemption) gets sent to a pool, where it
   * can be withdrawn from using
   * {@link @fluid/lib-base#TransactableFluid.claimCollateralSurplus | claimCollateralSurplus()}.
   */
  getCollateralSurplusBalance(address?: string): Promise<Decimal>;

  /** @internal */
  getTroves(
    params: TroveListingParams & { beforeRedistribution: true }
  ): Promise<TroveWithPendingRedistribution[]>;

  /**
   * Get a slice from the list of Troves.
   *
   * @param params - Controls how the list is sorted, and where the slice begins and ends.
   * @returns Pairs of owner addresses and their Troves.
   */
  getTroves(params: TroveListingParams): Promise<UserTrove[]>;

  /**
   * Get a calculator for current fees.
   */
  getFees(): Promise<Fees>;

  /**
   * Get the current state of an FLO Stake.
   *
   * @param address - Address that owns the FLO Stake.
   */
  getFLOStake(address?: string): Promise<FLOStake>;

  /**
   * Get the total amount of FLO currently staked.
   */
  getTotalStakedFLO(): Promise<Decimal>;

  /**
   * Check whether an address is registered as a Liquity frontend, and what its kickback rate is.
   *
   * @param address - Address to check.
   */
  getFrontendStatus(address?: string): Promise<FrontendStatus>;
}
