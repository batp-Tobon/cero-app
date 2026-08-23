import { describe, expect, it } from "vitest";
import { isPasswordRecoveryDestination } from "./callback";

describe("isPasswordRecoveryDestination", () => {
  it("conserva la sesión sólo para el cambio de contraseña", () => {
    expect(isPasswordRecoveryDestination("/nueva-contrasena")).toBe(true);
    expect(isPasswordRecoveryDestination("/nueva-contrasena?desde=correo")).toBe(
      true,
    );
  });

  it("no confunde rutas parecidas con la recuperación", () => {
    expect(isPasswordRecoveryDestination("/nueva-contrasena-falsa")).toBe(false);
    expect(isPasswordRecoveryDestination("/suscripcion?bienvenida=1")).toBe(false);
    expect(isPasswordRecoveryDestination("/inicio")).toBe(false);
  });
});
