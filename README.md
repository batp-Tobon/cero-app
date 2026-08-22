# CERO

PWA móvil para administrar créditos y deudas personales: cuánto debes, qué
pagas pronto, cuánto has avanzado y qué deuda conviene priorizar.

**Controla tus créditos. Avanza hacia cero.**

---

## Stack

| Pieza      | Tecnología                                   |
| ---------- | -------------------------------------------- |
| Framework  | Next.js 15 (App Router, React 19, TypeScript) |
| Estilos    | Tailwind CSS 3 · primitivas Radix             |
| Datos      | Supabase (PostgreSQL + Auth + RLS)            |
| Iconos     | Lucide                                        |
| PWA        | `@ducanh2912/next-pwa`                        |
| Despliegue | Vercel                                        |

Se reutilizan los patrones del proyecto NutriAI: cliente/servidor de Supabase
con `@supabase/ssr`, refresco de sesión en middleware, primitivas de UI,
navegación inferior y utilidades de safe-area.

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # rellena las claves de Supabase
npm run dev
```

### Variables de entorno

| Variable                        | Para qué                                     |
| ------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | URL del proyecto Supabase                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública (respeta las RLS)               |
| `NEXT_PUBLIC_APP_URL`           | URL pública, para los enlaces de Auth         |
| `NEXT_PUBLIC_APP_TZ`            | Zona horaria de vencimientos                  |
| `NEXT_PUBLIC_DEFAULT_CURRENCY`  | Moneda por defecto                            |
| `NEXT_PUBLIC_PAYMENT_KEY`       | Llave Bre-B visible para los clientes         |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP`  | WhatsApp de soporte, con indicativo de país    |
| `NEXT_PUBLIC_WOMPI_PUBLIC_KEY`  | Llave pública del comercio Wompi              |
| `WOMPI_INTEGRITY_SECRET`        | Firma del checkout, sólo servidor             |
| `WOMPI_EVENTS_SECRET`           | Verificación del webhook, sólo servidor       |
| `SUPABASE_SERVICE_ROLE_KEY`     | Webhook, pagos y scripts; sólo servidor        |

`SUPABASE_SERVICE_ROLE_KEY` salta las RLS: se configura en Vercel únicamente
como secreto de servidor y sólo la consumen el webhook y acciones autenticadas.
Ninguna de las tres variables secretas lleva prefijo `NEXT_PUBLIC_`.

### Base de datos

Aplica las migraciones de `supabase/migrations/` **en orden** — ver
[`supabase/README.md`](supabase/README.md). Cubren esquema, RLS, vistas, roles,
créditos compartidos, productos rotativos, plan derivado del historial,
apariencia, presupuesto mensual, comprobantes privados y la base comercial
SaaS: prueba de 5 días, plan Pro editable, suscripciones, cobros y auditoría.

### El primer administrador

El registro es abierto, pero nadie nace admin. Tras crear tu cuenta, ejecuta una
vez en el SQL editor de Supabase (allí `auth.uid()` es NULL, y por eso el
trigger que bloquea los auto-ascensos deja pasar este primer cambio):

```sql
update public.profiles set role = 'admin' where email = 'tu@correo.com';
```

A partir de ahí gestionas los roles desde *Perfil → Administración*.

### Datos de ejemplo (desarrollo)

```bash
npm run seed -- tu@correo.com                    # créditos de ejemplo
node scripts/seed-albert.mjs tu@correo.com otro@correo.com --reset  # datos reales AV Villas
```

El segundo carga el Vehículo, el Lote y la tarjeta desde los documentos del
banco, y comparte los dos créditos con el segundo correo. `--reset` borra antes
los productos que ya tuviera ese usuario, para no duplicarlos. Lee su cabecera:
el Lote lleva parámetros que hay que confirmar con la entidad.

Después, en *Perfil → Administración*, pulsa **Reconstruir plan de pagos** en
cada crédito para derivar el cronograma desde los movimientos cargados.

---

