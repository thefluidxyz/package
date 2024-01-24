import { Decimalish } from "./Decimal";
import { TroveAdjustmentParams, TroveCreationParams } from "./Trove";

import {
  CollateralGainTransferDetails,
  LiquidationDetails,
  RedemptionDetails,
  StabilityDepositChangeDetails,
  StabilityPoolGainsWithdrawalDetails,
  TransactableFluid,
  TroveAdjustmentDetails,
  TroveClosureDetails,
  TroveCreationDetails
} from "./TransactableFluid";

/**
 * A transaction that has already been sent.
 *
 * @remarks
 * Implemented by {@link @fluid/lib-ethers#SentEthersFluidTransaction}.
 *
 * @public
 */
export interface SentFluidTransaction<S = unknown, T extends FluidReceipt = FluidReceipt> {
  /** Implementation-specific sent transaction object. */
  readonly rawSentTransaction: S;

  /**
   * Check whether the transaction has been mined, and whether it was successful.
   *
   * @remarks
   * Unlike {@link @fluid/lib-base#SentFluidTransaction.waitForReceipt | waitForReceipt()},
   * this function doesn't wait for the transaction to be mined.
   */
  getReceipt(): Promise<T>;

  /**
   * Wait for the transaction to be mined, and check whether it was successful.
   *
   * @returns Either a {@link @fluid/lib-base#FailedReceipt} or a
   *          {@link @fluid/lib-base#SuccessfulReceipt}.
   */
  waitForReceipt(): Promise<Extract<T, MinedReceipt>>;
}

/**
 * Indicates that the transaction hasn't been mined yet.
 *
 * @remarks
 * Returned by {@link SentFluidTransaction.getReceipt}.
 *
 * @public
 */
export type PendingReceipt = { status: "pending" };

/** @internal */
export const _pendingReceipt: PendingReceipt = { status: "pending" };

/**
 * Indicates that the transaction has been mined, but it failed.
 *
 * @remarks
 * The `rawReceipt` property is an implementation-specific transaction receipt object.
 *
 * Returned by {@link SentFluidTransaction.getReceipt} and
 * {@link SentFluidTransaction.waitForReceipt}.
 *
 * @public
 */
export type FailedReceipt<R = unknown> = { status: "failed"; rawReceipt: R };

/** @internal */
export const _failedReceipt = <R>(rawReceipt: R): FailedReceipt<R> => ({
  status: "failed",
  rawReceipt
});

/**
 * Indicates that the transaction has succeeded.
 *
 * @remarks
 * The `rawReceipt` property is an implementation-specific transaction receipt object.
 *
 * The `details` property may contain more information about the transaction.
 * See the return types of {@link TransactableFluid} functions for the exact contents of `details`
 * for each type of Fluid transaction.
 *
 * Returned by {@link SentFluidTransaction.getReceipt} and
 * {@link SentFluidTransaction.waitForReceipt}.
 *
 * @public
 */
export type SuccessfulReceipt<R = unknown, D = unknown> = {
  status: "succeeded";
  rawReceipt: R;
  details: D;
};

/** @internal */
export const _successfulReceipt = <R, D>(
  rawReceipt: R,
  details: D,
  toString?: () => string
): SuccessfulReceipt<R, D> => ({
  status: "succeeded",
  rawReceipt,
  details,
  ...(toString ? { toString } : {})
});

/**
 * Either a {@link FailedReceipt} or a {@link SuccessfulReceipt}.
 *
 * @public
 */
export type MinedReceipt<R = unknown, D = unknown> = FailedReceipt<R> | SuccessfulReceipt<R, D>;

/**
 * One of either a {@link PendingReceipt}, a {@link FailedReceipt} or a {@link SuccessfulReceipt}.
 *
 * @public
 */
export type FluidReceipt<R = unknown, D = unknown> = PendingReceipt | MinedReceipt<R, D>;

/** @internal */
export type _SendableFrom<T, R, S> = {
  [M in keyof T]: T[M] extends (...args: infer A) => Promise<infer D>
    ? (...args: A) => Promise<SentFluidTransaction<S, FluidReceipt<R, D>>>
    : never;
};

