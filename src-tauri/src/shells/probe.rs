// SPEC: wsl-terminal-profile (WSLP-22, WSLP-23)

//! Como uma sonda dentro da distro pergunta algo ao ambiente real do
//! usuário. `bash -lc` não serve: o rc de um usuário de zsh (asdf, nvm,
//! fnm) nunca é lido, então o `PATH` devolvido não tem os shims — e o
//! agente lançado com esse `PATH` falha ao chamar `node`. A sonda reexecuta
//! no shell de login do próprio usuário, em modo interativo, que é
//! exatamente o que o terminal puro abre.
//!
//! O modo interativo faz o rc rodar por inteiro, e um rc pode imprimir
//! banner. Por isso a saída útil vem depois de um marcador, e só o que
//! está depois dele é lido.

const MARKER: &str = "__SWARMDECK_PROBE__";

/// Envolve `script` para rodar sob `$SHELL -lic`. O resultado é o argumento
/// de `bash -lc` dentro de `wsl.exe -- bash -lc <isto>`: `$SHELL` só existe
/// depois que o `wsl.exe` monta o ambiente do usuário, então a expansão tem
/// de acontecer lá dentro, não aqui.
///
/// `script` é sempre um literal deste código (`printenv PATH`, `type -P` da
/// lista fixa do catálogo) — nada vindo do usuário entra aqui, e por isso
/// não há escape de aspas simples.
pub fn login_shell_script(script: &str) -> String {
    debug_assert!(
        !script.contains('\''),
        "aspas simples quebrariam o -ic; nenhuma sonda usa"
    );
    format!("exec \"${{SHELL:-/bin/sh}}\" -lic 'echo {MARKER}; {script}'")
}

/// A parte de `raw` que veio do script, descartando o que o rc imprimiu
/// antes do marcador. Sem marcador na saída devolve `raw` inteiro: um shell
/// que não chegou a rodar o `echo` é um erro que quem chama já trata pelo
/// conteúdo vazio ou pelo status.
pub fn strip_banner(raw: &str) -> &str {
    match raw.rfind(MARKER) {
        Some(at) => raw[at + MARKER.len()..].trim_start_matches(['\r', '\n']),
        None => raw,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn script_reexecuta_no_shell_de_login_interativo() {
        let wrapped = login_shell_script("printenv PATH");
        assert!(wrapped.contains("${SHELL:-/bin/sh}"));
        assert!(wrapped.contains("-lic"));
        assert!(wrapped.contains("printenv PATH"));
    }

    #[test]
    fn strip_banner_descarta_o_que_veio_antes_do_marcador() {
        let raw = "bem-vindo ao meu rc\n__SWARMDECK_PROBE__\n/usr/bin:/bin\n";
        assert_eq!(strip_banner(raw), "/usr/bin:/bin\n");
    }

    #[test]
    fn strip_banner_devolve_tudo_quando_nao_ha_marcador() {
        assert_eq!(strip_banner("/usr/bin:/bin\n"), "/usr/bin:/bin\n");
    }

    // Um rc que imprime a própria string do marcador não pode cortar a
    // saída no lugar errado: vale a última ocorrência, que é a do `echo`.
    #[test]
    fn strip_banner_usa_a_ultima_ocorrencia_do_marcador() {
        let raw = "eco falso __SWARMDECK_PROBE__ no rc\n__SWARMDECK_PROBE__\n/bin\n";
        assert_eq!(strip_banner(raw), "/bin\n");
    }
}
