# Historial de versiones

## [0.1.11] — 2026-08-24

### Datos del SGC

- La aplicación de escritorio consulta el catálogo actualizado del Servicio Geológico Colombiano.
- El historial incluye los registros más recientes del día y recorre todas las páginas disponibles del catálogo.
- Se conserva el resumen anterior como respaldo para la vista web de desarrollo.

## [0.1.10] — 2026-08-24

### Ubicaciones

- La búsqueda de un país activa una cobertura nacional en lugar de tratarlo como una ciudad.
- Ahora se muestra claramente cuando el historial y los avisos cubren todo el país seleccionado.

## [0.1.9] — 2026-08-24

### Correcciones

- El historial se actualiza al cambiar la ciudad o la ubicación del equipo.
- Al cambiar de ubicación, la vista pasa a “Mi zona” y limpia la búsqueda anterior.
- Se evita conservar registros antiguos cuando una fuente responde sin eventos.
- Las consultas a las fuentes incluyen una marca nueva para evitar respuestas almacenadas.

## [0.1.8] — 2026-08-24

### Actualizaciones

- Aviso dentro de Sismi cuando hay una nueva versión disponible.
- Notificación de Windows para informar que puede descargarse.
- Botón de descarga con estado de progreso durante la instalación.

## [0.1.7] — 2026-08-24

### Texto de la aplicación

- Mensajes, botones y estados revisados para usar lenguaje claro y natural para clientes finales.
- Ajustes en configuración, alertas, ubicación, historial, mapa, detalles y sección Acerca de Sismi.

## [0.1.6] — 2026-08-24

### Corrección visual

- Se evita la saturación del globo: los números permanentes se muestran solo para magnitudes 3.0 o superiores.
- Los eventos menores siguen visibles y muestran su información completa al tocar el marcador.

## [0.1.5] — 2026-08-24

### Visualización

- Cada marcador del globo muestra ahora su magnitud junto al punto (`1.1`, `5.2`, `7.2`, etc.).
- Etiquetas pequeñas y suaves para conservar legibilidad al acercar.

## [0.1.4] — 2026-08-24

### Mejoras visuales

- Marcadores del globo mundial más pequeños, suaves y verdes, sin puntos naranjas dominantes.
- Ondas de propagación limitadas a eventos de magnitud 3 o superior para reducir ruido visual.
- Etiquetas de ciudades y ubicación ajustadas para acercamientos prácticos.

## [0.1.3] — 2026-08-24

### Correcciones

- La actividad reciente de “Ahora” respeta el alcance seleccionado y solo muestra eventos de las últimas 24 horas.
- El historial ahora filtra correctamente entre “Mi zona” y “Todo el mundo”, con selector visible y búsqueda sobre el resultado filtrado.
- El detalle del evento mejora la inicialización del mapa, reajusta su tamaño al abrirse y utiliza una fuente alternativa de teselas si la principal no responde.

## [0.1.2] — 2026-08-24

### Mejoras

- Actualizaciones automáticas desde GitHub Releases.
- Botón **Buscar actualizaciones** en **Acerca de Sismi**.
- Instalador NSIS firmado para Windows.
- Publicación automática de instaladores, firmas y `latest.json` mediante GitHub Actions.

## [0.1.1] — 2026-08-21

### Mejoras

- Consulta automática de las fuentes cada 30 segundos.
- Información separada entre la hora en que ocurrió el sismo y la hora en que Sismi lo detectó.
- Cálculo aproximado del retraso de publicación visible en los detalles del evento.
- Notificaciones con la hora de detección para facilitar la verificación.

## [0.1.0] — 2026-08-21

Primera versión pública de Sismi para Windows.

### Incluye

- Panel flotante anclado a la esquina inferior derecha.
- Icono de Sismi en la bandeja del sistema y menú contextual.
- Monitoreo combinado de SGC y USGS.
- Historial sísmico con búsqueda local.
- Alertas configurables para **Mi zona** o **Todo el mundo**.
- Ubicación manual mediante búsqueda de ciudades y ubicación automática con permiso.
- Alertas visuales, sonido de aviso y notificaciones nativas de Windows.
- Prevención de alertas repetidas y de eventos antiguos detectados fuera de tiempo.
- Modo claro y modo oscuro.
- Globo terráqueo interactivo con zoom, rotación, países, ciudades y ondas de magnitud.
- Vista detallada del evento con datos disponibles, mapa y metadatos.
- Pantalla de inicio con logo y panel **Acerca de Sismi**.
- Compilación portable para Windows sin ventana CMD.

### Fuentes

- Servicio Geológico Colombiano (SGC).
- USGS Earthquake Hazards Program.
- Open-Meteo Geocoding API.
