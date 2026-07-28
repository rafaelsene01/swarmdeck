//! Camada de terminais: PTY, gerência de sessões e agregação de saída.
//!
//! `manager` (T5) entra na tarefa seguinte.

pub mod session;
pub mod throttle;

pub use session::{PtySession, SessionError, SessionState};
pub use throttle::{Chunk, OutputThrottle};
