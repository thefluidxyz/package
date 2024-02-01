import { Decimal, Decimalish } from "./Decimal";
import { Trove, TroveAdjustmentParams, TroveClosureParams, TroveCreationParams } from "./Trove";
import { StabilityDepositChange } from "./StabilityDeposit";
import { FailedReceipt } from "./SendableFluid";

/**
 * Thrown by {@link TransactableFluid} functions in case of transaction failure.
 *
 * @public
 */
export class TransactionFailedError<T extends FailedReceipt = FailedReceipt> extends Error {
  readonly failedReceipt: T;

  /** @internal */
  constructor(name: string, message: string, failedReceipt: T) {
    super(message);
    this.name = name;
    this.failedReceipt = failedReceipt;
  }
}

/**
 * Details of an {@link TransactableFluid.openTrove | openTrove()} transaction.
 *
 * @public
 */
export interface TroveCreationDetails {
  /** How much was deposited and borrowed. */
  params: TroveCreationParams<Decimal>;

  /** The Trove that was created by the transaction. */
  newTrove: Trove;

  /** Amount of SAI added to the Trove's debt as borrowing fee. */
  fee: Decimal;
}

/**
 * Details of an {@link TransactableFluid.adjustTrove | adjustTrove()} transaction.
 *
 * @public
 */
export interface TroveAdjustmentDetails {
  /** Parameters of the adjustment. */
  params: TroveAdjustmentParams<Decimal>;

  /** New state of the adjusted Trove directly after the transaction. */
  newTrove: Trove;

  /** Amount of SAI added to the Trove's debt as borrowing fee. */
  fee: Decimal;
}

/**
 * Details of a {@link TransactableFluid.closeTrove | closeTrove()} transaction.
 *
 * @public
 */
export interface TroveClosureDetails {
  /** How much was withdrawn and repaid. */
  params: TroveClosureParams<Decimal>;
}

/**
 * Details of a {@link TransactableFluid.liquidate | liquidate()} or
 * {@link TransactableFluid.liquidateUpTo | liquidateUpTo()} transaction.
 *
 * @public
 */
export interface LiquidationDetails {
  /** Addresses whose Troves were liquidated by the transaction. */
  liquidatedAddresses: string[];

  /** Total collateral liquidated and debt cleared by the transaction. */
  totalLiquidated: Trove;

  /** Amount of SAI paid to the liquidator as gas compensation. */
  saiGasCompensation: Decimal;

  /** Amount of native currency (e.g. Ether) paid to the liquidator as gas compensation. */
  collateralGasCompensation: Decimal;
}

/**
 * Details of a {@link TransactableFluid.redeemSAI | redeemSAI()} transaction.
 *
 * @public
 */
export interface RedemptionDetails {
  /** Amount of SAI the redeemer tried to redeem. */
  attemptedSAIAmount: Decimal;

  /**
   * Amount of SAI that was actually redeemed by the transaction.
   *
   * @remarks
   * This can end up being lower than `attemptedSAIAmount` due to interference from another
   * transaction that modifies the list of Troves.
   *
   * @public
   */
  actualSAIAmount: Decimal;

  /** Amount of collateral (e.g. Ether) taken from Troves by the transaction. */
  collateralTaken: Decimal;

  /** Amount of native currency (e.g. Ether) deducted as fee from collateral taken. */
  fee: Decimal;
}

/**
 * Details of a
 * {@link TransactableFluid.withdrawGainsFromStabilityPool | withdrawGainsFromStabilityPool()}
 * transaction.
 *
 * @public
 */
export interface StabilityPoolGainsWithdrawalDetails {
  /** Amount of SAI burned from the deposit by liquidations since the last modification. */
  saiLoss: Decimal;

  /** Amount of SAI in the deposit directly after this transaction. */
  newSAIDeposit: Decimal;

  /** Amount of native currency (e.g. Ether) paid out to the depositor in this transaction. */
  collateralGain: Decimal;

  /** Amount of FLO rewarded to the depositor in this transaction. */
  floReward: Decimal;
}

/**
 * Details of a
 * {@link TransactableFluid.depositSAIInStabilityPool | depositSAIInStabilityPool()} or
 * {@link TransactableFluid.withdrawSAIFromStabilityPool | withdrawSAIFromStabilityPool()}
 * transaction.
 *
 * @public
 */
export interface StabilityDepositChangeDetails extends StabilityPoolGainsWithdrawalDetails {
  /** Change that was made to the deposit by this transaction. */
  change: StabilityDepositChange<Decimal>;
}

/**
 * Details of a
 * {@link TransactableFluid.transferCollateralGainToTrove | transferCollateralGainToTrove()}
 * transaction.
 *
 * @public
 */
export interface CollateralGainTransferDetails extends StabilityPoolGainsWithdrawalDetails {
  /** New state of the depositor's Trove directly after the transaction. */
  newTrove: Trove;
}