## Comandos

| Comando              | Qué hace                                  |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Servidor de desarrollo                    |
| `npm run build`      | Build de producción                       |
| `npm run type-check` | TypeScript sin emitir                     |
| `npm test`           | Tests del motor de amortización (Vitest)  |
| `npm run lint`       | ESLint                                    |
| `npm run icons`      | Regenera los iconos de la PWA             |
| `npm run seed`       | Carga datos de ejemplo (dev)              |
| `npm run verify:rls` | Comprueba los permisos contra la BD real  |

---

## Arquitectura

```
src/
  app/                 rutas de Next.js — sólo componen, no deciden
  features/            un módulo por parte del producto (ver features/README.md)
    auth/ credits/ payments/ revolving/ receipts/ budget/ billing/ ai/
    dashboard/ activity/ profile/ admin/
  core/                motor de amortización y dinero — puro, sin dependencias
  shared/
    ui/                primitivas (botón, input, sheet, select…)
    components/        piezas sin dueño (cabecera, navegación, estados)
    lib/               formato, fechas, apariencia, constantes, entorno
    types/             tipos de la base de datos y del dominio
  infrastructure/      clientes de Supabase y refresco de sesión
```

Cada módulo de `features/` guarda junto lo suyo: pantallas, acciones de
escritura y consultas. Para cambiar algo de créditos se abre `features/credits/`
y está todo ahí — no hay que recorrer tres carpetas técnicas para seguir un
cambio. En `src/features/README.md` está la regla completa.

### Reglas que sostienen el diseño

**PostgreSQL es la fuente de verdad.** React sólo representa estado. Nada
financiero vive en `localStorage`.

**El plan es una función pura del historial.** El cronograma no se parchea pago
a pago: se deriva entero de (crédito + lista de movimientos). Por eso se puede
corregir o borrar un pago de hace seis meses — basta con volver a derivarlo, y
las cuotas se renumeran por orden cronológico.

**El saldo sale del plan de pagos.** `credit_schedule` guarda cada cuota con su
saldo inicial y final; el saldo vivo es el saldo inicial de la primera cuota sin
pagar. La vista `credit_summary` lo resuelve sin traer las 72 filas a la app.

**Compartir es explícito.** Un crédito puede tener varios miembros
(`credit_members`): la pareja comparte el carro y la casa, y cada uno guarda lo
suyo aparte. El dueño invita y es el único que puede borrar el crédito.

**Una tarjeta no es un crédito.** No tiene plan de cuotas ni saldo final
conocido, así que vive en `revolving_accounts` con su cupo, sus movimientos y
sus extractos, en vez de forzarse dentro del motor de amortización.

**La sesión se verifica sin salir a la red.** El middleware y las páginas usan
`auth.getClaims()`, que valida firma y expiración del JWT con las claves JWKS
cacheadas. No se repite `auth.getUser()` por red en cada navegación. Las rutas
públicas y webhooks ni siquiera inicializan Auth.

**Los cálculos ocurren en el servidor.** El navegador puede *previsualizar* una
cuota (con el mismo módulo, para que el número no cambie al confirmar), pero
las escrituras financieras se autorizan en Server Actions y se confirman con
RPC transaccionales de uso exclusivo del servidor.

**El orden lo pone la fecha, no el formulario.** El número de cuota que salda un
pago lo asigna la reconstrucción por orden cronológico. Registrar un pago con
fecha atrasada lo coloca donde de verdad ocurrió.

**Las RLS no son opcional.** Cada tabla filtra por `auth.uid()` en Postgres. El
filtro del frontend es comodidad, no seguridad. Una suscripción vencida tampoco
puede eludir el bloqueo comercial llamando a PostgREST: conserva lectura,
exportación y borrado de sus datos, pero no puede crear ni modificar registros.

