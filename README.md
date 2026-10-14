# LA MANSION — entradas QR para fiesta

Web responsive con estética Halloween, inicio de sesión, generación de QR, escaneo con cámara, validación manual, registro de entradas y estadísticas compartidas entre dispositivos conectados al mismo servidor.

## Acceso inicial
- Usuario: `MANSSION`
- Contraseña: `2020`

## Ejecutar en tu ordenador
Necesitas Node.js 20 o posterior.

1. Descomprime el proyecto.
2. Entra en la carpeta del proyecto.
3. Ejecuta `npm install`
4. Copia `.env.example` a `.env`.
5. Cambia `SESSION_SECRET` por una cadena larga y aleatoria.
6. Ejecuta `npm start`
7. Abre `http://localhost:3000`

## Para usarlo desde varios móviles
Publica esta aplicación en un hosting que ejecute Node.js y conserve el archivo SQLite entre reinicios. Configura las variables de entorno `LOGIN_USER`, `LOGIN_PASSWORD`, `SESSION_SECRET` y `NODE_ENV=production`. Usa HTTPS para permitir el escáner de cámara. Todos los móviles deben abrir la misma URL pública; no sirve abrir el HTML localmente en cada dispositivo.

La base de datos y la validación están en el servidor. La actualización condicional de cada entrada evita que dos móviles acepten simultáneamente el mismo QR.

## Seguridad importante
Las credenciales iniciales se han puesto tal como se solicitaron. Antes de publicar el sitio, configura `SESSION_SECRET` y considera cambiar la contraseña por una más fuerte. Usa HTTPS y un hosting privado/confiable. Este proyecto usa sesiones en memoria, por lo que al reiniciar el servidor las sesiones activas se cerrarán; las entradas sí quedan en SQLite. Para despliegues con varias instancias de servidor, cambia la sesión en memoria por un almacén compartido y la base de datos por una base compartida.
