import { Decimal } from "@fluid/lib-base";
import React, { useEffect, useState } from "react";
import { Flex, Button, Spinner, Checkbox, Label, Card, Text } from "theme-ui";
import { Amount } from "../../../ActionDescription";
import { ErrorDescription } from "../../../ErrorDescription";
import { Icon } from "../../../Icon";
import { InfoIcon } from "../../../InfoIcon";
import { DisabledEditableRow, EditableRow } from "../../../Trove/Editor";
import { useBondView } from "../../context/BondViewContext";
import { BSaiAmmTokenIndex } from "../../context/transitions";
import { PoolDetails } from "./PoolDetails";
import type { Address, ApprovePressedPayload } from "../../context/transitions";

export const DepositPane: React.FC = () => {
  const {
    dispatchEvent,
    statuses,
    saiBalance,
    bSaiBalance,
    isBSaiApprovedWithAmmZapper,
    isSaiApprovedWithAmmZapper,
    getExpectedLpTokens,
    addresses,
    bSaiAmmBSaiBalance,
    bSaiAmmSaiBalance
  } = useBondView();

  const editingState = useState<string>();
  const [bSaiAmount, setBSaiAmount] = useState<Decimal>(Decimal.ZERO);
  const [saiAmount, setSaiAmount] = useState<Decimal>(Decimal.ZERO);
  const [lpTokens, setLpTokens] = useState<Decimal>(Decimal.ZERO);
  const [shouldStakeInGauge, setShouldStakeInGauge] = useState(true);
  const [shouldDepositBalanced, setShouldDepositBalanced] = useState(true);

  const coalescedBSaiBalance = bSaiBalance ?? Decimal.ZERO;
  const coalescedSaiBalance = saiBalance ?? Decimal.ZERO;

  const isApprovePending = statuses.APPROVE_SPENDER === "PENDING";
  const isManageLiquidityPending = statuses.MANAGE_LIQUIDITY === "PENDING";
  const isBSaiBalanceInsufficient = bSaiAmount.gt(coalescedBSaiBalance);
  const isSaiBalanceInsufficient = saiAmount.gt(coalescedSaiBalance);
  const isAnyBalanceInsufficient = isBSaiBalanceInsufficient || isSaiBalanceInsufficient;

  const isDepositingSai = saiAmount.gt(0);
  const isDepositingBSai = bSaiAmount.gt(0);

  const zapperNeedsSaiApproval = isDepositingSai && !isSaiApprovedWithAmmZapper;
  const zapperNeedsBSaiApproval = isDepositingBSai && !isBSaiApprovedWithAmmZapper;
  const isApprovalNeeded = zapperNeedsSaiApproval || zapperNeedsBSaiApproval;

  const poolBalanceRatio =
    bSaiAmmBSaiBalance && bSaiAmmSaiBalance
      ? bSaiAmmSaiBalance.div(bSaiAmmBSaiBalance)
      : Decimal.ONE;

  const handleApprovePressed = () => {
    const tokensNeedingApproval = new Map<BSaiAmmTokenIndex, Address>();
    if (zapperNeedsSaiApproval) {
      tokensNeedingApproval.set(BSaiAmmTokenIndex.SAI, addresses.BSAI_LP_ZAP_ADDRESS);
    }
    if (zapperNeedsBSaiApproval) {
      tokensNeedingApproval.set(BSaiAmmTokenIndex.BSAI, addresses.BSAI_LP_ZAP_ADDRESS);
    }

    dispatchEvent("APPROVE_PRESSED", { tokensNeedingApproval } as ApprovePressedPayload);
  };

  const handleConfirmPressed = () => {
    dispatchEvent("CONFIRM_PRESSED", {
      action: "addLiquidity",
      bSaiAmount,
      saiAmount,
      minLpTokens: lpTokens,
      shouldStakeInGauge
    });
  };

  const handleBackPressed = () => {
    dispatchEvent("BACK_PRESSED");
  };

  const handleToggleShouldStakeInGauge = () => {
    setShouldStakeInGauge(toggle => !toggle);
  };

  const handleToggleShouldDepositBalanced = () => {
    if (!shouldDepositBalanced) {
      setBSaiAmount(Decimal.ZERO);
      setSaiAmount(Decimal.ZERO);
    }
    setShouldDepositBalanced(toggle => !toggle);
  };

  const handleSetAmount = (token: "bSAI" | "SAI", amount: Decimal) => {
    if (shouldDepositBalanced) {
      if (token === "bSAI") setSaiAmount(poolBalanceRatio.mul(amount));
      else if (token === "SAI") setBSaiAmount(amount.div(poolBalanceRatio));
    }

    if (token === "bSAI") setBSaiAmount(amount);
    else if (token === "SAI") setSaiAmount(amount);
  };

  useEffect(() => {
    if (bSaiAmount.isZero && saiAmount.isZero) {
      setLpTokens(Decimal.ZERO);
      return;
    }

    let cancelled = false;

    const timeoutId = setTimeout(async () => {
      try {
        const expectedLpTokens = await getExpectedLpTokens(bSaiAmount, saiAmount);
        if (cancelled) return;
        setLpTokens(expectedLpTokens);
      } catch (error) {
        console.error("getExpectedLpTokens() failed");
        console.log(error);
      }
    }, 200);

    return () => {
      clearTimeout(timeoutId);
      cancelled = true;
    };
  }, [bSaiAmount, saiAmount, getExpectedLpTokens]);

  return (
    <>
      <EditableRow
        label="bSAI amount"
        inputId="deposit-bsai"
        amount={bSaiAmount.prettify(2)}
        unit="bSAI"
        editingState={editingState}
        editedAmount={bSaiAmount.toString()}
        setEditedAmount={amount => handleSetAmount("bSAI", Decimal.from(amount))}
        maxAmount={coalescedBSaiBalance.toString()}
        maxedOut={bSaiAmount.eq(coalescedBSaiBalance)}
      />

      <EditableRow
        label="SAI amount"
        inputId="deposit-sai"
        amount={saiAmount.prettify(2)}
        unit="SAI"
        editingState={editingState}
        editedAmount={saiAmount.toString()}
        setEditedAmount={amount => handleSetAmount("SAI", Decimal.from(amount))}
        maxAmount={coalescedSaiBalance.toString()}
        maxedOut={saiAmount.eq(coalescedSaiBalance)}
      />

      <Flex sx={{ justifyContent: "center", mb: 3 }}>
        <Icon name="arrow-down" size="lg" />
      </Flex>

      <DisabledEditableRow
        label="Mint LP tokens"
        inputId="deposit-mint-lp-tokens"
        amount={lpTokens.prettify(2)}
      />

      <Label>
        <Flex sx={{ alignItems: "center" }}>
          <Checkbox checked={shouldDepositBalanced} onChange={handleToggleShouldDepositBalanced} />
          <Text sx={{ fontWeight: 300, fontSize: "16px" }}>Deposit tokens in a balanced ratio</Text>
          <InfoIcon
            placement="right"
            size="xs"
            tooltip={
              <Card variant="tooltip">
                Tick this box to deposit bSAI and SAI-3CRV in the pool's current liquidity ratio.
                Current ratio = 1 bSAI : {poolBalanceRatio.prettify(2)} SAI.
              </Card>
            }
          />
        </Flex>
      </Label>

      <Label mb={2}>
        <Flex sx={{ alignItems: "center" }}>
          <Checkbox checked={shouldStakeInGauge} onChange={handleToggleShouldStakeInGauge} />
          <Text sx={{ fontWeight: 300, fontSize: "16px" }}>Stake LP tokens in Curve gauge</Text>
          <InfoIcon
            placement="right"
            size="xs"
            tooltip={
              <Card variant="tooltip">
                Tick this box to have your Curve LP tokens staked in the bSAI Curve gauge. Staked LP
                tokens will earn protocol fees and Curve rewards.
              </Card>
            }
          />
        </Flex>
      </Label>

      <PoolDetails />

      {isAnyBalanceInsufficient && (
        <ErrorDescription>
          Deposit exceeds your balance by{" "}
          {isBSaiBalanceInsufficient && (
            <>
              <Amount>{bSaiAmount.sub(coalescedBSaiBalance).prettify(2)} bSAI</Amount>
              {isSaiBalanceInsufficient && <> and </>}
            </>
          )}
          {isSaiBalanceInsufficient && (
            <Amount>{saiAmount.sub(coalescedSaiBalance).prettify(2)} SAI</Amount>
          )}
        </ErrorDescription>
      )}

      <Flex variant="layout.actions">
        <Button
          variant="cancel"
          onClick={handleBackPressed}
          disabled={isApprovePending || isManageLiquidityPending}
        >
          Back
        </Button>

        {!isApprovalNeeded ? (
          <Button
            variant="primary"
            onClick={handleConfirmPressed}
            disabled={
              (bSaiAmount.isZero && saiAmount.isZero) ||
              isAnyBalanceInsufficient ||
              isManageLiquidityPending
            }
          >
            {isManageLiquidityPending ? (
              <Spinner size="28px" sx={{ color: "white" }} />
            ) : (
              <>Confirm</>
            )}
          </Button>
        ) : (
          <Button variant="primary" onClick={handleApprovePressed} disabled={isApprovePending}>
            {isApprovePending ? <Spinner size="28px" sx={{ color: "white" }} /> : <>Approve</>}
          </Button>
        )}
      </Flex>
    </>
  );
};
