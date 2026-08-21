// SPEC: editor-launch (EDITOR-02, EDITOR-04, EDITOR-05)
// SPEC: terminal-boot-loading (BOOT-01)
// SPEC: wsl-terminal-profile (WSLP-21)

//! Catálogo estático dos editores de código suportados, detecção de qual
//! deles está instalado, e a montagem do comando que abre uma pasta neles.
//!
//! Mesmo desenho de `agents::catalog`: o catálogo é a fonte única de
//! "quais editores existem", a detecção reaproveita
//! `agents::catalog::resolve_command_in_path` (não duplica a varredura de
//! PATH/PATHEXT), e o núcleo com regra (`build_open_command`) é separado do
//! efeito colateral (`open`) para ser testável sem abrir processo nenhum.
//!
//! EDITOR-05: só um id do catálogo lança alguma coisa. O frontend nunca
//! manda um programa — manda um id, e é este módulo que traduz id em
//! comando. Sem isso, `editor_open` seria execução arbitrária a partir da
//! camada de UI.

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::process::Command;

use crate::agents::catalog::{resolve_command_in_path, windows_pathext};

/// Uma entrada do catálogo: identidade estável + o CLI a resolver no PATH.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EditorDescriptor {
    /// Id estável, usado como chave no frontend (escolhe o glifo da marca) e
    /// como argumento de `editor_open`. Nunca muda depois de publicado.
    pub id: &'static str,
    pub name: &'static str,
    /// Nome do binário a resolver no PATH, sem extensão (a extensão é
    /// resolvida via `PATHEXT` no Windows).
    pub command: &'static str,
    /// SPEC: wsl-terminal-profile (WSLP-21) — `true` quando o editor aceita
    /// `--remote wsl+<distro>`, o que hoje quer dizer "é VS Code ou um fork
    /// dele". Uma coluna, e não um `match` por id: acrescentar editor
    /// continua sendo acrescentar uma linha no catálogo.
    pub wsl_remote: bool,
}

/// Resultado da detecção: o editor e o caminho onde o CLI dele resolveu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EditorStatus {
    pub editor: EditorDescriptor,
    pub path: PathBuf,
}

/// Catálogo estático. A ordem é a ordem de exibição no popover — as
/// variantes de VS Code primeiro por serem as mais comuns, JetBrains no fim
/// por serem as mais nichadas.
///
/// Acrescentar um editor é acrescentar uma linha aqui (mais o glifo em
/// `EditorMenu.tsx`); nunca um `match` por id em outro lugar.
pub const CATALOG: [EditorDescriptor; 11] = [
    EditorDescriptor {
        id: "vscode",
        name: "VS Code",
        command: "code",
        wsl_remote: true,
    },
    EditorDescriptor {
        id: "vscode-insiders",
        name: "VS Code Insiders",
        command: "code-insiders",
        wsl_remote: true,
    },
    EditorDescriptor {
        id: "cursor",
        name: "Cursor",
        command: "cursor",
        wsl_remote: true,
    },
    EditorDescriptor {
        id: "windsurf",
        name: "Windsurf",
        command: "windsurf",
        wsl_remote: true,
    },
    EditorDescriptor {
        id: "trae",
        name: "Trae",
        command: "trae",
        wsl_remote: true,
    },
    EditorDescriptor {
        id: "vscodium",
        name: "VSCodium",
        command: "codium",
        wsl_remote: true,
    },
    EditorDescriptor {
        id: "zed",
        name: "Zed",
        command: "zed",
        wsl_remote: false,
    },
    EditorDescriptor {
        id: "sublime",
        name: "Sublime Text",
        command: "subl",
        wsl_remote: false,
    },
    EditorDescriptor {
        id: "intellij",
        name: "IntelliJ IDEA",
        command: "idea",
        wsl_remote: false,
    },
    EditorDescriptor {
        id: "webstorm",
        name: "WebStorm",
        command: "webstorm",
        wsl_remote: false,
    },
    EditorDescriptor {
        id: "pycharm",
        name: "PyCharm",
        command: "pycharm",
        wsl_remote: false,
    },
];

/// A entrada do catálogo com esse id, se existir (EDITOR-05).
pub fn descriptor(id: &str) -> Option<&'static EditorDescriptor> {
    CATALOG.iter().find(|editor| editor.id == id)
}

/// Os editores do catálogo cujo CLI resolve no PATH atual do processo.
///
/// Nunca falha: um editor ausente simplesmente não entra na lista — o
/// popover mostra só o que dá para abrir de verdade (EDITOR-02).
///
/// ponytail: detecta só quem expõe CLI no PATH. Um VS Code instalado no
/// macOS sem "Shell Command: Install 'code' command in PATH" fica de fora.
/// Se isso incomodar, o upgrade é varrer os caminhos de instalação por
/// plataforma (`/Applications/*.app`, `%LOCALAPPDATA%\Programs`) antes de
/// cair no PATH — mesma assinatura, só mais candidatos.
pub fn detect_installed() -> Vec<EditorStatus> {
    let path_var = std::env::var("PATH").unwrap_or_default();
    let pathext = windows_pathext();

    detect_installed_with(&CATALOG, &path_var, pathext.as_deref())
}

