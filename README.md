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
| `SUPABASE_SERVICE_ROLE_KEY`     | **Sólo local**, para `npm run seed`           |

`SUPABASE_SERVICE_ROLE_KEY` salta las RLS: nunca se importa desde `src/` ni se
configura en Vercel.

### Base de datos

Aplica las migraciones de `supabase/migrations/` en orden — ver
[`supabase/README.md`](supabase/README.md).

### Datos de ejemplo (desarrollo)

```bash
npm run seed -- tu@correo.com
```

Crea los tres créditos de referencia del diseño con su plan de pagos. No se usa
en producción.

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
    (auth)/            login · recuperar · nueva contraseña
    (app)/             inicio · créditos · actividad · perfil (rutas privadas)
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

**El saldo sale del plan de pagos.** `credit_schedule` guarda cada cuota con su
saldo inicial y final; el saldo vivo es el saldo inicial de la primera cuota sin
pagar. La vista `credit_summary` lo resuelve sin traer las 72 filas a la app.

**Los cálculos ocurren en el servidor.** El navegador puede *previsualizar* una
cuota (con el mismo módulo, para que el número no cambie al confirmar), pero
sólo las Server Actions escriben.

**Las cuotas se pagan en orden.** El saldo de cada una es el cierre de la
anterior; saltarse una rompería la cadena, así que la acción lo rechaza.

**Las RLS no son opcional.** Cada tabla filtra por `auth.uid()` en Postgres. El
filtro del frontend es comodidad, no seguridad.

### Motor de amortización

`src/core/domain/amortization.ts` — módulo puro, sin dependencias de red ni de
React, con 33 tests.

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

Cubren la cuota francesa, los cuatro sistemas, el encadenado de saldos, el
redondeo con centavos, el salto de meses cortos (31 ene → 28 feb), el reparto
entre interés y capital, y el recálculo tras un abono en sus dos modos.
