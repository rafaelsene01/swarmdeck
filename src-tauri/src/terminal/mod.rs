//! Camada de terminais: PTY, gerência de sessões e agregação de saída.

pub mod layout;
pub mod manager;
pub mod meta;
pub mod picker_prefs;
pub mod session;
pub mod status_catalog;
pub mod status_snapshot;
pub mod throttle;

pub use layout::LayoutEntry;
pub use manager::{ManagerError, SessionConfig, TerminalId, TerminalManager, TerminalSnapshot};
pub use meta::{MetaError, TerminalMeta, TerminalMetaService, TitleSource};
pub use session::{PtySession, SessionError, SessionState};
pub use status_catalog::{CatalogError, CreateOutcome, DeleteOutcome, StatusRecord};
pub use status_snapshot::StatusSnapshotService;
pub use throttle::{Chunk, OutputThrottle};