/// Núcleo testável da detecção — recebe `PATH`/`PATHEXT` prontos, como
/// `agents::catalog::detect_installed_with`, para que o teste monte um PATH
/// temporário em vez de depender do que a máquina tem instalado.
fn detect_installed_with(
    catalog: &[EditorDescriptor],
    path_var: &str,
    pathext: Option<&str>,
) -> Vec<EditorStatus> {
    catalog
        .iter()
        .filter_map(|editor| {
            resolve_command_in_path(editor.command, path_var, pathext).map(|path| EditorStatus {
                editor: *editor,
                path,
            })
        })
        .collect()
}

/// `true` quando `program` é um script de shell do Windows (`.cmd`/`.bat`).
///
/// Importa porque `CreateProcess` — o que `std::process::Command` usa — não
/// executa script: `code.cmd` (a forma como o VS Code e derivados aparecem
/// no PATH do Windows) precisa ir por `cmd.exe /C`.
fn is_windows_script(program: &Path) -> bool {
    program
        .extension()
        .and_then(OsStr::to_str)
        .is_some_and(|ext| ext.eq_ignore_ascii_case("cmd") || ext.eq_ignore_ascii_case("bat"))
}

/// Os argumentos que dizem ao editor *qual pasta* abrir.
///
/// SPEC: wsl-terminal-profile (WSLP-21) — numa pasta dentro de uma distro,
/// um editor da família VS Code recebe `--remote wsl+<distro> <caminho
/// POSIX>`. Passar o caminho UNC cru abre a janela no host, que trata o
/// compartilhamento de rede como não confiável e cai em Modo Restrito: sem
/// extensões, sem tarefas, sem terminal na distro. Editor que não fala
/// `--remote` continua recebendo o caminho como sempre — nada piora.
fn open_args(editor: &EditorDescriptor, dir: &Path) -> Vec<OsString> {
    let remote = if editor.wsl_remote {
        crate::shells::wsl_path_parts(dir)
    } else {
        None
    };
    match remote {
        Some((distro, inner)) => vec![
            OsString::from("--remote"),
            OsString::from(format!("wsl+{distro}")),
            OsString::from(inner),
        ],
        None => vec![dir.as_os_str().to_owned()],
    }
}

/// Monta o comando que abre `dir` em `program` — o núcleo com regra de
/// `open`, separado dele para ser testável sem lançar processo (EDITOR-04).
fn build_open_command(editor: &EditorDescriptor, program: &Path, dir: &Path) -> Command {
    let mut cmd = if is_windows_script(program) {
        let mut cmd = Command::new("cmd");
        cmd.arg("/C").arg(program);
        cmd
    } else {
        Command::new(program)
    };
    cmd.args(open_args(editor, dir));
    cmd
}