**Administrar no significa espiar.** El backoffice sólo alcanza perfiles,
roles, planes, suscripciones, cobros SaaS y auditoría. Ni siquiera un
administrador puede leer créditos, tarjetas, pagos, actividad o presupuestos
privados de otro cliente. Cada cambio de rol o suscripción exige un motivo y se
registra dentro de la misma transacción.

### Motor de amortización

`src/core/amortization.ts` — módulo puro, sin dependencias de red ni de React.

- **Francés** · cuota fija
- **Alemán** · capital fijo, cuota decreciente
- **Americano** · sólo intereses y capital al final
- **Sin interés** · capital repartido entre las cuotas

Toda la aritmética se hace en centavos enteros y la última cuota liquida el
saldo exacto: el plan siempre cierra en cero.

Un abono a capital recalcula la cola del plan según la preferencia del crédito:
*reducir plazo* (misma cuota, menos meses) o *reducir cuota* (mismos meses,
cuota menor).

---

## Despliegue en Vercel

1. Fusiona la rama verificada en `main` y, en el equipo correcto de Vercel,
   selecciona **Add New → Project → Import Git Repository → `batp-Tobon/cero-app`**.
2. Conserva **Framework Preset: Next.js**, **Root Directory: `./`** y los
   comandos detectados. `vercel.json` ubica las Functions en São Paulo (`gru1`),
   junto a la base Supabase `sa-east-1`.
3. En **Settings → Environment Variables**, carga para **Production** todas las
   variables de `.env.example`. `NEXT_PUBLIC_APP_URL` debe ser la URL HTTPS
   definitiva. Marca como sensibles `SUPABASE_SERVICE_ROLE_KEY`,
   `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET`. La service role es
   **obligatoria**, sólo del servidor y nunca debe llevar `NEXT_PUBLIC_`.
4. Para Preview usa un proyecto Supabase y llaves Wompi de pruebas separados;
   no conectes ramas no revisadas a la base ni a los secretos de producción.
5. En Supabase, **Authentication → URL Configuration**: configura la URL de
   producción como **Site URL** y añade
   `https://<dominio>/auth/callback` a **Redirect URLs**.
6. En Wompi configura el evento de producción en
   `https://<dominio>/api/payments/wompi/webhook`, copia los tres valores de
   producción a Vercel y realiza un cobro real pequeño antes de abrir ventas.
7. Pulsa **Deploy**. Si cambias cualquier variable después, vuelve a desplegar:
   Vercel no la aplica retroactivamente a despliegues existentes.
8. Comprueba registro, los 5 días de prueba, pago Wompi, comprobante Bre-B,
   aprobación administrativa, creación de crédito/tarjeta y exportación CSV.

Cada push a `main` despliega a producción; cada PR genera un preview.

---

## Tests

```bash
npm test
```

### Permisos

Las políticas RLS no se pueden validar razonando sobre el papel. `verify:rls`
crea dos usuarios temporales, monta un escenario de pareja (un crédito
compartido y uno privado cada uno) y comprueba contra la base real que cada uno
ve lo suyo, que el invitado puede pagar pero no borrar, que nadie registra pagos
a nombre de otro, que los comprobantes privados respetan el acceso compartido,
que las tarjetas no se comparten y que un usuario no puede ascenderse ni cambiar
planes. Borra todo lo que crea, incluso si falla.

```bash
npm run verify:rls
```

Necesita `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`.

99 tests automatizados cubren: la cuota francesa, los cuatro sistemas, el encadenado
de saldos, el redondeo con centavos, el salto de meses cortos (31 ene → 28 feb),
el reparto entre interés y capital, el recálculo tras un abono en sus dos modos
y la reconstrucción del plan desde el historial — incluido borrar un pago
intermedio y comprobar que los seis siguientes se renumeran sin descuadrar—,
más el cálculo mensual de ingresos, gastos, pagos y déficit, las recomendaciones
financieras, la firma real de comprobantes y las reglas de acceso para planes,
pruebas, suscripciones, gracia y cancelación. `verify:rls` añade pruebas contra
la base real para aislamiento, permisos y escrituras financieras atómicas.
