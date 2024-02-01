import { BigNumber } from "@ethersproject/bignumber";
import { Event } from "@ethersproject/contracts";

import {
  Decimal,
  ObservableFluid,
  StabilityDeposit,
  Trove,
  TroveWithPendingRedistribution
} from "@fluid/lib-base";

import { _getContracts, _requireAddress } from "./EthersLiquityConnection";
import { ReadableEthersLiquity } from "./ReadableEthersLiquity";

const debouncingDelayMs = 50;

const debounce = (listener: (latestBlock: number) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;
  let latestBlock = 0;

  return (...args: unknown[]) => {
    const event = args[args.length - 1] as Event;

    if (event.blockNumber !== undefined && event.blockNumber > latestBlock) {
      latestBlock = event.blockNumber;
    }

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      listener(latestBlock);
      timeoutId = undefined;
    }, debouncingDelayMs);
  };
};

/** @alpha */
export class ObservableEthersLiquity implements ObservableFluid {
  private readonly _readable: ReadableEthersLiquity;

  constructor(readable: ReadableEthersLiquity) {
    this._readable = readable;
  }

  watchTotalRedistributed(
    onTotalRedistributedChanged: (totalRedistributed: Trove) => void
  ): () => void {
    const { activePool, defaultPool } = _getContracts(this._readable.connection);
    const seiSent = activePool.filters.SeiSent();

    const redistributionListener = debounce((blockTag: number) => {
      this._readable.getTotalRedistributed({ blockTag }).then(onTotalRedistributedChanged);
    });

    const seiSentListener = (toAddress: string, _amount: BigNumber, event: Event) => {
      if (toAddress === defaultPool.address) {
        redistributionListener(event);
      }
    };

    activePool.on(seiSent, seiSentListener);

    return () => {
      activePool.removeListener(seiSent, seiSentListener);
    };
  }

  watchTroveWithoutRewards(
    onTroveChanged: (trove: TroveWithPendingRedistribution) => void,
    address?: string
  ): () => void {
    address ??= _requireAddress(this._readable.connection);

    const { troveManager, borrowerOperations } = _getContracts(this._readable.connection);
    const troveUpdatedByTroveManager = troveManager.filters.TroveUpdated(address);
    const troveUpdatedByBorrowerOperations = borrowerOperations.filters.TroveUpdated(address);

    const troveListener = debounce((blockTag: number) => {
      this._readable.getTroveBeforeRedistribution(address, { blockTag }).then(onTroveChanged);
    });

    troveManager.on(troveUpdatedByTroveManager, troveListener);
    borrowerOperations.on(troveUpdatedByBorrowerOperations, troveListener);

    return () => {
      troveManager.removeListener(troveUpdatedByTroveManager, troveListener);
      borrowerOperations.removeListener(troveUpdatedByBorrowerOperations, troveListener);
    };
  }

  watchNumberOfTroves(onNumberOfTrovesChanged: (numberOfTroves: number) => void): () => void {
    const { troveManager } = _getContracts(this._readable.connection);
    const { TroveUpdated } = troveManager.filters;
    const troveUpdated = TroveUpdated();

    const troveUpdatedListener = debounce((blockTag: number) => {
      this._readable.getNumberOfTroves({ blockTag }).then(onNumberOfTrovesChanged);
    });

    troveManager.on(troveUpdated, troveUpdatedListener);

    return () => {
      troveManager.removeListener(troveUpdated, troveUpdatedListener);
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  watchPrice(onPriceChanged: (price: Decimal) => void): () => void {
    // TODO revisit
    // We no longer have our own PriceUpdated events. If we want to implement this in an event-based
    // manner, we'll need to listen to aggregator events directly. Or we could do polling.
    throw new Error("Method not implemented.");
  }

  watchTotal(onTotalChanged: (total: Trove) => void): () => void {
    const { troveManager } = _getContracts(this._readable.connection);
    const { TroveUpdated } = troveManager.filters;
    const troveUpdated = TroveUpdated();

    const totalListener = debounce((blockTag: number) => {
      this._readable.getTotal({ blockTag }).then(onTotalChanged);
    });

    troveManager.on(troveUpdated, totalListener);

    return () => {
      troveManager.removeListener(troveUpdated, totalListener);
    };
  }

  watchStabilityDeposit(
    onStabilityDepositChanged: (stabilityDeposit: StabilityDeposit) => void,
    address?: string
  ): () => void {
    address ??= _requireAddress(this._readable.connection);

    const { activePool, stabilityPool } = _getContracts(this._readable.connection);
    const { UserDepositChanged } = stabilityPool.filters;
    const { SeiSent } = activePool.filters;

    const userDepositChanged = UserDepositChanged(address);
    const seiSent = SeiSent();

    const depositListener = debounce((blockTag: number) => {
      this._readable.getStabilityDeposit(address, { blockTag }).then(onStabilityDepositChanged);
    });

    const seiSentListener = (toAddress: string, _amount: BigNumber, event: Event) => {
      if (toAddress === stabilityPool.address) {
        // Liquidation while Stability Pool has some deposits
        // There may be new gains
        depositListener(event);
      }
    };

    stabilityPool.on(userDepositChanged, depositListener);
    activePool.on(seiSent, seiSentListener);

    return () => {
      stabilityPool.removeListener(userDepositChanged, depositListener);
      activePool.removeListener(seiSent, seiSentListener);
    };
  }

  watchSAIInStabilityPool(
    onSAIInStabilityPoolChanged: (saiInStabilityPool: Decimal) => void
  ): () => void {
    const { saiToken, stabilityPool } = _getContracts(this._readable.connection);
    const { Transfer } = saiToken.filters;

    const transferSAIFromStabilityPool = Transfer(stabilityPool.address);
    const transferSAIToStabilityPool = Transfer(null, stabilityPool.address);

    const stabilityPoolSAIFilters = [transferSAIFromStabilityPool, transferSAIToStabilityPool];

    const stabilityPoolSAIListener = debounce((blockTag: number) => {
      this._readable.getSAIInStabilityPool({ blockTag }).then(onSAIInStabilityPoolChanged);
    });

    stabilityPoolSAIFilters.forEach(filter => saiToken.on(filter, stabilityPoolSAIListener));

    return () =>
      stabilityPoolSAIFilters.forEach(filter =>
        saiToken.removeListener(filter, stabilityPoolSAIListener)
      );
  }

  watchSAIBalance(onSAIBalanceChanged: (balance: Decimal) => void, address?: string): () => void {
    address ??= _requireAddress(this._readable.connection);

    const { saiToken } = _getContracts(this._readable.connection);
    const { Transfer } = saiToken.filters;
    const transferSAIFromUser = Transfer(address);
    const transferSAIToUser = Transfer(null, address);

    const saiTransferFilters = [transferSAIFromUser, transferSAIToUser];

    const saiTransferListener = debounce((blockTag: number) => {
      this._readable.getSAIBalance(address, { blockTag }).then(onSAIBalanceChanged);
    });

    saiTransferFilters.forEach(filter => saiToken.on(filter, saiTransferListener));

    return () =>
      saiTransferFilters.forEach(filter => saiToken.removeListener(filter, saiTransferListener));
  }
}
