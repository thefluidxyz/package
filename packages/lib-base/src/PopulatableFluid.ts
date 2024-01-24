import { Decimal, Decimalish } from "./Decimal";
import { TroveAdjustmentParams, TroveCreationParams } from "./Trove";
import { FluidReceipt, SendableFluid, SentFluidTransaction } from "./SendableFluid";

import {
  CollateralGainTransferDetails,
  LiquidationDetails,
  RedemptionDetails,
  StabilityDepositChangeDetails,
  StabilityPoolGainsWithdrawalDetails,
  TroveAdjustmentDetails,
  TroveClosureDetails,
  TroveCreationDetails
} from "./TransactableFluid";

/**
 * A transaction that has been prepared for sending.
 *
 * @remarks
 * Implemented by {@link @fluid/lib-ethers#PopulatedEthersLiquityTransaction}.
 *
 * @public
 */
export interface PopulatedFluidTransaction<
  P = unknown,
  T extends SentFluidTransaction = SentFluidTransaction
> {
  /** Implementation-specific populated transaction object. */
  readonly rawPopulatedTransaction: P;

  /**
   * Send the transaction.
   *
   * @returns An object that implements {@link @fluid/lib-base#SentFluidTransaction}.
   */
  send(): Promise<T>;
}

/**
 * A redemption transaction that has been prepared for sending.
 *
 * @remarks
 * The Fluid protocol fulfills redemptions by repaying the debt of Troves in ascending order of
 * their collateralization ratio, and taking a portion of their collateral in exchange. Due to the
 * {@link @fluid/lib-base#LUSD_MINIMUM_DEBT | minimum debt} requirement that Troves must fulfill,
 * some LUSD amounts are not possible to redeem exactly.
 *
 * When {@link @fluid/lib-base#PopulatableFluid.redeemLUSD | redeemLUSD()} is called with an
 * amount that can't be fully redeemed, the amount will be truncated (see the `redeemableLUSDAmount`
 * property). When this happens, the redeemer can either redeem the truncated amount by sending the
 * transaction unchanged, or prepare a new transaction by
 * {@link @fluid/lib-base#PopulatedRedemption.increaseAmountByMinimumNetDebt | increasing the amount}
 * to the next lowest possible value, which is the sum of the truncated amount and
 * {@link @fluid/lib-base#LUSD_MINIMUM_NET_DEBT}.
 *
 * @public
 */
export interface PopulatedRedemption<P = unknown, S = unknown, R = unknown>
  extends PopulatedFluidTransaction<
    P,
    SentFluidTransaction<S, FluidReceipt<R, RedemptionDetails>>
  > {
  /** Amount of LUSD the redeemer is trying to redeem. */
  readonly attemptedLUSDAmount: Decimal;

  /** Maximum amount of LUSD that is currently redeemable from `attemptedLUSDAmount`. */
  readonly redeemableLUSDAmount: Decimal;

  /** Whether `redeemableLUSDAmount` is less than `attemptedLUSDAmount`. */
  readonly isTruncated: boolean;

  /**
   * Prepare a new transaction by increasing the attempted amount to the next lowest redeemable
   * value.
   *
   * @param maxRedemptionRate - Maximum acceptable
   *                            {@link @fluid/lib-base#Fees.redemptionRate | redemption rate} to
   *                            use in the new transaction.
   *
   * @remarks
   * If `maxRedemptionRate` is omitted, the original transaction's `maxRedemptionRate` is reused
   * unless that was also omitted, in which case the current redemption rate (based on the increased
   * amount) plus 0.1% is used as maximum acceptable rate.
   */
  increaseAmountByMinimumNetDebt(
    maxRedemptionRate?: Decimalish
  ): Promise<PopulatedRedemption<P, S, R>>;
}

/** @internal */
export type _PopulatableFrom<T, P> = {
  [M in keyof T]: T[M] extends (...args: infer A) => Promise<infer U>
    ? U extends SentFluidTransaction
      ? (...args: A) => Promise<PopulatedFluidTransaction<P, U>>
      : never
    : never;
};

