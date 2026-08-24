# Descargar y usar Sismi en Windows

## Descarga rápida

1. Entra a la [última versión publicada](https://github.com/Alejooc/sismi/releases/latest).
2. En **Assets**, descarga el instalador `Sismi_<versión>_x64-setup.exe`.
3. Ejecuta el instalador y elige dónde quieres instalar Sismi.
4. Abre Sismi desde el acceso directo o desde el menú Inicio.

El instalador crea los accesos necesarios y permite que Sismi reciba actualizaciones desde la propia aplicación.

## Primera ejecución

Al abrirse, Sismi se ubica cerca de la esquina inferior derecha y deja su icono en la bandeja del sistema.

- Clic izquierdo en el icono: mostrar u ocultar el panel.
- Clic derecho en el icono: abrir Sismi, ocultarlo o salir.
- Botón de minimizar: ocultar el panel y mantener el monitoreo activo.

Para recibir notificaciones del sistema, entra en **Configuración → Alertas** y usa **Probar alerta de sismo**. Si Windows bloquea los avisos, revisa **Configuración de Windows → Sistema → Notificaciones** y habilita las notificaciones para Sismi.

## Actualizar Sismi

Desde la app abre **Configuración → Acerca de Sismi → Actualizaciones** y pulsa **Buscar actualizaciones**. Si hay una nueva versión, Sismi la descargará e instalará al reiniciar.

## Requisitos

- Windows 10 u 11.
- WebView2, normalmente incluido en Windows moderno.
- Conexión a internet para consultar las fuentes sísmicas y buscar ubicaciones.

## Desinstalar

Usa **Configuración de Windows → Aplicaciones → Aplicaciones instaladas → Sismi → Desinstalar**. Tus preferencias locales pueden permanecer en el perfil de la aplicación de Windows.

## Compilar desde el código fuente

Consulta el [README principal](../README.md) para instalar Node.js, Rust y las herramientas necesarias. El comando de compilación es:

```powershell
npm install
npm run desktop:build
```

El instalador se encuentra en `src-tauri/target/release/bundle/nsis/`.
