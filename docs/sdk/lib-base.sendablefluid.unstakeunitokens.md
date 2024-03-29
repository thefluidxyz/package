<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluid/lib-base](./lib-base.md) &gt; [SendableFluid](./lib-base.sendablefluid.md) &gt; [unstakeUniTokens](./lib-base.sendablefluid.unstakeunitokens.md)

## SendableFluid.unstakeUniTokens() method

Withdraw Uniswap SEI/SAI LP tokens from liquidity mining.

<b>Signature:</b>

```typescript
unstakeUniTokens(amount: Decimalish): Promise<SentFluidTransaction<S, FluidReceipt<R, void>>>;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  amount | [Decimalish](./lib-base.decimalish.md) | Amount of LP tokens to withdraw. |

<b>Returns:</b>

Promise&lt;[SentFluidTransaction](./lib-base.sentfluidtransaction.md)<!-- -->&lt;S, [FluidReceipt](./lib-base.fluidreceipt.md)<!-- -->&lt;R, void&gt;&gt;&gt;