/**
 * Send Liquity transactions and wait for them to succeed.
 *
 * @remarks
 * The functions return the details of the transaction (if any), or throw an implementation-specific
 * subclass of {@link TransactionFailedError} in case of transaction failure.
 *
 * Implemented by {@link @fluid/lib-ethers#EthersLiquity}.
 *
 * @public
 */
export interface TransactableFluid {
  /**
   * Open a new Trove by depositing collateral and borrowing SAI.
   *
   * @param params - How much to deposit and borrow.
   * @param maxBorrowingRate - Maximum acceptable
   *                           {@link @fluid/lib-base#Fees.borrowingRate | borrowing rate}.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * If `maxBorrowingRate` is omitted, the current borrowing rate plus 0.5% is used as maximum
   * acceptable rate.
   */
  openTrove(
    params: TroveCreationParams<Decimalish>,
    maxBorrowingRate?: Decimalish
  ): Promise<TroveCreationDetails>;

  /**
   * Close existing Trove by repaying all debt and withdrawing all collateral.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  closeTrove(): Promise<TroveClosureDetails>;

  /**
   * Adjust existing Trove by changing its collateral, debt, or both.
   *
   * @param params - Parameters of the adjustment.
   * @param maxBorrowingRate - Maximum acceptable
   *                           {@link @fluid/lib-base#Fees.borrowingRate | borrowing rate} if
   *                           `params` includes `borrowSAI`.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * The transaction will fail if the Trove's debt would fall below
   * {@link @fluid/lib-base#SAI_MINIMUM_DEBT}.
   *
   * If `maxBorrowingRate` is omitted, the current borrowing rate plus 0.5% is used as maximum
   * acceptable rate.
   */
  adjustTrove(
    params: TroveAdjustmentParams<Decimalish>,
    maxBorrowingRate?: Decimalish
  ): Promise<TroveAdjustmentDetails>;

  /**
   * Adjust existing Trove by depositing more collateral.
   *
   * @param amount - The amount of collateral to add to the Trove's existing collateral.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * Equivalent to:
   *
   * ```typescript
   * adjustTrove({ depositCollateral: amount })
   * ```
   */
  depositCollateral(amount: Decimalish): Promise<TroveAdjustmentDetails>;

  /**
   * Adjust existing Trove by withdrawing some of its collateral.
   *
   * @param amount - The amount of collateral to withdraw from the Trove.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * Equivalent to:
   *
   * ```typescript
   * adjustTrove({ withdrawCollateral: amount })
   * ```
   */
  withdrawCollateral(amount: Decimalish): Promise<TroveAdjustmentDetails>;

  /**
   * Adjust existing Trove by borrowing more SAI.
   *
   * @param amount - The amount of SAI to borrow.
   * @param maxBorrowingRate - Maximum acceptable
   *                           {@link @fluid/lib-base#Fees.borrowingRate | borrowing rate}.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * Equivalent to:
   *
   * ```typescript
   * adjustTrove({ borrowSAI: amount }, maxBorrowingRate)
   * ```
   */
  borrowSAI(amount: Decimalish, maxBorrowingRate?: Decimalish): Promise<TroveAdjustmentDetails>;

  /**
   * Adjust existing Trove by repaying some of its debt.
   *
   * @param amount - The amount of SAI to repay.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * Equivalent to:
   *
   * ```typescript
   * adjustTrove({ repaySAI: amount })
   * ```
   */
  repaySAI(amount: Decimalish): Promise<TroveAdjustmentDetails>;

  /** @internal */
  setPrice(price: Decimalish): Promise<void>;

  /**
   * Liquidate one or more undercollateralized Troves.
   *
   * @param address - Address or array of addresses whose Troves to liquidate.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  liquidate(address: string | string[]): Promise<LiquidationDetails>;

  /**
   * Liquidate the least collateralized Troves up to a maximum number.
   *
   * @param maximumNumberOfTrovesToLiquidate - Stop after liquidating this many Troves.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  liquidateUpTo(maximumNumberOfTrovesToLiquidate: number): Promise<LiquidationDetails>;

  /**
   * Make a new Stability Deposit, or top up existing one.
   *
   * @param amount - Amount of SAI to add to new or existing deposit.
   * @param frontendTag - Address that should receive a share of this deposit's FLO rewards.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * The `frontendTag` parameter is only effective when making a new deposit.
   *
   * As a side-effect, the transaction will also pay out an existing Stability Deposit's
   * {@link @fluid/lib-base#StabilityDeposit.collateralGain | collateral gain} and
   * {@link @fluid/lib-base#StabilityDeposit.floReward | FLO reward}.
   */
  depositSAIInStabilityPool(
    amount: Decimalish,
    frontendTag?: string
  ): Promise<StabilityDepositChangeDetails>;

  /**
   * Withdraw SAI from Stability Deposit.
   *
   * @param amount - Amount of SAI to withdraw.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * As a side-effect, the transaction will also pay out the Stability Deposit's
   * {@link @fluid/lib-base#StabilityDeposit.collateralGain | collateral gain} and
   * {@link @fluid/lib-base#StabilityDeposit.floReward | FLO reward}.
   */
  withdrawSAIFromStabilityPool(amount: Decimalish): Promise<StabilityDepositChangeDetails>;

