# Módulos

Cada carpeta de aquí es un trozo del producto, no una capa técnica. Todo lo que
hace falta para tocar "créditos" está en `credits/`: sus pantallas, sus acciones
de escritura y sus consultas. No hay que saltar entre `components/`, `actions/`
y `queries/` para seguir un solo cambio.

La regla para encontrar algo: **¿de qué parte de la app hablamos?** Esa es la
carpeta.

```
features/
  auth/         entrar, registrarse, recuperar contraseña
  credits/      créditos amortizados: plan de pagos, compartir, ajustes
  payments/     registrar, corregir y borrar pagos y abonos
  revolving/    tarjetas y cupos rotativos
  receipts/     comprobantes privados, validación y URLs temporales
  budget/       ingresos fechados, gastos del mes y obligaciones derivadas
  billing/      acceso comercial: plan, prueba, Wompi, Bre-B y suscripción vigente
  ai/           entrada visual al análisis financiero privado
  dashboard/    lo que compone la pantalla de inicio
  activity/     línea de tiempo de movimientos
  profile/      perfil, preferencias, exportar
  admin/        backoffice: clientes, suscripciones, cobros y auditoría
```

## Qué hay dentro de un módulo

| Archivo         | Qué contiene                                            |
| --------------- | ------------------------------------------------------- |
| `components/`   | Las pantallas y piezas visuales de ese módulo            |
| `actions.ts`    | Server Actions: todo lo que escribe en la base           |
| `queries.ts`    | Lecturas para Server Components                          |
| Otros           | Piezas propias del módulo (`schedule.ts`, `members.ts`)  |

## Lo que NO va aquí

- **`src/core/`** — el motor de amortización y el redondeo de dinero. Es puro,
  no sabe de React ni de Supabase, y lo usan varios módulos. Si una regla
  financiera vale para toda la app, va ahí.
- **`src/shared/`** — `ui/` (botón, input, sheet…), `components/` (piezas sin
  dueño: cabecera, navegación, estados vacíos), `lib/` (formato, fechas) y
  `types/`. Sólo entra aquí lo que usan dos o más módulos.
- **`src/infrastructure/`** — clientes de Supabase y refresco de sesión.
- **`src/app/`** — rutas de Next.js. Componen módulos; no contienen lógica.

## Dependencias entre módulos

Un módulo puede usar `core`, `shared` e `infrastructure` libremente. Entre
módulos, sólo cuando de verdad se componen: `dashboard` pinta el botón de pagar
de `payments`, y `payments` reconstruye el plan de `credits`. Si aparece una
dependencia cruzada que no se explica sola, probablemente esa pieza pertenece a
`shared/`.
