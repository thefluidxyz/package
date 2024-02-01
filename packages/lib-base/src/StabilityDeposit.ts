import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two Stability Deposit states.
 *
 * @public
 */
export type StabilityDepositChange<T> =
  | { depositSAI: T; withdrawSAI?: undefined }
  | { depositSAI?: undefined; withdrawSAI: T; withdrawAllSAI: boolean };

/**
 * A Stability Deposit and its accrued gains.
 *
 * @public
 */
export class StabilityDeposit {
  /** Amount of SAI in the Stability Deposit at the time of the last direct modification. */
  readonly initialSAI: Decimal;

  /** Amount of SAI left in the Stability Deposit. */
  readonly currentSAI: Decimal;

  /** Amount of native currency (e.g. Ether) received in exchange for the used-up SAI. */
  readonly collateralGain: Decimal;

  /** Amount of FLO rewarded since the last modification of the Stability Deposit. */
  readonly floReward: Decimal;

  /**
   * Address of frontend through which this Stability Deposit was made.
   *
   * @remarks
   * If the Stability Deposit was made through a frontend that doesn't tag deposits, this will be
   * the zero-address.
   */
  readonly frontendTag: string;

  /** @internal */
  constructor(
    initialSAI: Decimal,
    currentSAI: Decimal,
    collateralGain: Decimal,
    floReward: Decimal,
    frontendTag: string
  ) {
    this.initialSAI = initialSAI;
    this.currentSAI = currentSAI;
    this.collateralGain = collateralGain;
    this.floReward = floReward;
    this.frontendTag = frontendTag;

    if (this.currentSAI.gt(this.initialSAI)) {
      throw new Error("currentSAI can't be greater than initialSAI");
    }
  }

  get isEmpty(): boolean {
    return (
      this.initialSAI.isZero &&
      this.currentSAI.isZero &&
      this.collateralGain.isZero &&
      this.floReward.isZero
    );
  }

  /** @internal */
  toString(): string {
    return (
      `{ initialSAI: ${this.initialSAI}` +
      `, currentSAI: ${this.currentSAI}` +
      `, collateralGain: ${this.collateralGain}` +
      `, floReward: ${this.floReward}` +
      `, frontendTag: "${this.frontendTag}" }`
    );
  }

  /**
   * Compare to another instance of `StabilityDeposit`.
   */
  equals(that: StabilityDeposit): boolean {
    return (
      this.initialSAI.eq(that.initialSAI) &&
      this.currentSAI.eq(that.currentSAI) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.floReward.eq(that.floReward) &&
      this.frontendTag === that.frontendTag
    );
  }

  /**
   * Calculate the difference between the `currentSAI` in this Stability Deposit and `thatSAI`.
   *
   * @returns An object representing the change, or `undefined` if the deposited amounts are equal.
   */
  whatChanged(thatSAI: Decimalish): StabilityDepositChange<Decimal> | undefined {
    thatSAI = Decimal.from(thatSAI);

    if (thatSAI.lt(this.currentSAI)) {
      return { withdrawSAI: this.currentSAI.sub(thatSAI), withdrawAllSAI: thatSAI.isZero };
    }

    if (thatSAI.gt(this.currentSAI)) {
      return { depositSAI: thatSAI.sub(this.currentSAI) };
    }
  }

  /**
   * Apply a {@link StabilityDepositChange} to this Stability Deposit.
   *
   * @returns The new deposited SAI amount.
   */
  apply(change: StabilityDepositChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.currentSAI;
    }

    if (change.withdrawSAI !== undefined) {
      return change.withdrawAllSAI || this.currentSAI.lte(change.withdrawSAI)
        ? Decimal.ZERO
        : this.currentSAI.sub(change.withdrawSAI);
    } else {
      return this.currentSAI.add(change.depositSAI);
    }
  }
}