  /**
   * Withdraw {@link @fluid/lib-base#StabilityDeposit.collateralGain | collateral gain} and
   * {@link @fluid/lib-base#StabilityDeposit.floReward | FLO reward} from Stability Deposit.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  withdrawGainsFromStabilityPool(): Promise<StabilityPoolGainsWithdrawalDetails>;

  /**
   * Transfer {@link @fluid/lib-base#StabilityDeposit.collateralGain | collateral gain} from
   * Stability Deposit to Trove.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * The collateral gain is transfered to the Trove as additional collateral.
   *
   * As a side-effect, the transaction will also pay out the Stability Deposit's
   * {@link @fluid/lib-base#StabilityDeposit.floReward | FLO reward}.
   */
  transferCollateralGainToTrove(): Promise<CollateralGainTransferDetails>;

  /**
   * Send SAI tokens to an address.
   *
   * @param toAddress - Address of receipient.
   * @param amount - Amount of SAI to send.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  sendSAI(toAddress: string, amount: Decimalish): Promise<void>;

  /**
   * Send FLO tokens to an address.
   *
   * @param toAddress - Address of receipient.
   * @param amount - Amount of FLO to send.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  sendFLO(toAddress: string, amount: Decimalish): Promise<void>;

  /**
   * Redeem SAI to native currency (e.g. Ether) at face value.
   *
   * @param amount - Amount of SAI to be redeemed.
   * @param maxRedemptionRate - Maximum acceptable
   *                            {@link @fluid/lib-base#Fees.redemptionRate | redemption rate}.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * If `maxRedemptionRate` is omitted, the current redemption rate (based on `amount`) plus 0.1%
   * is used as maximum acceptable rate.
   */
  redeemSAI(amount: Decimalish, maxRedemptionRate?: Decimalish): Promise<RedemptionDetails>;

  /**
   * Claim leftover collateral after a liquidation or redemption.
   *
   * @remarks
   * Use {@link @fluid/lib-base#ReadableFluid.getCollateralSurplusBalance | getCollateralSurplusBalance()}
   * to check the amount of collateral available for withdrawal.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  claimCollateralSurplus(): Promise<void>;

  /**
   * Stake FLO to start earning fee revenue or increase existing stake.
   *
   * @param amount - Amount of FLO to add to new or existing stake.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * As a side-effect, the transaction will also pay out an existing FLO stake's
   * {@link @fluid/lib-base#FLOStake.collateralGain | collateral gain} and
   * {@link @fluid/lib-base#FLOStake.saiGain | SAI gain}.
   */
  stakeFLO(amount: Decimalish): Promise<void>;

  /**
   * Withdraw FLO from staking.
   *
   * @param amount - Amount of FLO to withdraw.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   *
   * @remarks
   * As a side-effect, the transaction will also pay out the FLO stake's
   * {@link @fluid/lib-base#FLOStake.collateralGain | collateral gain} and
   * {@link @fluid/lib-base#FLOStake.saiGain | SAI gain}.
   */
  unstakeFLO(amount: Decimalish): Promise<void>;

  /**
   * Withdraw {@link @fluid/lib-base#FLOStake.collateralGain | collateral gain} and
   * {@link @fluid/lib-base#FLOStake.saiGain | SAI gain} from FLO stake.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  withdrawGainsFromStaking(): Promise<void>;

  /**
   * Allow the liquidity mining contract to use Uniswap ETH/SAI LP tokens for
   * {@link @fluid/lib-base#TransactableFluid.stakeUniTokens | staking}.
   *
   * @param allowance - Maximum amount of LP tokens that will be transferrable to liquidity mining
   *                    (`2^256 - 1` by default).
   *
   * @remarks
   * Must be performed before calling
   * {@link @fluid/lib-base#TransactableFluid.stakeUniTokens | stakeUniTokens()}.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  approveUniTokens(allowance?: Decimalish): Promise<void>;

  /**
   * Stake Uniswap ETH/SAI LP tokens to participate in liquidity mining and earn FLO.
   *
   * @param amount - Amount of LP tokens to add to new or existing stake.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  stakeUniTokens(amount: Decimalish): Promise<void>;

  /**
   * Withdraw Uniswap ETH/SAI LP tokens from liquidity mining.
   *
   * @param amount - Amount of LP tokens to withdraw.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  unstakeUniTokens(amount: Decimalish): Promise<void>;

  /**
   * Withdraw FLO that has been earned by mining liquidity.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  withdrawFLORewardFromLiquidityMining(): Promise<void>;

  /**
   * Withdraw all staked LP tokens from liquidity mining and claim reward.
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  exitLiquidityMining(): Promise<void>;

  /**
   * Register current wallet address as a Liquity frontend.
   *
   * @param kickbackRate - The portion of FLO rewards to pass onto users of the frontend
   *                       (between 0 and 1).
   *
   * @throws
   * Throws {@link TransactionFailedError} in case of transaction failure.
   */
  registerFrontend(kickbackRate: Decimalish): Promise<void>;
}
