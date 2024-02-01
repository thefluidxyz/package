import { Decimal, Decimalish } from "./Decimal";

/**
 * Represents the change between two states of an FLO Stake.
 *
 * @public
 */
export type FLOStakeChange<T> =
  | { stakeFLO: T; unstakeFLO?: undefined }
  | { stakeFLO?: undefined; unstakeFLO: T; unstakeAllFLO: boolean };

/** 
 * Represents a user's FLO stake and accrued gains.
 * 
 * @remarks
 * Returned by the {@link ReadableFluid.getFLOStake | getFLOStake()} function.

 * @public
 */
export class FLOStake {
  /** The amount of FLO that's staked. */
  readonly stakedFLO: Decimal;

  /** Collateral gain available to withdraw. */
  readonly collateralGain: Decimal;

  /** SAI gain available to withdraw. */
  readonly saiGain: Decimal;

  /** @internal */
  constructor(stakedFLO = Decimal.ZERO, collateralGain = Decimal.ZERO, saiGain = Decimal.ZERO) {
    this.stakedFLO = stakedFLO;
    this.collateralGain = collateralGain;
    this.saiGain = saiGain;
  }

  get isEmpty(): boolean {
    return this.stakedFLO.isZero && this.collateralGain.isZero && this.saiGain.isZero;
  }

  /** @internal */
  toString(): string {
    return (
      `{ stakedFLO: ${this.stakedFLO}` +
      `, collateralGain: ${this.collateralGain}` +
      `, saiGain: ${this.saiGain} }`
    );
  }

  /**
   * Compare to another instance of `FLOStake`.
   */
  equals(that: FLOStake): boolean {
    return (
      this.stakedFLO.eq(that.stakedFLO) &&
      this.collateralGain.eq(that.collateralGain) &&
      this.saiGain.eq(that.saiGain)
    );
  }

  /**
   * Calculate the difference between this `FLOStake` and `thatStakedFLO`.
   *
   * @returns An object representing the change, or `undefined` if the staked amounts are equal.
   */
  whatChanged(thatStakedFLO: Decimalish): FLOStakeChange<Decimal> | undefined {
    thatStakedFLO = Decimal.from(thatStakedFLO);

    if (thatStakedFLO.lt(this.stakedFLO)) {
      return {
        unstakeFLO: this.stakedFLO.sub(thatStakedFLO),
        unstakeAllFLO: thatStakedFLO.isZero
      };
    }

    if (thatStakedFLO.gt(this.stakedFLO)) {
      return { stakeFLO: thatStakedFLO.sub(this.stakedFLO) };
    }
  }

  /**
   * Apply a {@link FLOStakeChange} to this `FLOStake`.
   *
   * @returns The new staked FLO amount.
   */
  apply(change: FLOStakeChange<Decimalish> | undefined): Decimal {
    if (!change) {
      return this.stakedFLO;
    }

    if (change.unstakeFLO !== undefined) {
      return change.unstakeAllFLO || this.stakedFLO.lte(change.unstakeFLO)
        ? Decimal.ZERO
        : this.stakedFLO.sub(change.unstakeFLO);
    } else {
      return this.stakedFLO.add(change.stakeFLO);
    }
  }
}
