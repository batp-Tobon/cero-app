# Base de datos de CERO

Las migraciones son la única definición del esquema. Nada se crea a mano desde
el panel: si no está aquí, no existe.

## Aplicarlas

### Con Supabase CLI (recomendado)

```bash
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push
```

### Desde el panel

SQL Editor → pega cada archivo **en orden** y ejecútalo:

1. `20260821000001_init_schema.sql` — tablas, enums, índices y triggers
2. `20260821000002_rls_policies.sql` — Row Level Security
3. `20260821000003_views.sql` — vista `credit_summary`

Los tres son idempotentes: se pueden reejecutar sin romper nada.

## Modelo

```
auth.users
    └── profiles          1:1, alta automática por trigger

    └── credits           un crédito del usuario
          ├── credit_schedule   una fila por cuota  ← fuente de verdad del saldo
          └── payments          pagos de cuota y abonos a capital

    └── activity          línea de tiempo de la pantalla Actividad
    └── notifications     avisos (arquitectura lista, envío pendiente)
```

### `credit_schedule` manda

El saldo vivo de un crédito **no** se guarda en una columna: es el
`opening_balance` de la primera cuota sin pagar. Así el saldo nunca puede
contradecir al plan de pagos, que es lo que el usuario ve en pantalla.

Un abono a capital reescribe la cola pendiente del plan (borra e inserta,
porque el número de cuotas puede cambiar). Las cuotas ya pagadas son inmutables.

### `credit_summary`

Vista con `security_invoker = on`: respeta las RLS de quien consulta. Resuelve
saldo, progreso, próxima cuota y totales pagados en una sola consulta, en vez de
traer todo el plan a la aplicación para sumarlo.

## Seguridad

RLS activo en las seis tablas. Un usuario sólo alcanza:

- su perfil;
- sus créditos;
- las cuotas y pagos de sus créditos, vía `public.owns_credit(uuid)`;
- su propia actividad y sus notificaciones.

`owns_credit` es `security definer` para no reevaluar las políticas de `credits`
fila a fila en planes de 72 cuotas.

El rol `anon` no tiene ningún permiso sobre estas tablas.

## Índices

| Índice                            | Para qué                                  |
| --------------------------------- | ----------------------------------------- |
| `credits_owner_status_idx`        | lista de créditos del usuario             |
| `credit_schedule_credit_idx`      | plan de pagos ordenado                    |
| `credit_schedule_pending_due_idx` | próxima cuota y vencidas (índice parcial) |
| `payments_unique_installment_idx` | **impide dos pagos sobre la misma cuota** |
| `payments_credit_date_idx`        | pagos de un crédito                       |
| `activity_user_time_idx`          | línea de tiempo                           |

## Auth

En *Authentication → URL Configuration*:

- **Site URL**: la URL de producción.
- **Redirect URLs**: `https://<dominio>/auth/callback` y
  `http://localhost:3000/auth/callback`.

El trigger `on_auth_user_created` crea el perfil al registrarse. Las contraseñas
las gestiona Supabase Auth; la aplicación nunca las almacena.
