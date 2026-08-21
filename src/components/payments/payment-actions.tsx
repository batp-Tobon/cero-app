"use client";

import * as React from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PaymentSheet } from "@/components/payments/payment-sheet";
import { ExtraPrincipalSheet } from "@/components/payments/extra-principal-sheet";
import type { ExtraPrincipalMode } from "@/core/domain/amortization";
import type { PaymentTarget } from "@/types/domain";

/**
 * Botón "Pagar" / "Registrar pago". El sheet se monta sólo al abrirlo: en el
 * inicio hay uno por cada crédito y montarlos todos cargaría la pantalla de
 * formularios que nadie ha pedido.
 */
export function PayButton({
  target,
  label = "Pagar",
  variant = "default",
  size = "sm",
  className,
}: {
  target: PaymentTarget;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <PaymentSheet target={target} open={open} onOpenChange={setOpen} />
      )}
    </>
  );
}

export function ExtraPrincipalButton({
  creditId,
  creditName,
  currency,
  balance,
  mode,
  label = "Abonar a capital",
  className,
}: {
  creditId: string;
  creditName: string;
  currency: string;
  balance: number;
  mode: ExtraPrincipalMode;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="outline"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && (
        <ExtraPrincipalSheet
          creditId={creditId}
          creditName={creditName}
          currency={currency}
          balance={balance}
          mode={mode}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