/// Abre `dir` no editor de id `id` (EDITOR-04).
///
/// Erros são `String` porque o único chamador é um `#[tauri::command]`, e é
/// isso que a IPC transporta — mesmo padrão de `commands/terminal.rs`.
pub fn open(id: &str, dir: &str) -> Result<(), String> {
    let editor = descriptor(id).ok_or_else(|| format!("editor `{id}` não existe no catálogo"))?;

    let dir = Path::new(dir);
    if !dir.is_dir() {
        return Err(format!("`{}` não é um diretório", dir.display()));
    }

    let path_var = std::env::var("PATH").unwrap_or_default();
    let pathext = windows_pathext();
    let program = resolve_command_in_path(editor.command, &path_var, pathext.as_deref())
        .ok_or_else(|| format!("`{}` não está no PATH", editor.command))?;

    let mut cmd = build_open_command(editor, &program, dir);
    // BOOT-01: `crate::proc` is now the single owner of `CREATE_NO_WINDOW`;
    // the private copy that used to live here was one of two duplicates.
    crate::proc::hide_console(&mut cmd)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("falha ao abrir {}: {e}", editor.name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn argv(cmd: &Command) -> Vec<String> {
        std::iter::once(cmd.get_program())
            .chain(cmd.get_args())
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    #[test]
    fn ids_do_catalogo_sao_unicos() {
        let mut ids: Vec<&str> = CATALOG.iter().map(|e| e.id).collect();
        let total = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), total, "id duplicado no catálogo de editores");
    }

    // EDITOR-05: id fora do catálogo nunca vira comando.
    #[test]
    fn descriptor_recusa_id_fora_do_catalogo() {
        assert!(descriptor("vscode").is_some());
        assert!(descriptor("rm -rf /").is_none());
        assert!(descriptor("").is_none());
    }

    #[test]
    fn open_com_id_desconhecido_falha_sem_executar_nada() {
        let erro = open("nao-existe", ".").expect_err("id fora do catálogo deve falhar");
        assert!(erro.contains("não existe no catálogo"), "erro: {erro}");
    }

    // EDITOR-02: só entra na lista quem resolve no PATH informado.
    #[test]
    fn detect_installed_with_lista_so_o_que_resolve_no_path() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("code"), b"").expect("criar `code` falso");

        let path_var = dir.path().to_string_lossy().into_owned();
        let encontrados = detect_installed_with(&CATALOG, &path_var, None);

        let ids: Vec<&str> = encontrados.iter().map(|s| s.editor.id).collect();
        assert_eq!(ids, vec!["vscode"]);
        assert_eq!(encontrados[0].path, dir.path().join("code"));
    }

    // Regressão: a mesma pasta tem `code` (shim de shell sem extensão) e
    // `code.cmd`. Lançar o shim quebra — `CreateProcess` não o executa —,
    // então a resolução precisa preferir a extensão de `%PATHEXT%`.
    #[test]
    fn detect_installed_with_prefere_o_cmd_ao_shim_sem_extensao() {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("code"), b"#!/bin/sh").expect("criar shim `code`");
        fs::write(dir.path().join("code.cmd"), b"@echo off").expect("criar `code.cmd`");

        let path_var = dir.path().to_string_lossy().into_owned();
        let encontrados = detect_installed_with(&CATALOG, &path_var, Some(".EXE;.CMD"));

        assert_eq!(encontrados.len(), 1);
        assert_eq!(encontrados[0].path, dir.path().join("code.cmd"));
    }

    #[test]
    fn detect_installed_with_path_vazio_devolve_lista_vazia() {
        assert!(detect_installed_with(&CATALOG, "", None).is_empty());
    }

    // EDITOR-04: o diretório é o argumento do editor, sempre o último.
    fn vscode() -> &'static EditorDescriptor {
        descriptor("vscode").expect("vscode no catálogo")
    }

    #[test]
    fn build_open_command_passa_o_diretorio_como_argumento() {
        let cmd = build_open_command(
            vscode(),
            Path::new("/usr/bin/code"),
            Path::new("/home/user/proj"),
        );

        assert_eq!(argv(&cmd), vec!["/usr/bin/code", "/home/user/proj"]);
    }

    // `code.cmd` não é executável para o `CreateProcess`: precisa de `cmd /C`.
    #[test]
    fn build_open_command_roteia_script_do_windows_por_cmd() {
        let cmd = build_open_command(
            vscode(),
            Path::new(r"C:\bin\code.cmd"),
            Path::new(r"C:\proj"),
        );

        assert_eq!(
            argv(&cmd),
            vec!["cmd", "/C", r"C:\bin\code.cmd", r"C:\proj"]
        );
    }

    // SPEC: wsl-terminal-profile (WSLP-21) — pasta na distro abre remoto, e
    // é por isso que o caminho UNC não aparece no argv: ele é o que levava a
    // janela ao Modo Restrito.
    #[test]
    fn build_open_command_abre_pasta_da_wsl_em_modo_remoto() {
        let cmd = build_open_command(
            vscode(),
            Path::new(r"C:\bin\code.cmd"),
            Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x\repo"),
        );

        assert_eq!(
            argv(&cmd),
            vec![
                "cmd",
                "/C",
                r"C:\bin\code.cmd",
                "--remote",
                "wsl+Ubuntu-24.04",
                "/home/x/repo",
            ]
        );
    }

    // Editor sem suporte a `--remote` recebe o caminho como antes: sem
    // remoto é ruim, com flag que ele não entende é pior (nem abre).
    #[test]
    fn build_open_command_nao_usa_remoto_em_editor_que_nao_suporta() {
        let zed = descriptor("zed").expect("zed no catálogo");
        let dir = Path::new(r"\\wsl.localhost\Ubuntu-24.04\home\x\repo");
        let cmd = build_open_command(zed, Path::new(r"C:\bin\zed.exe"), dir);

        assert_eq!(
            argv(&cmd),
            vec![
                r"C:\bin\zed.exe",
                r"\\wsl.localhost\Ubuntu-24.04\home\x\repo"
            ]
        );
    }

    // Pasta do host continua no comportamento de sempre, mesmo em editor que
    // fala `--remote`.
    #[test]
    fn build_open_command_nao_usa_remoto_em_pasta_do_host() {
        let cmd = build_open_command(
            vscode(),
            Path::new(r"C:\bin\code.cmd"),
            Path::new(r"C:\proj"),
        );

        assert_eq!(
            argv(&cmd),
            vec!["cmd", "/C", r"C:\bin\code.cmd", r"C:\proj"]
        );
    }

    #[test]
    fn build_open_command_nao_roteia_exe_por_cmd() {
        let zed = descriptor("zed").expect("zed no catálogo");
        let cmd = build_open_command(zed, Path::new(r"C:\bin\zed.exe"), Path::new(r"C:\proj"));

        assert_eq!(argv(&cmd), vec![r"C:\bin\zed.exe", r"C:\proj"]);
    }
}