/**
 * Send Fluid transactions.
 *
 * @remarks
 * The functions return an object implementing {@link SentFluidTransaction}, which can be used
 * to monitor the transaction and get its details when it succeeds.
 *
 * Implemented by {@link @fluid/lib-ethers#SendableEthersFluid}.
 *
 * @public
 */
export interface SendableFluid<R = unknown, S = unknown>
  extends _SendableFrom<TransactableFluid, R, S> {
  // Methods re-declared for documentation purposes

  /** {@inheritDoc TransactableFluid.openTrove} */
  openTrove(
    params: TroveCreationParams<Decimalish>,
    maxBorrowingRate?: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveCreationDetails>>>;

  /** {@inheritDoc TransactableFluid.closeTrove} */
  closeTrove(): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveClosureDetails>>>;

  /** {@inheritDoc TransactableFluid.adjustTrove} */
  adjustTrove(
    params: TroveAdjustmentParams<Decimalish>,
    maxBorrowingRate?: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>>;

  /** {@inheritDoc TransactableFluid.depositCollateral} */
  depositCollateral(
    amount: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>>;

  /** {@inheritDoc TransactableFluid.withdrawCollateral} */
  withdrawCollateral(
    amount: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>>;

  /** {@inheritDoc TransactableFluid.borrowLUSD} */
  borrowLUSD(
    amount: Decimalish,
    maxBorrowingRate?: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>>;

  /** {@inheritDoc TransactableFluid.repayLUSD} */
  repayLUSD(
    amount: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>>;

  /** @internal */
  setPrice(price: Decimalish): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.liquidate} */
  liquidate(
    address: string | string[]
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, LiquidationDetails>>>;

  /** {@inheritDoc TransactableFluid.liquidateUpTo} */
  liquidateUpTo(
    maximumNumberOfTrovesToLiquidate: number
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, LiquidationDetails>>>;

  /** {@inheritDoc TransactableFluid.depositLUSDInStabilityPool} */
  depositLUSDInStabilityPool(
    amount: Decimalish,
    frontendTag?: string
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, StabilityDepositChangeDetails>>>;

  /** {@inheritDoc TransactableFluid.withdrawLUSDFromStabilityPool} */
  withdrawLUSDFromStabilityPool(
    amount: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, StabilityDepositChangeDetails>>>;

  /** {@inheritDoc TransactableFluid.withdrawGainsFromStabilityPool} */
  withdrawGainsFromStabilityPool(): Promise<
    SentFluidTransaction<S, FluidReceipt<R, StabilityPoolGainsWithdrawalDetails>>
  >;

  /** {@inheritDoc TransactableFluid.transferCollateralGainToTrove} */
  transferCollateralGainToTrove(): Promise<
    SentFluidTransaction<S, FluidReceipt<R, CollateralGainTransferDetails>>
  >;

  /** {@inheritDoc TransactableFluid.sendLUSD} */
  sendLUSD(
    toAddress: string,
    amount: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.sendLQTY} */
  sendLQTY(
    toAddress: string,
    amount: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.redeemLUSD} */
  redeemLUSD(
    amount: Decimalish,
    maxRedemptionRate?: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, RedemptionDetails>>>;

  /** {@inheritDoc TransactableFluid.claimCollateralSurplus} */
  claimCollateralSurplus(): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.stakeLQTY} */
  stakeLQTY(amount: Decimalish): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.unstakeLQTY} */
  unstakeLQTY(amount: Decimalish): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.withdrawGainsFromStaking} */
  withdrawGainsFromStaking(): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.approveUniTokens} */
  approveUniTokens(
    allowance?: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.stakeUniTokens} */
  stakeUniTokens(amount: Decimalish): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.unstakeUniTokens} */
  unstakeUniTokens(amount: Decimalish): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.withdrawLQTYRewardFromLiquidityMining} */
  withdrawLQTYRewardFromLiquidityMining(): Promise<
    SentFluidTransaction<S, FluidReceipt<R, void>>
  >;

  /** {@inheritDoc TransactableFluid.exitLiquidityMining} */
  exitLiquidityMining(): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;

  /** {@inheritDoc TransactableFluid.registerFrontend} */
  registerFrontend(
    kickbackRate: Decimalish
  ): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;
}
