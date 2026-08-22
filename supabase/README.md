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
8. `20260821000008_fix_role_bootstrap.sql` — arranque seguro y relaciones
9. `20260821000009_appearance.sql` — apariencia por producto
10. `20260822154323_monthly_budget.sql` — presupuesto mensual
11. `20260822161251_dated_budget_incomes.sql` — ingresos con fecha
12. `20260822162649_harden_function_permissions.sql` — permisos de funciones
13. `20260822170017_secure_saas_billing_foundation.sql` — dominio SaaS seguro
14. `20260822172427_resolve_security_advisor_findings.sql` — cierre de hallazgos
15. `20260822175836_receipts_trials_and_ai_plans.sql` — comprobantes, prueba e IA
16. `20260822182500_cover_foreign_key_indexes.sql` — índices de claves foráneas
17. `20260822183500_document_webhook_client_denial.sql` — webhooks sólo servidor
18. `20260822200000_saas_checkout_and_fast_billing.sql` — checkout Wompi, Bre-B y lectura comercial rápida
19. `20260822203000_fast_dashboard_snapshot.sql` — Inicio en una sola lectura RLS
20. `20260822204500_fast_subscription_snapshot.sql` — Plan y pagos en una sola lectura RLS

Supabase registra cuáles ya se aplicaron. No ejecutes manualmente una migración
que figure en el historial remoto.

## Modelo

```
auth.users
    └── profiles          1:1, alta automática por trigger

    └── credits           un crédito del usuario
          ├── credit_members    quién más lo ve (pareja)
          ├── credit_schedule   una fila por cuota  ← derivada del historial
          └── payments          pagos, abonos y comprobantes  ← los hechos

    └── revolving_accounts    tarjetas y cupos (un solo dueño)
          ├── revolving_statements  el corte del mes
          └── revolving_movements   compras diferidas, pagos y comprobantes

    └── activity          línea de tiempo de la pantalla Actividad
    └── notifications     avisos (arquitectura lista, envío pendiente)

    └── saas_subscriptions       acceso comercial vigente
          ├── saas_subscription_events  historial de cambios
          ├── saas_billing_payments     cobros del producto, no cuotas
          └── saas_usage_counters       límites por periodo

    └── admin_audit_log          cambios administrativos con motivo
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

RLS activo en todas las tablas expuestas. Un usuario sólo alcanza:

- su perfil, y el de quien comparte un crédito con él;
- los créditos propios y aquellos en los que figura como miembro;
- las cuotas y pagos de esos créditos, mediante helpers privados de pertenencia;
- sus tarjetas, que no se comparten;
- su propia actividad y sus notificaciones.

Un **administrador** gestiona perfiles, roles, planes, suscripciones, cobros
SaaS y auditoría. No recibe acceso a créditos, tarjetas, pagos, actividad ni
presupuestos ajenos.

El cliente sólo tiene privilegio `UPDATE` sobre las columnas editables de su
perfil. No puede insertar su perfil ni modificar `id`, `email` o `role`. Los
cambios administrativos de rol y suscripción son transaccionales, exigen un
motivo y escriben `admin_audit_log` antes de confirmar.

El **primer** admin se crea desde el SQL editor, donde `auth.uid()` es NULL y el
trigger no interviene:

```sql
update public.profiles set role = 'admin' where email = 'tu@correo.com';
```

Los helpers privilegiados viven en el esquema `private`, fuera de PostgREST.
Tienen `search_path` vacío, comprueban `auth.uid()` y sólo se ejecutan desde
políticas o wrappers públicos `security invoker` explícitamente autorizados.

El rol `anon` no tiene ningún permiso sobre estas tablas.

Los comprobantes viven en un bucket privado de 6 MB. La aplicación valida MIME
y firma binaria de JPG, PNG, WebP o PDF; usa rutas aleatorias y URLs firmadas de
10 minutos. El dueño y los miembros del crédito pueden leer el soporte, pero no
subir archivos a carpetas ajenas. Las tarjetas siguen siendo sólo del dueño.

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
