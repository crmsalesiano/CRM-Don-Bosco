# Directorio Parroquial

App web para que el padre encuentre fácilmente a miembros de la comunidad por oficio o habilidad, además de gestionar grupos/ministerios, calendario, sacramentos y avisos.

Es un sitio 100% estático (HTML + CSS + JavaScript). No necesita servidor propio: toda la base de datos vive en Supabase, y el sitio se hospeda gratis en Netlify.

---

## Paso 1 — Crear el proyecto en Supabase

1. Entra a **https://supabase.com** y crea una cuenta nueva (puede ser con un correo dedicado para la parroquia).
2. Clic en **New project**.
3. Ponle un nombre (ej. `directorio-parroquial`), crea una contraseña de base de datos (guárdala en un lugar seguro) y elige la región más cercana a Guatemala (normalmente `South America` o `US East`).
4. Espera 1-2 minutos mientras Supabase crea el proyecto.

## Paso 2 — Crear las tablas

1. En el menú izquierdo de Supabase, entra a **SQL Editor**.
2. Clic en **New query**.
3. Abre el archivo `sql/schema.sql` de esta carpeta, copia **todo** el contenido y pégalo ahí.
4. Clic en **Run**. Deberías ver "Success. No rows returned".

Esto crea todas las tablas (personas, categorías, grupos, eventos, sacramentos, avisos) y las categorías básicas de oficios ya cargadas.

## Paso 3 — Obtener tus credenciales

1. En Supabase, ve a **Project Settings** (ícono de engrane) → **API**.
2. Copia el valor de **Project URL**.
3. Copia el valor de **anon public** (dentro de "Project API keys").

## Paso 4 — Configurar la app

1. Abre el archivo `js/config.js` de esta carpeta.
2. Reemplaza:
   ```js
   window.APP_CONFIG = {
     SUPABASE_URL: "PEGA_AQUI_TU_SUPABASE_URL",
     SUPABASE_ANON_KEY: "PEGA_AQUI_TU_SUPABASE_ANON_KEY",
     APP_PIN: "2024"
   };
   ```
   con tu URL y tu anon key reales. Cambia también `APP_PIN` por el código que el padre usará para entrar a la app (puede ser cualquier número o palabra corta).
3. Guarda el archivo.

## Paso 5 — Probar localmente (opcional)

Si tienes Python instalado, desde esta carpeta puedes correr:
```
python3 -m http.server 8080
```
y abrir `http://localhost:8080` en el navegador para probar antes de publicar.

## Paso 6 — Publicar en Netlify

**Opción A — Arrastrar y soltar (la más simple):**
1. Entra a **https://app.netlify.com** y crea una cuenta.
2. En el panel, busca la zona que dice **"Drag and drop your site output folder here"**.
3. Arrastra **toda esta carpeta** (`directorio-parroquial`) ahí.
4. En segundos tendrás un enlace como `https://algo-al-azar.netlify.app`. Puedes cambiarlo por uno más fácil de recordar en **Site settings → Change site name**.

**Opción B — Conectar con GitHub (recomendada a futuro, para poder actualizar la app con `git push`):**
1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify, clic en **Add new site → Import an existing project**.
3. Conecta tu cuenta de GitHub y elige el repositorio.
4. Como no hay proceso de "build" (es HTML puro), deja el **Build command vacío** y el **Publish directory** como `.` (la raíz).
5. Clic en **Deploy**.

## Cómo usar la app

- Al abrir el enlace, pedirá el código de acceso (`APP_PIN` que configuraste). Solo hay que ingresarlo una vez por dispositivo/navegador.
- Desde el menú de inicio se accede a los 5 módulos: Directorio de talentos, Grupos y ministerios, Calendario, Sacramentos y Avisos.
- Todo lo que se guarda queda en tu base de Supabase — puedes revisarlo directamente ahí en **Table Editor** si alguna vez lo necesitas.

## Paso 7 — Usuarios y roles (Supabase Auth)

La app ya usa inicio de sesión real (correo + contraseña) en vez de un PIN, con dos roles: `admin` y `colaborador`. Solo un admin ve el módulo "Usuarios" y puede invitar gente nueva.

1. **Correr el segundo SQL**: en el SQL Editor de Supabase, corre `sql/auth-and-users.sql` (después de `schema.sql`). Esto crea las tablas `roles` y `perfiles`, y cierra el acceso público que había antes — a partir de aquí solo usuarios con sesión iniciada y activos pueden leer o escribir datos.

2. **Crear la Edge Function** (para el botón "Agregar usuario"):
   - En el Dashboard de Supabase, ve a **Edge Functions** → **Deploy a new function** → **Via Editor**.
   - Nómbrala exactamente `create-user`.
   - Borra el código de ejemplo y pega todo el contenido de `supabase-edge-function-create-user.ts` (en esta misma carpeta).
   - Clic en **Deploy**.

3. **Crear tu primer usuario administrador** (el primero tiene que crearse a mano, porque el botón "Agregar usuario" solo funciona si ya existe un admin):
   - En Supabase → **Authentication** → **Users** → **Add user** → **Create new user**. Ponle tu correo y una contraseña.
   - Copia el **UUID** de ese usuario (aparece en la lista).
   - En **Table Editor** → tabla `roles`, copia el `id` de la fila `admin`.
   - En **Table Editor** → tabla `perfiles` → **Insert row**, y llena:
     - `user_id`: el UUID que copiaste
     - `nombre`: tu nombre
     - `email`: tu correo (el mismo que usaste arriba)
     - `rol_id`: el id de `admin` que copiaste
     - `activo`: `true`
   - Guarda.

4. Abre la app y entra con ese correo y contraseña. Desde ahí ya puedes usar el módulo "Usuarios" para invitar a los demás — a ellos sí les va a llegar un correo para que creen su propia contraseña.

**Nota sobre los correos de invitación**: Supabase incluye un servicio de correo gratuito para pruebas, con un límite bajo de envíos por hora — suficiente para invitar colaboradores ocasionalmente. Si en algún momento las invitaciones dejan de llegar (o llegan a spam), en Supabase → **Authentication** → **Providers** → **SMTP Settings** se puede configurar un correo propio (ej. Gmail, o el de la parroquia) para enviar esas invitaciones sin límites.

## Nota sobre seguridad

Ahora que la app usa Supabase Auth, la seguridad ya no depende de "que no sepan el enlace" — cada tabla está protegida a nivel de base de datos (Row Level Security): solo usuarios con sesión iniciada y marcados como activos pueden leer o escribir, y solo un admin puede gestionar usuarios y roles. Desactivar a alguien desde el módulo de Usuarios le bloquea el acceso de inmediato, sin necesidad de borrar su cuenta.

## Estructura de archivos

```
directorio-parroquial/
├── index.html                              → estructura de la página
├── css/styles.css                          → estilos visuales
├── js/config.js                            → tus credenciales de Supabase (edítalo)
├── js/app.js                               → toda la lógica de la app
├── sql/schema.sql                          → tablas principales del CRM
├── sql/auth-and-users.sql                  → tablas de usuarios/roles + seguridad
├── supabase-edge-function-create-user.ts   → código para la Edge Function "create-user"
└── README.md                               → este archivo
```
