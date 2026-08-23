/**
 * La recuperación de contraseña es el único callback que conserva la sesión
 * temporal creada por Supabase. Las confirmaciones de alta vuelven al login.
 */
export function isPasswordRecoveryDestination(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === "/nueva-contrasena";
}
