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
4. `20260821000004_roles_and_sharing.sql` — rol admin y `credit_members`
5. `20260821000005_revolving.sql` — tarjetas y cupos rotativos
6. `20260821000006_schedule_replay.sql` — el plan pasa a derivarse del historial
7. `20260821000007_sharing_rpc.sql` — buscar a quién invitar por correo

Todos son idempotentes: se pueden reejecutar sin romper nada.

## Modelo

```
auth.users
    └── profiles          1:1, alta automática por trigger

    └── credits           un crédito del usuario
          ├── credit_members    quién más lo ve (pareja)
          ├── credit_schedule   una fila por cuota  ← derivada del historial
          └── payments          pagos de cuota y abonos a capital  ← los hechos

    └── revolving_accounts    tarjetas y cupos (un solo dueño)
          ├── revolving_statements  el corte del mes
          └── revolving_movements   compras, pagos, intereses

    └── activity          línea de tiempo de la pantalla Actividad
    └── notifications     avisos (arquitectura lista, envío pendiente)
```

### `credit_schedule` manda

El saldo vivo de un crédito **no** se guarda en una columna: es el
`opening_balance` de la primera cuota sin pagar. Así el saldo nunca puede
contradecir al plan de pagos, que es lo que el usuario ve en pantalla.

El plan entero se vuelve a derivar en cada escritura a partir de los pagos: es
lo que permite corregir o borrar un movimiento antiguo sin dejar el saldo
descuadrado. `payments` guarda los hechos; `credit_schedule` es el resultado.

### Corregir un movimiento

Borrar el tercero de nueve pagos hace que los seis siguientes se renumeren. Por
eso la migración 0006 retira el índice único de `(credito, cuota)`: dejó de
describir un invariante cierto. El doble envío del formulario lo frena ahora la
acción del servidor, que rechaza un movimiento idéntico repetido en 30 segundos.

### `credit_summary`

Vista con `security_invoker = on`: respeta las RLS de quien consulta. Resuelve
saldo, progreso, próxima cuota y totales pagados en una sola consulta, en vez de
traer todo el plan a la aplicación para sumarlo.

## Seguridad

RLS activo en las nueve tablas. Un usuario sólo alcanza:

- su perfil, y el de quien comparte un crédito con él;
- los créditos propios y aquellos en los que figura como miembro;
- las cuotas y pagos de esos créditos, vía `public.can_access_credit(uuid)`;
- sus tarjetas (`public.owns_revolving(uuid)`), que no se comparten;
- su propia actividad y sus notificaciones.

Un **administrador** lee todo mediante `public.is_admin()`, pero no escribe
datos financieros ajenos. Un trigger impide que nadie se ascienda a sí mismo:
sin él bastaría un PATCH a `/rest/v1/profiles` para tomar el control.

El **primer** admin se crea desde el SQL editor, donde `auth.uid()` es NULL y el
trigger no interviene:

```sql
update public.profiles set role = 'admin' where email = 'tu@correo.com';
```

Estas funciones son `security definer` para no reevaluar las políticas de
`credits` fila a fila en planes de 72 cuotas.

El rol `anon` no tiene ningún permiso sobre estas tablas.

## Índices

| Índice                            | Para qué                                  |
| --------------------------------- | ----------------------------------------- |
| `credits_owner_status_idx`        | lista de créditos del usuario             |
| `credit_schedule_credit_idx`      | plan de pagos ordenado                    |
| `credit_schedule_pending_due_idx` | próxima cuota y vencidas (índice parcial) |
| `payments_credit_installment_idx` | renumeración de cuotas al reconstruir      |
| `payments_credit_date_idx`        | pagos de un crédito                       |
| `activity_user_time_idx`          | línea de tiempo                           |

## Auth

En *Authentication → URL Configuration*:

- **Site URL**: la URL de producción.
- **Redirect URLs**: `https://<dominio>/auth/callback` y
  `http://localhost:3000/auth/callback`.

El trigger `on_auth_user_created` crea el perfil al registrarse. Las contraseñas
las gestiona Supabase Auth; la aplicación nunca las almacena.
