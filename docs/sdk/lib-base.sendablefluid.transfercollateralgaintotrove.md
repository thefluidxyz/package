<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluid/lib-base](./lib-base.md) &gt; [SendableFluid](./lib-base.sendablefluid.md) &gt; [transferCollateralGainToTrove](./lib-base.sendablefluid.transfercollateralgaintotrove.md)

## SendableFluid.transferCollateralGainToTrove() method

Transfer [collateral gain](./lib-base.stabilitydeposit.collateralgain.md) from Stability Deposit to Trove.

<b>Signature:</b>

```typescript
transferCollateralGainToTrove(): Promise<SentFluidTransaction<S, FluidReceipt<R, CollateralGainTransferDetails>>>;
```
<b>Returns:</b>

Promise&lt;[SentFluidTransaction](./lib-base.sentfluidtransaction.md)<!-- -->&lt;S, [FluidReceipt](./lib-base.fluidreceipt.md)<!-- -->&lt;R, [CollateralGainTransferDetails](./lib-base.collateralgaintransferdetails.md)<!-- -->&gt;&gt;&gt;

## Remarks

The collateral gain is transfered to the Trove as additional collateral.

As a side-effect, the transaction will also pay out the Stability Deposit's [LQTY reward](./lib-base.stabilitydeposit.lqtyreward.md)<!-- -->.
