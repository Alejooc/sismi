use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WindowEvent,
};

#[cfg(windows)]
const WINDOWS_NOTIFICATION_APP_ID: &str = "com.sismi.desktop";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![send_sismi_notification])
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("No se encontró la ventana principal de Sismi");
            position_bottom_right(&window)?;

            let open_item = MenuItem::with_id(app, "open", "Abrir Sismi", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Salir de Sismi", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &hide_item, &separator, &quit_item])?;

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

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Sismi");
}

#[tauri::command]
fn send_sismi_notification(title: String, body: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{Duration, LoopableSound, Sound, Toast};
        use windows_registry::CURRENT_USER;

        let key = CURRENT_USER
            .create(format!("SOFTWARE\\Classes\\AppUserModelId\\{WINDOWS_NOTIFICATION_APP_ID}"))
            .map_err(|error| format!("No se pudo registrar Sismi en Windows: {error}"))?;
        key.set_string("DisplayName", "Sismi")
            .map_err(|error| format!("No se pudo registrar el nombre de Sismi: {error}"))?;

        Toast::new(WINDOWS_NOTIFICATION_APP_ID)
            .title(&title)
            .text1(&body)
            .duration(Duration::Long)
            .sound(Some(Sound::Single(LoopableSound::Alarm)))
            .show()
            .map_err(|error| format!("Windows no pudo mostrar el aviso: {error}"))?;
    }

    #[cfg(not(windows))]
    let _ = (title, body);

    Ok(())
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        show_window(&window);
    }
}

fn show_window<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let _ = position_bottom_right(window);
    let _ = window.show();
    let _ = window.set_focus();
}

fn position_bottom_right<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let window_size = window.outer_size()?;
    let right_margin = 12;
    let bottom_margin = 52;
    let x = monitor_position.x + monitor_size.width as i32 - window_size.width as i32 - right_margin;
    let y = monitor_position.y + monitor_size.height as i32 - window_size.height as i32 - bottom_margin;
    window.set_position(PhysicalPosition::new(x.max(monitor_position.x), y.max(monitor_position.y)))?;
    Ok(())
}
