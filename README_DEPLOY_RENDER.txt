LA MANSION — publicación con servidor y base de datos persistente

Este proyecto necesita un servicio Node.js. No se publica subiendo el ZIP a Netlify Drop.

Ruta recomendada desde iPhone:
1. Descarga y descomprime LA_MANSION_Web_QR_RENDER.zip en Archivos.
2. Crea un repositorio en GitHub y sube TODOS los archivos y carpetas del ZIP (incluido render.yaml). Puedes hacerlo desde Safari en github.com; GitHub puede ser más cómodo en modo escritorio.
3. Entra en https://dashboard.render.com/ y elige New > Blueprint, conecta GitHub y selecciona ese repositorio.
4. Render leerá render.yaml y configurará el servicio. Este archivo pide un servicio Starter con disco persistente; puede tener coste. Revisa el precio que Render muestre antes de confirmar.
5. Espera a que termine el despliegue y abre la URL *.onrender.com que Render muestre.
6. Acceso: usuario MANSSION, contraseña 2020.
7. Prueba crear un QR y validarlo; luego intenta validarlo otra vez. La segunda vez debe indicar que ya se usó.

Importante:
- No compartas el ZIP públicamente si quieres proteger el código/configuración.
- Comparte la URL de la web solo con el personal que deba validar entradas.
- El disco persistente mantiene las entradas entre reinicios/despliegues. El servicio puede tener coste; revisa el precio actual en Render antes de desplegar.
- No uses Netlify Drop para este ZIP: ese método no ejecuta directamente este servidor Express.
