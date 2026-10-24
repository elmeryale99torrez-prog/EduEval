# Publicación de EvaluEdu PWA

## Estado

La versión inicial está publicada en [https://evaluedu.elmer-yale99-torrez.chatgpt.site](https://evaluedu.elmer-yale99-torrez.chatgpt.site). El hosting es público para permitir el acceso estudiantil por código de sala; los paneles protegidos no dependen de que la URL sea privada.

El bundle de producción se genera en `dist/` y contiene:

- `index.html` y los assets compilados de Vite.
- `manifest.webmanifest`.
- `sw.js`.
- `icon.svg` e `icon-maskable.svg`.

La aplicación debe publicarse como sitio estático con HTTPS. El servidor debe devolver `index.html` para las rutas de la aplicación y servir los archivos de `dist/` sin modificar sus nombres.

## Variables de compilación

Antes de ejecutar el build, el entorno de publicación debe tener estas variables públicas:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Nunca se debe configurar `service_role` en el frontend. Las variables `VITE_` quedan incluidas en el bundle y solo deben contener la URL y la clave publicable de Supabase.

## Comandos

```powershell
npm install
npm run test
npm run build
```

El contenido a publicar es exclusivamente la carpeta `dist/`.

## Configuración posterior en Supabase

La URL de producción que debe registrarse en Supabase Auth es:

```text
https://evaluedu.elmer-yale99-torrez.chatgpt.site
```

Actualizar en Supabase Auth:

1. `Site URL`: `https://evaluedu.elmer-yale99-torrez.chatgpt.site`.
2. `Redirect URLs`: la URL principal y la ruta de retorno de invitaciones si el proveedor la requiere.

La invitación docente usa el origen actual enviado por la aplicación, por lo que debe probarse una invitación nueva después de cambiar el dominio.

## Verificación móvil

1. Abrir la URL HTTPS desde Android o iPhone.
2. Completar la primera carga con conexión.
3. Confirmar que aparece `Instalar app` en navegadores compatibles.
4. En iPhone usar `Compartir → Añadir a pantalla de inicio`.
5. Abrir la aplicación instalada y comprobar que conserva el nombre EvaluEdu, el icono y la vista independiente.
6. Probar una sala con la computadora como docente y el móvil como estudiante.
7. Desconectar temporalmente la red y confirmar que la interfaz conserva el respaldo local; al volver la conexión debe mostrar `Sincronizado`.

## Límites conocidos

- El service worker cachea la carcasa y los assets, no respuestas privadas de Supabase.
- La instalación completa no funciona de forma confiable desde una IP LAN servida por HTTP; se requiere HTTPS o `localhost`.
- El dominio público debe quedar configurado en Supabase antes de probar invitaciones y sesiones docentes.
