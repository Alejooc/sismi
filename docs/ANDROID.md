# Sismi para Android

Sismi tendrá dos aplicaciones que se mantienen y publican por separado:

- **Windows:** React + Tauri; conserva su panel pequeño, bandeja, instalador y actualizador.
- **Android:** Kotlin nativo con Jetpack Compose, dentro de `android/`.

La versión Android no reemplaza ni convierte la de Windows. Por ahora cada una tiene su interfaz; ambas consultan las mismas fuentes públicas y aplican criterios equivalentes para eventos y alertas.

## Estado

La primera versión nativa ya compila, se instaló en el emulador Pixel 6 / Android 16 y consultó registros de SGC y USGS. También abrió la conexión de detección rápida de EMSC. El APK es de desarrollo y no está firmado para distribución.

Incluye actualmente:

- Resumen, Historial, Mapa OpenStreetMap y ficha del sismo con mapa del epicentro.
- Agrupación de eventos cercanos en el mapa; al tocar un grupo se abre su lista.
- Filtros de mapa por magnitud, fuente y periodo; controles táctiles de zoom y desplazamiento.
- Alcance **Mi zona** o **Todo el mundo**, ubicación por búsqueda de ciudad o permiso de ubicación actual, y radio configurable.
- Caché local de eventos para consultar los últimos datos cargados sin conexión.
- Preferencias de tema, umbral de magnitud, fuente, máximo de avisos, sonido, horario silencioso y **No molestar**.
- Modo seguridad, números de emergencia de Colombia y prueba de notificación del sistema.
- Consulta local de SGC y USGS cada 45 segundos mientras la app está en primer plano; canal de eventos de EMSC mientras está abierta.
- Vinculación opcional a un monitor central en Ubuntu para recibir avisos con la app cerrada; requiere configuración externa de Firebase y HTTPS.

Pendiente antes de llamarla versión de uso diario: probarla en un teléfono real; completar recorridos de ubicación, búsqueda, detalle, filtros, permisos y rotación; validar agrupación y zoom del mapa en distintas pantallas; medir estabilidad y consumo; revisar accesibilidad y texto ampliado; y firmar una versión de prueba.

### Alcance de las alertas

El proyecto ya incluye el monitor para Ubuntu y la integración Android con Firebase Cloud Messaging. La entrega real queda pendiente de configurar Firebase, desplegar el monitor en un servidor Ubuntu accesible mediante HTTPS y vincular el teléfono desde Configuración. Consulta [la guía de alertas remotas](ANDROID_REMOTE_ALERTS.md). Sin esa configuración, siguen funcionando las alertas locales mientras Sismi está abierta. La demora depende de las fuentes, la conexión y Android; Sismi no reemplaza los avisos oficiales.

## Abrir y compilar

Abre la carpeta `android/` desde Android Studio. El identificador de prueba es `com.sismi.android`; el nivel mínimo es Android 8.0 (API 26) y el proyecto compila contra API 36.

Para compilar desde PowerShell, usa JDK 21 y el SDK instalado:

```powershell
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\SismiBuildTools\microsoft-jdk-21.0.12.1"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

./gradlew.bat assembleDebug
```

Desde la raíz del repositorio también están disponibles:

```powershell
npm run android:apk      # compila APK debug
npm run android:install  # instala en un emulador o teléfono conectado
npm run android:test     # ejecuta pruebas unitarias
npm run android:aab      # prepara el bundle release sin clave de publicación
```

El APK de desarrollo se genera en `android/app/build/outputs/apk/debug/app-debug.apk`. Para instalarlo manualmente:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Si Android Studio usa otro JDK, selecciona JDK 21 en **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK**. No incluyas `local.properties`, claves de firma, contraseñas ni archivos de servicio de Firebase en Git.

## Datos, ubicación y privacidad

- **SGC:** catálogo de eventos de Colombia; si falla, Sismi prueba el feed alternativo.
- **USGS:** feed global de eventos del día.
- **EMSC:** canal WebSocket de detección rápida mientras la aplicación está abierta.
- **Lugares:** Open-Meteo Geocoding.
- **Mapa:** teselas de OpenStreetMap; cargar el mapa requiere conexión.
- La ubicación automática solo se consulta después de tocar **Usar mi ubicación** y conceder permiso. De forma predeterminada se conserva localmente. Si vinculas el monitor y eliges **Mi zona**, se envían coordenadas aproximadas y el radio a tu servidor Ubuntu para filtrar los avisos; en **Todo el mundo** no se comparte la ubicación.
- El Modo seguridad y los últimos eventos cargados quedan disponibles localmente; el mapa y las búsquedas en línea requieren conexión.

## Publicación futura

1. Elegir y reservar el identificador definitivo antes de publicar en Google Play.
2. Probar el APK en varios teléfonos y versiones de Android, incluidos ahorro de batería, permisos denegados y conectividad intermitente.
3. Configurar y desplegar el monitor remoto descrito en [la guía de alertas](ANDROID_REMOTE_ALERTS.md), y probar avisos con la app cerrada antes de ofrecerlos a otras personas.
4. Crear una clave de carga protegida fuera del repositorio y configurar Play App Signing.
5. Actualizar `versionCode`, preparar un AAB firmado, política de privacidad, ficha y pruebas internas de Google Play.

Windows mantiene su propio número de versión, instalador, actualizador y flujo de publicación. Los comandos antiguos de Tauri para Android se conservan con prefijo `tauri:android:` solo para el prototipo; no generan la nueva app nativa.
