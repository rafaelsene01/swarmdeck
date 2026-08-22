// SPEC: terminal-boot-loading (BOOT-10, BOOT-11), providers-panel (PROV-01)

/**
 * Contrato de dados do catálogo de agentes — espelha
 * `src-tauri/src/commands/agents.rs` (serde `camelCase`).
 *
 * Mora aqui, e não dentro de um componente, porque três lugares consomem a
 * mesma forma: o boot (`App`), o wizard de novo terminal (`PaneWizard`) e o
 * painel de Configurações. Antes desta feature cada um redeclarava a sua
 * cópia.
 */

/**
 * Um agente do catálogo, como o Rust o descreve — espelha
 * `AgentDescriptor` de `src-tauri/src/agents/catalog.rs`.
 *
 * AD-036: morava em `routes/settings/AgentPanel.tsx`, que deixou de ser a
 * grade de cards do catálogo e passou a listar preferências por provedor. O
 * contrato do catálogo é deste arquivo, como o resto das formas de IPC.
 */
export interface AgentDescriptor {
  id: string
  name: string
  vendor: string
  command: string
  beta: boolean
  /**
   * SPEC: agent-permission-mode (PERM-03) — modos que o CLI deste agente
   * aceita em `--permission-mode`, na ordem de exibição. Vetor vazio (ou
   * ausente) = o CLI não expõe esse controle, e o passo AGENT não mostra o
   * seletor. Vem de `agent_catalog`, que o deriva de `permission_mode_flag`
   * no catálogo Rust — o frontend nunca decide por id.
   */
  permissionModes?: string[]
}

/** O que `agent_catalog` devolve: o descritor mais o status de instalação. */
export interface AgentCatalogEntry extends AgentDescriptor {
  /** SPEC: agent-selection (AGT-04) — comando resolvido no perfil consultado. */
  installed: boolean
  /** SPEC: session-restore (SESS-15) — o CLI aceita `--resume <id>`. */
  supportsSessionResume?: boolean
}

/** Um perfil de terminal e os agentes instalados **nele** (BOOT-10). */
export interface ProfileCatalogEntry {
  /** `"host"` ou `"wsl:<distro>"` — a forma de `TerminalProfile::id()`, a
   * mesma que `shell_profile_for_path` devolve. */
  profileId: string
  /** Rótulo de exibição: "Windows", "Ubuntu-24.04", "… (WSL1)". */
  label: string
  wsl1: boolean
  agents: AgentCatalogEntry[]
}

/** Resposta de `agent_catalog_all` (BOOT-10). */
export interface ProfileCatalog {
  /** Perfil que vale quando o caminho não determina nenhum (WSLP-07). */
  defaultProfileId: string
  profiles: ProfileCatalogEntry[]
}

/** `true` quando o perfil tem ao menos um agente do catálogo instalado. */
export function hasInstalledAgent(profile: ProfileCatalogEntry): boolean {
  return profile.agents.some((agent) => agent.installed)
}
