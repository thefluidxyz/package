<!-- Do not edit this file. It is automatically generated by API Documenter. -->

[Home](./index.md) &gt; [@fluid/lib-base](./lib-base.md) &gt; [Trove](./lib-base.trove.md) &gt; [whatChanged](./lib-base.trove.whatchanged.md)

## Trove.whatChanged() method

Calculate the difference between this Trove and another.

<b>Signature:</b>

```typescript
whatChanged(that: Trove, borrowingRate?: Decimalish): TroveChange<Decimal> | undefined;
```

## Parameters

|  Parameter | Type | Description |
|  --- | --- | --- |
|  that | [Trove](./lib-base.trove.md) | The other Trove. |
|  borrowingRate | [Decimalish](./lib-base.decimalish.md) | Borrowing rate to use when calculating a borrowed amount. |

<b>Returns:</b>

[TroveChange](./lib-base.trovechange.md)<!-- -->&lt;[Decimal](./lib-base.decimal.md)<!-- -->&gt; \| undefined

An object representing the change, or `undefined` if the Troves are equal.