/**
 * Prepare Liquity transactions for sending.
 *
 * @remarks
 * The functions return an object implementing {@link PopulatedFluidTransaction}, which can be
 * used to send the transaction and get a {@link SentFluidTransaction}.
 *
 * Implemented by {@link @fluid/lib-ethers#PopulatableEthersLiquity}.
 *
 * @public
 */
export interface PopulatableFluid<R = unknown, S = unknown, P = unknown>
  extends _PopulatableFrom<SendableFluid<R, S>, P> {
  // Methods re-declared for documentation purposes

  /** {@inheritDoc TransactableFluid.openTrove} */
  openTrove(
    params: TroveCreationParams<Decimalish>,
    maxBorrowingRate?: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, TroveCreationDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.closeTrove} */
  closeTrove(): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, TroveClosureDetails>>>
  >;

  /** {@inheritDoc TransactableFluid.adjustTrove} */
  adjustTrove(
    params: TroveAdjustmentParams<Decimalish>,
    maxBorrowingRate?: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.depositCollateral} */
  depositCollateral(
    amount: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.withdrawCollateral} */
  withdrawCollateral(
    amount: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.borrowLUSD} */
  borrowLUSD(
    amount: Decimalish,
    maxBorrowingRate?: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.repayLUSD} */
  repayLUSD(
    amount: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, TroveAdjustmentDetails>>
    >
  >;

  /** @internal */
  setPrice(
    price: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.liquidate} */
  liquidate(
    address: string | string[]
  ): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, LiquidationDetails>>>
  >;

  /** {@inheritDoc TransactableFluid.liquidateUpTo} */
  liquidateUpTo(
    maximumNumberOfTrovesToLiquidate: number
  ): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, LiquidationDetails>>>
  >;

  /** {@inheritDoc TransactableFluid.depositLUSDInStabilityPool} */
  depositLUSDInStabilityPool(
    amount: Decimalish,
    frontendTag?: string
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, StabilityDepositChangeDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.withdrawLUSDFromStabilityPool} */
  withdrawLUSDFromStabilityPool(
    amount: Decimalish
  ): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, StabilityDepositChangeDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.withdrawGainsFromStabilityPool} */
  withdrawGainsFromStabilityPool(): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, StabilityPoolGainsWithdrawalDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.transferCollateralGainToTrove} */
  transferCollateralGainToTrove(): Promise<
    PopulatedFluidTransaction<
      P,
      SentFluidTransaction<S, FluidReceipt<R, CollateralGainTransferDetails>>
    >
  >;

  /** {@inheritDoc TransactableFluid.sendLUSD} */
  sendLUSD(
    toAddress: string,
    amount: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.sendLQTY} */
  sendLQTY(
    toAddress: string,
    amount: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.redeemLUSD} */
  redeemLUSD(
    amount: Decimalish,
    maxRedemptionRate?: Decimalish
  ): Promise<PopulatedRedemption<P, S, R>>;

  /** {@inheritDoc TransactableFluid.claimCollateralSurplus} */
  claimCollateralSurplus(): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>
  >;

  /** {@inheritDoc TransactableFluid.stakeLQTY} */
  stakeLQTY(
    amount: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.unstakeLQTY} */
  unstakeLQTY(
    amount: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.withdrawGainsFromStaking} */
  withdrawGainsFromStaking(): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>
  >;

  /** {@inheritDoc TransactableFluid.approveUniTokens} */
  approveUniTokens(
    allowance?: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.stakeUniTokens} */
  stakeUniTokens(
    amount: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.unstakeUniTokens} */
  unstakeUniTokens(
    amount: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;

  /** {@inheritDoc TransactableFluid.withdrawLQTYRewardFromLiquidityMining} */
  withdrawLQTYRewardFromLiquidityMining(): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>
  >;

  /** {@inheritDoc TransactableFluid.exitLiquidityMining} */
  exitLiquidityMining(): Promise<
    PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>
  >;

  /** {@inheritDoc TransactableFluid.registerFrontend} */
  registerFrontend(
    kickbackRate: Decimalish
  ): Promise<PopulatedFluidTransaction<P, SentFluidTransaction<S, FluidReceipt<R, void>>>>;
}
