export function isDesktopApp() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__)
}

export async function fetchSgcCatalog(startDate, endDate, signal) {
  if (!isDesktopApp()) return null
  if (signal?.aborted) throw new DOMException('La consulta fue cancelada', 'AbortError')

  const { invoke } = await import('@tauri-apps/api/core')
  const events = await invoke('fetch_sgc_events', { startDate, endDate })

  if (signal?.aborted) throw new DOMException('La consulta fue cancelada', 'AbortError')
  return Array.isArray(events) ? events : []
}

export async function fetchUsgsFeed(signal) {
  if (!isDesktopApp()) return null
  if (signal?.aborted) throw new DOMException('La consulta fue cancelada', 'AbortError')

  const { invoke } = await import('@tauri-apps/api/core')
  const events = await invoke('fetch_usgs_events')

  if (signal?.aborted) throw new DOMException('La consulta fue cancelada', 'AbortError')
  return Array.isArray(events) ? events : []
}

export async function getStartWithWindows() {
  if (!isDesktopApp()) return false
  const { invoke } = await import('@tauri-apps/api/core')
  return Boolean(await invoke('get_start_with_windows'))
}

export async function setStartWithWindows(enabled) {
  if (!isDesktopApp()) return false
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('set_start_with_windows', { enabled: Boolean(enabled) })
  return true
}

export async function minimizeWindow() {
  if (!isDesktopApp()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().hide()
}

export async function closeWindow() {
  if (!isDesktopApp()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().hide()
}

export async function requestNotificationPermission() {
  // El aviso nativo registra su propia identidad de Windows al enviarse.
  // El plugin de permisos no reconoce correctamente el ejecutable portable.
  if (isDesktopApp()) return true

  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  return (await Notification.requestPermission()) === 'granted'
}

export async function notifyDesktop(payload) {
  if (isDesktopApp()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('send_sismi_notification', { title: payload.title, body: payload.body, sound: payload.sound !== false })
    return
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(payload.title, { body: payload.body, icon: '/sismi-logo.png', requireInteraction: true, tag: payload.tag || `sismi-alert-${Date.now()}` })
  }
}

export async function playAlertSound(profile = 'intense') {
  if (typeof window === 'undefined' || profile === 'silent') return
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    const context = new AudioContext()
    await context.resume()
    const start = context.currentTime
    const notes = profile === 'brief'
      ? [
        { at: 0, frequency: 880 },
        { at: 0.24, frequency: 1175 },
        { at: 0.48, frequency: 880 },
      ]
      : [
        { at: 0, frequency: 988 },
        { at: 0.18, frequency: 1319 },
        { at: 0.36, frequency: 988 },
        { at: 0.54, frequency: 1319 },
        { at: 1.02, frequency: 988 },
        { at: 1.2, frequency: 1319 },
        { at: 1.38, frequency: 988 },
        { at: 1.56, frequency: 1319 },
        { at: 2.04, frequency: 988 },
        { at: 2.22, frequency: 1319 },
        { at: 2.4, frequency: 988 },
        { at: 2.58, frequency: 1319 },
      ]
    const isBrief = profile === 'brief'
    notes.forEach(({ at, frequency }) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = isBrief ? 'sine' : 'square'
      oscillator.frequency.setValueAtTime(frequency, start + at)
      gain.gain.setValueAtTime(0.0001, start + at)
      gain.gain.exponentialRampToValueAtTime(isBrief ? 0.22 : 0.34, start + at + 0.018)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + at + (isBrief ? 0.18 : 0.14))
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start + at)
      oscillator.stop(start + at + (isBrief ? 0.2 : 0.15))
    })
    window.setTimeout(() => context.close(), isBrief ? 1200 : 3600)
  } catch {
    // El sonido es un refuerzo opcional; la alerta visual y la notificación continúan.
  }
}
