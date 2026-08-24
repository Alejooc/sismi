import packageInfo from '../../package.json'
import { isDesktopApp } from './desktop'

export const APP_VERSION = packageInfo.version

export async function checkForSismiUpdate({ install = false, onProgress } = {}) {
  if (!isDesktopApp()) return { status: 'unsupported' }

  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check({ timeout: 15000 })

  if (!update) return { status: 'up-to-date' }
  if (!install) {
    return {
      status: 'available',
      version: update.version,
      notes: update.body || update.notes || '',
      date: update.date || update.pubDate || '',
    }
  }

  let downloaded = 0
  let contentLength = 0
  await update.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      contentLength = event.data.contentLength || 0
      onProgress?.({ downloaded: 0, contentLength, percent: 0 })
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength || 0
      const percent = contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : null
      onProgress?.({ downloaded, contentLength, percent })
    } else if (event.event === 'Finished') {
      onProgress?.({ downloaded: contentLength, contentLength, percent: 100 })
    }
  })

  const { relaunch } = await import('@tauri-apps/plugin-process')
  await relaunch()
  return { status: 'installed', version: update.version }
}
