# Descargar y usar Sismi en Windows

## Descarga rápida

1. Entra a la [última versión publicada](https://github.com/Alejooc/sismi/releases/latest).
2. En **Assets**, descarga `sismi.exe`.
3. Coloca el archivo en una carpeta permanente, por ejemplo `Documentos\Sismi`.
4. Haz doble clic para abrirlo.

Sismi es portable en esta etapa: no instala un asistente ni modifica carpetas del sistema. Para crear un acceso directo, haz clic derecho sobre `sismi.exe` y elige **Enviar a → Escritorio (crear acceso directo)**.

## Primera ejecución

Al abrirse, Sismi se ubica cerca de la esquina inferior derecha y deja su icono en la bandeja del sistema.

- Clic izquierdo en el icono: mostrar u ocultar el panel.
- Clic derecho en el icono: abrir Sismi, ocultarlo o salir.
- Botón de minimizar: ocultar el panel y mantener el monitoreo activo.

Para recibir notificaciones del sistema, entra en **Configuración → Alertas** y usa **Probar alerta de sismo**. Si Windows bloquea los avisos, revisa **Configuración de Windows → Sistema → Notificaciones** y habilita las notificaciones para Sismi.

## SmartScreen

La versión portable todavía no tiene firma digital. Windows puede mostrar un aviso de protección al abrirla por primera vez.

Si descargaste `sismi.exe` desde la sección oficial de Releases de este repositorio:

1. Selecciona **Más información**.
2. Comprueba que quieres abrir `sismi.exe`.
3. Selecciona **Ejecutar de todas formas**.

## Requisitos

- Windows 10 u 11.
- WebView2, normalmente incluido en Windows moderno.
- Conexión a internet para consultar las fuentes sísmicas y buscar ubicaciones.

## Desinstalar

Como es una versión portable, cierra Sismi, elimina el acceso directo y borra `sismi.exe`. Tus preferencias locales pueden permanecer en el perfil de la aplicación de Windows.

## Compilar desde el código fuente

Consulta el [README principal](../README.md) para instalar Node.js, Rust y las herramientas necesarias. El comando de compilación es:

```powershell
npm install
npm run desktop:build
```

El resultado se encuentra en `src-tauri/target/release/sismi.exe`.
