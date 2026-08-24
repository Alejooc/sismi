# Historial de versiones

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
