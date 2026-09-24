# Avisos remotos de Sismi para Android

## Cómo funciona

El monitor de Ubuntu consulta USGS y SGC, y mantiene una conexión de detección rápida con EMSC. Compara los nuevos eventos con las reglas guardadas por cada teléfono y envía solo los avisos que coinciden mediante Firebase Cloud Messaging (FCM). Firebase transporta el mensaje; **el monitor y sus datos se ejecutan en tu servidor Ubuntu**.

La primera consulta crea una referencia de eventos existentes y no envía una avalancha de sismos antiguos. Los eventos se filtran por magnitud, fuente, alcance, radio, No molestar y horario silencioso. Los eventos equivalentes publicados por distintas agencias se agrupan para reducir duplicados. USGS y SGC se consultan como fuentes de catálogo; EMSC se usa para detección rápida. La disponibilidad y la demora siguen dependiendo de cada fuente, de la conexión y de Android.

Valores iniciales: EMSC mantiene una conexión en vivo con reconexión automática; USGS se consulta cada 45 segundos y SGC cada 90 segundos. Si el catálogo SGC no responde, el monitor recurre a su feed alternativo. Se descartan avisos cuyo sismo tenga más de 10 minutos al momento de detectarlo para evitar notificaciones tardías; ese límite se puede ajustar en el servidor.

El proceso guarda en un archivo local las preferencias de los dispositivos y sus identificadores de instalación Firebase (FID), necesarios para enviarles avisos. Mantén ese archivo y la cuenta de servicio fuera de Git y con permisos privados. Si el teléfono está en **Mi zona**, Sismi comparte con el monitor coordenadas redondeadas a dos decimales y el radio. En **Todo el mundo**, no envía coordenadas.

## Preparar Firebase una sola vez

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/) y habilita Firebase Cloud Messaging.
2. Registra una aplicación Android con el identificador `com.sismi.android`.
3. Descarga `google-services.json` y colócalo en `android/app/google-services.json`. Ese archivo está excluido de Git.
4. En Google Cloud, crea una cuenta de servicio exclusiva para el monitor y asígnale el permiso de administrador de Firebase Cloud Messaging. Descarga la clave JSON solo al servidor Ubuntu; nunca la agregues al repositorio ni la pegues en el chat.
5. Conserva el ID del proyecto y reconstruye el APK Android. Los teléfonos deben instalar esta versión para que puedan recibir push.

La aplicación final ya incluye `https://alertassismi.jaofy.com` como servidor de avisos. Después de aceptar el permiso de notificaciones, Sismi obtiene el token de Firebase y registra el teléfono automáticamente. El cliente no tiene que escribir una URL ni un código de vinculación.

