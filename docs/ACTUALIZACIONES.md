# Actualizaciones automáticas de Sismi

Sismi usa el actualizador nativo de Tauri y GitHub Releases. La aplicación consulta `latest.json`, valida la firma del instalador y permite descargar la nueva versión desde **Acerca de Sismi → Actualizaciones**.

## Publicar una nueva versión

1. Actualiza la versión en `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
2. Actualiza `CHANGELOG.md`.
3. Crea un commit y una etiqueta con el mismo número, por ejemplo `v0.1.3`.
4. Sube la etiqueta a GitHub.

El workflow `.github/workflows/build-windows.yml` crea el instalador NSIS, sus firmas y `latest.json`, y los publica en la Release correspondiente.

## Secretos de GitHub

El workflow necesita estos secretos en `Alejooc/sismi → Settings → Secrets and variables → Actions`:

- `TAURI_SIGNING_PRIVATE_KEY`: contenido completo de la clave privada de firma.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: contraseña de esa clave. Si la clave se generó sin contraseña, el valor puede quedar vacío.

La clave privada nunca debe subirse al repositorio ni escribirse en este documento. La clave pública sí está incluida en `src-tauri/tauri.conf.json` y no es secreta.

## Crear la clave de firma

Si necesitas crear otra clave antes de publicar la primera actualización:

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\sismi.key"
```

Conserva la clave privada y su contraseña en un lugar seguro. Si se pierde, las instalaciones existentes no podrán validar futuras actualizaciones.
