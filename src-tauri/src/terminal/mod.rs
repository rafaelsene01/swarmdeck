//! Camada de terminais: PTY, gerência de sessões e agregação de saída.
//!
//! `session` (T4) e `manager` (T5) entram nas tarefas seguintes.

pub mod throttle;

pub use throttle::{Chunk, OutputThrottle};
