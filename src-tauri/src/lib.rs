use reqwest::Client;
use serde_json::Value;
use std::time::Duration;
#[cfg(mobile)]
use tauri::Manager;
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, WindowEvent,
};

#[cfg(windows)]
const WINDOWS_NOTIFICATION_APP_ID: &str = "com.sismi.desktop";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            send_sismi_notification,
            fetch_sgc_events,
            fetch_usgs_events,
            get_start_with_windows,
            set_start_with_windows
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;

                let window = app
                    .get_webview_window("main")
                    .expect("No se encontró la ventana principal de Sismi");
                let start_hidden = std::env::args().any(|argument| argument == "--minimized");
                position_bottom_right(&window)?;
                if !start_hidden {
                    show_window(&window);
                }

                let open_item = MenuItem::with_id(app, "open", "Abrir Sismi", true, None::<&str>)?;
                let summary_item =
                    MenuItem::with_id(app, "summary", "Abrir Resumen", true, None::<&str>)?;
                let refresh_item =
                    MenuItem::with_id(app, "refresh", "Actualizar datos", true, None::<&str>)?;
                let toggle_alerts_item = MenuItem::with_id(
                    app,
                    "toggle-alerts",
                    "Activar / pausar avisos",
                    true,
                    None::<&str>,
                )?;
                let hide_item = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
                let separator = PredefinedMenuItem::separator(app)?;
                let quit_item =
                    MenuItem::with_id(app, "quit", "Salir de Sismi", true, None::<&str>)?;
                let menu = Menu::with_items(
                    app,
                    &[
                        &open_item,
                        &summary_item,
                        &refresh_item,
                        &toggle_alerts_item,
                        &separator,
                        &hide_item,
                        &quit_item,
                    ],
                )?;

                let tray_window = window.clone();
                let tray_icon = tauri::include_image!("./icons/32x32.png");

                TrayIconBuilder::with_id("sismi-tray")
                    .icon(tray_icon)
                    .tooltip("Sismi · Monitoreo sísmico")
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        if event.id() == "open" {
                            show_main_window(app);
                        } else if event.id() == "summary"
                            || event.id() == "refresh"
                            || event.id() == "toggle-alerts"
                        {
                            show_main_window(app);
                            let _ = app.emit("tray-action", event.id().as_ref());
                        } else if event.id() == "hide" {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        } else if event.id() == "quit" {
                            app.exit(0);
                        }
                    })
                    .on_tray_icon_event(move |_tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            show_window(&tray_window);
                        }
                    })
                    .build(app)?;
            }

            #[cfg(mobile)]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.on_window_event(|window, event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
        }
    });

    builder
        .run(tauri::generate_context!())
        .expect("error while running Sismi");
}

#[tauri::command]
fn send_sismi_notification(title: String, body: String, sound: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Duration, LoopableSound, Sound, Toast};
        use windows_registry::CURRENT_USER;

        let key = CURRENT_USER
            .create(format!(
                "SOFTWARE\\Classes\\AppUserModelId\\{WINDOWS_NOTIFICATION_APP_ID}"
            ))
            .map_err(|error| format!("No se pudo registrar Sismi en Windows: {error}"))?;
        key.set_string("DisplayName", "Sismi")
            .map_err(|error| format!("No se pudo registrar el nombre de Sismi: {error}"))?;

        Toast::new(WINDOWS_NOTIFICATION_APP_ID)
            .title(&title)
            .text1(&body)
            .duration(Duration::Long)
            .sound(if sound {
                Some(Sound::Single(LoopableSound::Alarm))
            } else {
                None
            })
            .show()
            .map_err(|error| format!("Windows no pudo mostrar el aviso: {error}"))?;
    }

    #[cfg(not(windows))]
    let _ = (title, body, sound);

    Ok(())
}

#[tauri::command]
#[allow(non_snake_case)]
async fn fetch_sgc_events(startDate: String, endDate: String) -> Result<Vec<Value>, String> {
    let _ = (startDate, endDate);
    let client = Client::builder()
        .user_agent("Sismi/0.1.27")
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|error| format!("No se pudo preparar la consulta de SGC: {error}"))?;
    fetch_sgc_archive_feed(&client).await
}

#[tauri::command]
async fn fetch_usgs_events() -> Result<Vec<Value>, String> {
    let client = Client::builder()
        .user_agent("Sismi/0.1.27")
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|error| format!("No se pudo preparar la consulta de USGS: {error}"))?;
    let payload = client
        .get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("No se pudo consultar USGS: {error}"))?
        .error_for_status()
        .map_err(|error| format!("USGS respondió con un error: {error}"))?
        .json::<Value>()
        .await
        .map_err(|error| format!("USGS devolvió una respuesta inválida: {error}"))?;

    Ok(payload
        .get("features")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

#[tauri::command]
fn get_start_with_windows() -> Result<bool, String> {
    #[cfg(windows)]
    {
        use windows_registry::CURRENT_USER;

        let key = match CURRENT_USER.open("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run") {
            Ok(key) => key,
            Err(_) => return Ok(false),
        };
        let configured_command = match key.get_string("Sismi") {
            Ok(command) => command,
            Err(_) => return Ok(false),
        };
        let executable = std::env::current_exe()
            .map_err(|error| format!("No se pudo localizar Sismi: {error}"))?
            .to_string_lossy()
            .to_string();

        return Ok(configured_command.contains(&executable));
    }

    #[cfg(not(windows))]
    Ok(false)
}

#[tauri::command]
fn set_start_with_windows(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows_registry::CURRENT_USER;

        let key = CURRENT_USER
            .create("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run")
            .map_err(|error| {
                format!("Windows no permitió cambiar el inicio automático: {error}")
            })?;

        if enabled {
            let executable = std::env::current_exe()
                .map_err(|error| format!("No se pudo localizar Sismi: {error}"))?;
            let command = format!("\"{}\" --minimized", executable.to_string_lossy());
            key.set_string("Sismi", command).map_err(|error| {
                format!("Windows no permitió activar el inicio automático: {error}")
            })?;
        } else if let Err(error) = key.remove_value("Sismi") {
            let _ = error;
        }
    }

    let _ = enabled;
    Ok(())
}

async fn fetch_sgc_archive_feed(client: &Client) -> Result<Vec<Value>, String> {
    let payload = client
        .get("https://archive.sgc.gov.co/feed/v1.0.1/summary/five_days_all.json")
        .header("Accept", "application/geo+json, application/json, text/plain, */*")
        .header("Referer", "https://www.sgc.gov.co/sismos")
        .header(
            "User-Agent",
            "Mozilla/5.0 (compatible; SismiMonitor/1.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|error| format!("No se pudo consultar el feed oficial SGC: {error}"))?
        .error_for_status()
        .map_err(|error| format!("Feed oficial SGC respondió con un error: {error}"))?
        .json::<Value>()
        .await
        .map_err(|error| format!("Feed oficial SGC devolvió una respuesta inválida: {error}"))?;

    Ok(payload
        .get("features")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

#[cfg(desktop)]
fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        show_window(&window);
    }
}

#[cfg(desktop)]
fn show_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = position_bottom_right(window);
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(desktop)]
fn position_bottom_right<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let window_size = window.outer_size()?;
    let right_margin = 12;
    let bottom_margin = 52;
    let x =
        monitor_position.x + monitor_size.width as i32 - window_size.width as i32 - right_margin;
    let y =
        monitor_position.y + monitor_size.height as i32 - window_size.height as i32 - bottom_margin;
    window.set_position(PhysicalPosition::new(
        x.max(monitor_position.x),
        y.max(monitor_position.y),
    ))?;
    Ok(())
}
