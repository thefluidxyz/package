import { Decimal } from "./Decimal";
import { Fees } from "./Fees";
import { FLOStake } from "./FLOStake";
import { StabilityDeposit } from "./StabilityDeposit";
import { Trove, TroveWithPendingRedistribution, UserTrove } from "./Trove";
import { FrontendStatus, ReadableFluid, TroveListingParams } from "./ReadableFluid";

/** @internal */
export type _ReadableFluidWithExtraParamsBase<T extends unknown[]> = {
  [P in keyof ReadableFluid]: ReadableFluid[P] extends (...params: infer A) => infer R
    ? (...params: [...originalParams: A, ...extraParams: T]) => R
    : never;
};

/** @internal */
export type _FluidReadCacheBase<T extends unknown[]> = {
  [P in keyof ReadableFluid]: ReadableFluid[P] extends (...args: infer A) => Promise<infer R>
    ? (...params: [...originalParams: A, ...extraParams: T]) => R | undefined
    : never;
};

// Overloads get lost in the mapping, so we need to define them again...

/** @internal */
export interface _ReadableFluidWithExtraParams<T extends unknown[]>
  extends _ReadableFluidWithExtraParamsBase<T> {
  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    ...extraParams: T
  ): Promise<TroveWithPendingRedistribution[]>;

  getTroves(params: TroveListingParams, ...extraParams: T): Promise<UserTrove[]>;
}

/** @internal */
export interface _FluidReadCache<T extends unknown[]> extends _FluidReadCacheBase<T> {
  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    ...extraParams: T
  ): TroveWithPendingRedistribution[] | undefined;

  getTroves(params: TroveListingParams, ...extraParams: T): UserTrove[] | undefined;
}

/** @internal */
export class _CachedReadableFluid<T extends unknown[]>
  implements _ReadableFluidWithExtraParams<T> {
  private _readable: _ReadableFluidWithExtraParams<T>;
  private _cache: _FluidReadCache<T>;

  constructor(readable: _ReadableFluidWithExtraParams<T>, cache: _FluidReadCache<T>) {
    this._readable = readable;
    this._cache = cache;
  }

  async getTotalRedistributed(...extraParams: T): Promise<Trove> {
    return (
      this._cache.getTotalRedistributed(...extraParams) ??
      this._readable.getTotalRedistributed(...extraParams)
    );
  }

  async getTroveBeforeRedistribution(
    address?: string,
    ...extraParams: T
  ): Promise<TroveWithPendingRedistribution> {
    return (
      this._cache.getTroveBeforeRedistribution(address, ...extraParams) ??
      this._readable.getTroveBeforeRedistribution(address, ...extraParams)
    );
  }

  async getTrove(address?: string, ...extraParams: T): Promise<UserTrove> {
    const [troveBeforeRedistribution, totalRedistributed] = await Promise.all([
      this.getTroveBeforeRedistribution(address, ...extraParams),
      this.getTotalRedistributed(...extraParams)
    ]);

    return troveBeforeRedistribution.applyRedistribution(totalRedistributed);
  }

  async getNumberOfTroves(...extraParams: T): Promise<number> {
    return (
      this._cache.getNumberOfTroves(...extraParams) ??
      this._readable.getNumberOfTroves(...extraParams)
    );
  }

  async getPrice(...extraParams: T): Promise<Decimal> {
    return this._cache.getPrice(...extraParams) ?? this._readable.getPrice(...extraParams);
  }

  async getTotal(...extraParams: T): Promise<Trove> {
    return this._cache.getTotal(...extraParams) ?? this._readable.getTotal(...extraParams);
  }

  async getStabilityDeposit(address?: string, ...extraParams: T): Promise<StabilityDeposit> {
    return (
      this._cache.getStabilityDeposit(address, ...extraParams) ??
      this._readable.getStabilityDeposit(address, ...extraParams)
    );
  }

  async getRemainingStabilityPoolFLOReward(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getRemainingStabilityPoolFLOReward(...extraParams) ??
      this._readable.getRemainingStabilityPoolFLOReward(...extraParams)
    );
  }

  async getSAIInStabilityPool(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getSAIInStabilityPool(...extraParams) ??
      this._readable.getSAIInStabilityPool(...extraParams)
    );
  }

  async getSAIBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getSAIBalance(address, ...extraParams) ??
      this._readable.getSAIBalance(address, ...extraParams)
    );
  }

  async getFLOBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getFLOBalance(address, ...extraParams) ??
      this._readable.getFLOBalance(address, ...extraParams)
    );
  }

  async getUniTokenBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getUniTokenBalance(address, ...extraParams) ??
      this._readable.getUniTokenBalance(address, ...extraParams)
    );
  }

  async getUniTokenAllowance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getUniTokenAllowance(address, ...extraParams) ??
      this._readable.getUniTokenAllowance(address, ...extraParams)
    );
  }

  async getRemainingLiquidityMiningFLOReward(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getRemainingLiquidityMiningFLOReward(...extraParams) ??
      this._readable.getRemainingLiquidityMiningFLOReward(...extraParams)
    );
  }

  async getLiquidityMiningStake(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getLiquidityMiningStake(address, ...extraParams) ??
      this._readable.getLiquidityMiningStake(address, ...extraParams)
    );
  }

  async getTotalStakedUniTokens(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getTotalStakedUniTokens(...extraParams) ??
      this._readable.getTotalStakedUniTokens(...extraParams)
    );
  }

  async getLiquidityMiningFLOReward(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getLiquidityMiningFLOReward(address, ...extraParams) ??
      this._readable.getLiquidityMiningFLOReward(address, ...extraParams)
    );
  }

  async getCollateralSurplusBalance(address?: string, ...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getCollateralSurplusBalance(address, ...extraParams) ??
      this._readable.getCollateralSurplusBalance(address, ...extraParams)
    );
  }

  getTroves(
    params: TroveListingParams & { beforeRedistribution: true },
    ...extraParams: T
  ): Promise<TroveWithPendingRedistribution[]>;

  getTroves(params: TroveListingParams, ...extraParams: T): Promise<UserTrove[]>;

  async getTroves(params: TroveListingParams, ...extraParams: T): Promise<UserTrove[]> {
    const { beforeRedistribution, ...restOfParams } = params;

    const [totalRedistributed, troves] = await Promise.all([
      beforeRedistribution ? undefined : this.getTotalRedistributed(...extraParams),
      this._cache.getTroves({ beforeRedistribution: true, ...restOfParams }, ...extraParams) ??
        this._readable.getTroves({ beforeRedistribution: true, ...restOfParams }, ...extraParams)
    ]);

    if (totalRedistributed) {
      return troves.map(trove => trove.applyRedistribution(totalRedistributed));
    } else {
      return troves;
    }
  }

  async getFees(...extraParams: T): Promise<Fees> {
    return this._cache.getFees(...extraParams) ?? this._readable.getFees(...extraParams);
  }

  async getFLOStake(address?: string, ...extraParams: T): Promise<FLOStake> {
    return (
      this._cache.getFLOStake(address, ...extraParams) ??
      this._readable.getFLOStake(address, ...extraParams)
    );
  }

  async getTotalStakedFLO(...extraParams: T): Promise<Decimal> {
    return (
      this._cache.getTotalStakedFLO(...extraParams) ??
      this._readable.getTotalStakedFLO(...extraParams)
    );
  }

  async getFrontendStatus(address?: string, ...extraParams: T): Promise<FrontendStatus> {
    return (
      this._cache.getFrontendStatus(address, ...extraParams) ??
      this._readable.getFrontendStatus(address, ...extraParams)
    );
  }
}
