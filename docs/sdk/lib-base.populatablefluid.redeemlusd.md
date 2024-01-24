<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluid/lib-base](./lib-base.md) &gt; [PopulatableFluid](./lib-base.populatablefluid.md) &gt; [redeemLUSD](./lib-base.populatablefluid.redeemlusd.md)

## PopulatableFluid.redeemLUSD() method

Redeem LUSD to native currency (e.g. Ether) at face value.

<b>Signature:</b>

```typescript
redeemLUSD(amount: Decimalish, maxRedemptionRate?: Decimalish): Promise<PopulatedRedemption<P, S, R>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of LUSD to be redeemed. |
|  maxRedemptionRate | [Decimalish](./lib-base.decimalish.md) | Maximum acceptable [redemption rate](./lib-base.fees.redemptionrate.md)<!-- -->. |

<b>Returns:</b>

Promise&lt;[PopulatedRedemption](./lib-base.populatedredemption.md)<!-- -->&lt;P, S, R&gt;&gt;

## Remarks

If `maxRedemptionRate` is omitted, the current redemption rate (based on `amount`<!-- -->) plus 0.1% is used as maximum acceptable rate.
