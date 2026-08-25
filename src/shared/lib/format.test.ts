import { describe, expect, it } from "vitest";
import { countDigits, formatAmountTyping, parseAmountInput } from "./format";

describe("formatAmountTyping", () => {
  it("agrupa los miles a la colombiana", () => {
    expect(formatAmountTyping("1250000")).toBe("1.250.000");
    expect(formatAmountTyping("500")).toBe("500");
    expect(formatAmountTyping("1000")).toBe("1.000");
  });

  it("es estable sobre su propia salida", () => {
    // Se ejecuta en cada pulsación sobre el campo ya formateado: si no fuera
    // idempotente, 1.250 se volvería 1,25 a la siguiente tecla.
    const once = formatAmountTyping("1250000");
    expect(formatAmountTyping(once)).toBe(once);
    expect(formatAmountTyping("1.250.000,50")).toBe("1.250.000,50");
  });

  it("conserva la coma recién tecleada y el cero a la derecha", () => {
    expect(formatAmountTyping("1250,")).toBe("1.250,");
    expect(formatAmountTyping("1250,50")).toBe("1.250,50");
    expect(formatAmountTyping("1250,0")).toBe("1.250,0");
  });

  it("recorta a dos decimales y descarta ceros a la izquierda", () => {
    expect(formatAmountTyping("1250,555")).toBe("1.250,55");
    expect(formatAmountTyping("007")).toBe("7");
    expect(formatAmountTyping("0")).toBe("0");
  });

  it("ignora lo que no sea un importe", () => {
    expect(formatAmountTyping("")).toBe("");
    expect(formatAmountTyping("abc")).toBe("");
    expect(formatAmountTyping("$1.250 COP")).toBe("1.250");
  });

  it("lo que formatea, parseAmountInput lo vuelve a leer", () => {
    expect(parseAmountInput(formatAmountTyping("1250000"))).toBe(1_250_000);
    expect(parseAmountInput(formatAmountTyping("1250,50"))).toBe(1250.5);
  });
});

describe("countDigits", () => {
  it("cuenta sólo dígitos hasta la posición dada", () => {
    expect(countDigits("1.250.000", 5)).toBe(4);
    expect(countDigits("1.250.000", 0)).toBe(0);
    expect(countDigits("1.250.000", 99)).toBe(7);
  });
});
