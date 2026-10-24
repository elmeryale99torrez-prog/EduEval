# Estado inicial y alcance de EduEval

## Inspección

El repositorio contenía `APP DE JUEGO`, `ECOLIDERAZGO_CODEX_PACKAGE`, `ECOLIDERAZGO_CODEX_CLOUD_CONTINUATION` y varios HTML/documentos de Ecoliderazgo. No se modifican esos directorios ni sus archivos. EduEval vive en esta carpeta independiente.

## Estructura mínima

```text
EduEval/
  src/App.tsx        # MVP de interfaz, roles, biblioteca, salas, revisión y resultados
  src/lib/activityEngine.ts      # respuestas tipadas, evaluación y puntuación
  src/lib/activityEngine.test.ts # pruebas automatizadas del motor
  src/index.css      # sistema visual responsive
  public/manifest.webmanifest
  .env.example       # variables Supabase, sin secretos
  docs/ESTADO_REPOSITORIO.md
```

## Estado técnico

- Modo demo local activo cuando faltan `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`; la interfaz lo señala explícitamente.
- Persistencia de actividades y salas mediante `localStorage` para demostración.
- Supabase está conectado para sesión, perfiles y autorización inicial; las vistas de salas, respuestas y resultados todavía conservan una copia local.
- Exportación CSV con BOM UTF-8 y separador `;`, compatible con Excel.
- Las respuestas muestran retroalimentación sin revelar la opción correcta.
- Los resultados están en una vista docente privada de la interfaz demo.
- Las seis actividades están representadas en la biblioteca; clasificación y ordenamiento usan arrastrar y soltar.
- Las salas incluyen selector de tiempo opcional y no tienen estado de pausa.
- El cliente Supabase opcional y la pantalla de autenticación para docente/administrador ya están preparados; los estudiantes siguen usando código de sala.
- Existe un proyecto Supabase de desarrollo `EvaluEdu` en `sa-east-1`; sus variables están en `.env.local` y el proyecto remoto está operativo.
- El proyecto remoto ya contiene el esquema inicial con RLS para perfiles, plantillas, actividades, salas, participantes, intentos, respuestas y auditoría. La gestión de migraciones remotas registra `initial_core_schema` e `index_foreign_keys`.
- Realtime, sincronización multi-dispositivo y conexión de las vistas existentes a todas las tablas todavía están pendientes.
- La primera conexión de perfiles ya está implementada: se consulta `profiles`, se crea el perfil docente de primer ingreso y se bloquea el acceso administrativo sin rol persistido.
- La verificación de rol valida pertenencia al usuario autenticado, valores permitidos y coincidencia entre el rol seleccionado y el panel solicitado; los errores de consulta detienen el acceso protegido.
- Las vistas internas están restringidas por rol y la acción administrativa de invitar docentes exige `admin` tanto en la interfaz como en la Edge Function.
- Plantillas y actividades se cargan y guardan en Supabase para el usuario autenticado; `localStorage` permanece como respaldo temporal cuando la sincronización falla.
- El panel administrativo ya puede invitar docentes mediante la Edge Function protegida `admin-invite-teacher`; el listado real y la suspensión todavía no están conectados.
- El registro público de docente/administrador fue retirado de la interfaz y el alta pública está desactivada en Authentication > Providers; la primera cuenta Auth ya quedó asociada al rol `admin`.
- La primera cuenta administrativa ya fue verificada y vinculada en Supabase: `elmeryaletorrez@gmail.com` → `admin`.
- El registro público de usuarios está desactivado en Supabase; el acceso de docentes se gestiona mediante invitaciones administrativas.

## Verificación MVP

```powershell
cd EduEval
npm install
npm run build
npm run test
npm run dev
```

Prueba manual responsive: abrir en ancho móvil y escritorio, alternar roles, entrar como estudiante con `ECO-274`, crear una actividad, revisar/publicar una propuesta, crear una sala y exportar resultados.
