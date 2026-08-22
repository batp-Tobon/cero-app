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
| `SUPABASE_SERVICE_ROLE_KEY`     | **Sólo local**, para los scripts de seed      |

`SUPABASE_SERVICE_ROLE_KEY` salta las RLS: nunca se importa desde `src/` ni se
configura en Vercel.

### Base de datos

Aplica las migraciones de `supabase/migrations/` **en orden** — ver
[`supabase/README.md`](supabase/README.md). Son siete: esquema, RLS, vistas,
roles y créditos compartidos, productos rotativos, plan derivado del historial
y la función de búsqueda para compartir.

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

---

## Arquitectura

```
src/
  app/
    (auth)/            login · registro · recuperar · nueva contraseña
    (app)/             inicio · créditos · tarjetas · actividad · perfil · admin
    api/export/        descarga CSV
    auth/callback/     canje del código de Supabase Auth
  components/
    ui/                primitivas (botón, input, sheet, select…)
    common/            estados, importes, selectores
    layout/            navegación inferior, cabeceras
    dashboard/ credits/ payments/ activity/ profile/
  core/domain/         motor de amortización (puro y testeado)
  server/
    queries/           lecturas para Server Components
    actions/           Server Actions (escrituras)
    services/          persistencia del plan de pagos
  infrastructure/supabase/  clientes de navegador, servidor y middleware
  lib/                 formato, fechas, constantes, entorno
  types/               tipos de BD y de dominio
```

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

**Los cálculos ocurren en el servidor.** El navegador puede *previsualizar* una
cuota (con el mismo módulo, para que el número no cambie al confirmar), pero
sólo las Server Actions escriben.

**El orden lo pone la fecha, no el formulario.** El número de cuota que salda un
pago lo asigna la reconstrucción por orden cronológico. Registrar un pago con
fecha atrasada lo coloca donde de verdad ocurrió.

**Las RLS no son opcional.** Cada tabla filtra por `auth.uid()` en Postgres. El
filtro del frontend es comodidad, no seguridad.

### Motor de amortización

`src/core/domain/amortization.ts` — módulo puro, sin dependencias de red ni de
React, con 52 tests.

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

1. Sube el repositorio a GitHub.
2. En Vercel: **New Project** → importa el repositorio (framework Next.js,
   detectado solo).
3. Añade las variables `NEXT_PUBLIC_*` en *Settings → Environment Variables*
   (Production y Preview). **No añadas la service role key.**
4. En Supabase, *Authentication → URL Configuration*: pon el dominio de Vercel
   como **Site URL** y añade `https://<dominio>/auth/callback` a las
   **Redirect URLs**.

Cada push a `main` despliega a producción; cada PR genera un preview.

---

## Tests

```bash
npm test
```

52 tests sobre el motor: la cuota francesa, los cuatro sistemas, el encadenado
de saldos, el redondeo con centavos, el salto de meses cortos (31 ene → 28 feb),
el reparto entre interés y capital, el recálculo tras un abono en sus dos modos
y la reconstrucción del plan desde el historial — incluido borrar un pago
intermedio y comprobar que los seis siguientes se renumeran sin descuadrar.
