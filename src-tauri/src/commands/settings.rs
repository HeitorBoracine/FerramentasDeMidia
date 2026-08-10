use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Últimas pastas usadas nos diálogos de abrir/salvar, persistidas em
/// `%APPDATA%\<identifier>\config.json` — equivalente ao config.json que o
/// app Python original guardava em `%APPDATA%\RedutorDeVideo\`.
#[derive(Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub last_open_dir: Option<String>,
    pub last_save_dir: Option<String>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("config.json"))
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    let Ok(path) = settings_path(&app) else {
        return Settings::default();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::Settings;

    /// Garante que o formato bate com o tipo `Settings` em src/types/index.ts (camelCase).
    #[test]
    fn settings_wire_format() {
        let settings = Settings {
            last_open_dir: Some("C:\\videos".into()),
            last_save_dir: None,
        };
        assert_eq!(
            serde_json::to_string(&settings).unwrap(),
            r#"{"lastOpenDir":"C:\\videos","lastSaveDir":null}"#
        );
    }
}
