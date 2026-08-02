//! Camada de terminais: PTY, gerência de sessões e agregação de saída.

pub mod layout;
pub mod manager;
pub mod meta;
pub mod session;
pub mod throttle;

pub use layout::LayoutEntry;
pub use manager::{ManagerError, SessionConfig, TerminalId, TerminalManager, TerminalSnapshot};
pub use meta::{MetaError, TerminalMeta, TerminalMetaService, TitleSource};
pub use session::{PtySession, SessionError, SessionState};
pub use throttle::{Chunk, OutputThrottle};