Guías oficiales: [configurar Firebase Admin SDK en Node.js](https://firebase.google.com/docs/admin/setup), [recibir mensajes en Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages?hl=es) y [enviar mediante Admin SDK](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk).

## Servidor Ubuntu con Docker y Nginx Proxy Manager

La entrega recomendada es el contenedor de `server/`: no publica el puerto 8787 en el host. El servicio y Nginx Proxy Manager deben compartir una red Docker; NPM termina HTTPS y reenvía internamente a `sismi-monitor:8787`. Necesitas un dominio cuyo DNS apunte al servidor, puertos 80/443 dirigidos a NPM, Docker Compose y el proyecto Firebase configurado.

### 1. Identifica la red de NPM

En Ubuntu, encuentra el nombre del contenedor de NPM y mira las redes a las que está conectado:

```sh
docker ps --format 'table {{.Names}}\t{{.Image}}'
docker inspect --format '{{json .NetworkSettings.Networks}}' NOMBRE_DEL_CONTENEDOR_NPM
```

Usa una de esas redes en los pasos siguientes. No supongas que se llama `npm_proxy`: el nombre real depende de cómo instalaste NPM.

### 2. Prepara los archivos y secretos

Copia la carpeta `server/` del repositorio a `/opt/sismi/server` en Ubuntu. Desde esa carpeta:

```sh
cp .env.example .env
mkdir -p secrets
chmod 700 secrets
```

Edita `.env` y cambia `FIREBASE_PROJECT_ID` por el ID real del proyecto, `PAIRING_CODE` por un secreto nuevo y `NPM_DOCKER_NETWORK` por la red encontrada arriba. Genera un código de vinculación con `openssl rand -hex 32` directamente en el servidor; no uses el valor de ejemplo ni lo compartas por chat.

Copia la clave JSON de la cuenta de servicio a `secrets/firebase-service-account.json`. El archivo debe poder leerse dentro del contenedor por el usuario 10001 y quedar privado en el host:

```sh
sudo install -o 10001 -g 10001 -m 0400 /RUTA/SEGURA/firebase-service-account.json secrets/firebase-service-account.json
```

No subas `.env` ni `secrets/` al repositorio. Ambos están excluidos de Git y de la imagen Docker.

### 3. Inicia el monitor

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 sismi-monitor
```

Espera a que Docker indique el estado `healthy`. No se debe añadir un mapeo `ports:` ni abrir el puerto 8787 en el firewall. Los registros de estado de los teléfonos quedan en el volumen `sismi-monitor-data`, que persiste aunque recrees el contenedor. **No uses `docker compose down -v`** salvo que quieras borrar esos datos.

### 4. Crea el Proxy Host en Nginx Proxy Manager

En **Hosts → Proxy Hosts → Add Proxy Host**, configura:

- **Domain Names:** tu dominio, por ejemplo `alertas.tudominio.com`.
- **Scheme:** `http`.
- **Forward Hostname / IP:** `sismi-monitor`.
- **Forward Port:** `8787`.
- **Websockets Support:** desactivado; este servicio no lo necesita.
- **Block Common Exploits:** activado.

En **SSL**, solicita el certificado de Let's Encrypt y activa **Force SSL** y **HTTP/2 Support**. NPM y el servicio tienen que estar conectados a la red compartida indicada en `.env`. Si el formulario no resuelve `sismi-monitor`, revisa la red y que el contenedor esté activo.

Prueba `https://tu-dominio/healthz`: debe responder JSON con `ok: true` y los estados de USGS, SGC y EMSC. La aplicación Android debe tener el `google-services.json` del mismo proyecto Firebase. Al abrir la versión actual y aceptar notificaciones, prueba **Probar aviso remoto** desde Configuración; la vinculación se completa sola.

### Actualizar el monitor

Cuando cambie el código, copia la versión nueva de `server/` al servidor y ejecuta `docker compose up -d --build`. Docker recreará el contenedor conservando el volumen de datos. Para una actualización con Git, puedes actualizar el repositorio en Ubuntu y reconstruir desde la carpeta `server/`; protege los cambios locales de `.env` y `secrets/`.

## Alternativa sin Docker: systemd y Caddy

Si no usas Nginx Proxy Manager, también se puede instalar Node.js 22+ y correr el proceso como servicio systemd. Copia la clave a `/etc/sismi-monitor/firebase-service-account.json` (propietario `root:sismi-monitor`, permisos `0640`) y define en `/etc/sismi-monitor/sismi.env` `HOST=127.0.0.1`, el ID real de Firebase, la ruta de esa clave y un `PAIRING_CODE` generado con `openssl rand -hex 32`. Luego instala `server/deploy/sismi-monitor.service`, recarga systemd y habilita el servicio. `server/deploy/Caddyfile.example` documenta el proxy HTTPS a `127.0.0.1:8787`.

## Endpoints del servicio

- `GET /healthz`: estado de las fuentes, sin tokens ni datos de ubicación.
- `POST /api/devices/register`: vincula un teléfono con el código privado; devuelve una credencial propia del dispositivo.
- `POST /api/devices/auto-register`: registra automáticamente una instalación Android y aplica límites de solicitudes por IP e instalación.
- `PATCH /api/devices/{installationId}`: actualiza filtros e identificador Firebase con esa credencial.
- `POST /api/devices/{installationId}/test`: manda un aviso de prueba.
- `DELETE /api/devices/{installationId}`: desvincula el teléfono.

El código privado queda reservado para la ruta administrativa de vinculación manual. La app de cliente usa el registro automático, limitado por IP e instalación. Cada teléfono recibe una sesión aleatoria distinta; la app la cifra en Android Keystore y el servidor conserva su hash. Los identificadores FID y tokens FCM se guardan en el archivo de estado local porque el monitor los necesita para enviar mensajes.

## Límites y operación

- Firebase indica que Cloud Messaging no tiene costo; el servidor Ubuntu, dominio, electricidad y conectividad pueden tener costos. Consulta los [precios vigentes de Firebase](https://firebase.google.com/pricing) si luego agregamos otros servicios.
- No prometas un tiempo fijo de alerta: EMSC, SGC y USGS publican con retrasos distintos; FCM y Android pueden aplazar entregas por batería, conectividad o restricciones del sistema.
- Haz copias cifradas de `/var/lib/sismi-monitor/state.json`; incluye registros de dispositivos y tokens.
- Si se filtra el código de vinculación, cámbialo en el archivo de entorno y reinicia el servicio. Revoca una clave de cuenta de servicio expuesta desde Google Cloud.
- Esta función no sustituye los avisos de protección civil ni garantiza detección previa o alerta temprana.
