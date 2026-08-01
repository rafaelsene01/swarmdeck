//! Agregador da saída do PTY.
//!
//! Um processo verboso (`npm run build`, `cat` de arquivo grande) emite muito
//! mais rápido do que o front consegue renderizar. Mandar cada chunk pela IPC
//! na hora inunda o canal e trava a UI — a própria documentação do Tauri
//! recomenda limitar a taxa ao que dá para desenhar.
//!
//! Este buffer acumula bytes e é drenado em janelas fixas (~1 quadro). Ao
//! estourar o teto ele descarta o **começo**, não o fim: numa enxurrada de
//! saída, o que interessa é o estado mais recente do terminal.

/// Teto padrão do buffer entre dois flushes.
pub const DEFAULT_CAPACITY: usize = 1024 * 1024;

/// Intervalo de drenagem: ~1 quadro a 60fps.
pub const FLUSH_INTERVAL_MS: u64 = 16;

/// Bloco pronto para ir ao frontend.
#[derive(Debug, PartialEq, Eq)]
pub struct Chunk {
    pub bytes: Vec<u8>,
    /// `true` quando bytes antigos foram descartados por estouro de teto.
    /// O front usa isso para sinalizar a lacuna ao usuário.
    pub truncated: bool,
}

#[derive(Debug)]
pub struct OutputThrottle {
    buf: Vec<u8>,
    capacity: usize,
    truncated: bool,
}

impl OutputThrottle {
    pub fn new() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            buf: Vec::with_capacity(capacity.min(64 * 1024)),
            capacity,
            truncated: false,
        }
    }

    /// Acumula bytes vindos do PTY.
    ///
    /// Ao ultrapassar o teto, descarta do início até caber. Uma escrita maior
    /// que o teto inteiro mantém apenas a sua cauda.
    pub fn push(&mut self, data: &[u8]) {
        if data.len() >= self.capacity {
            let tail = &data[data.len() - self.capacity..];
            self.buf.clear();
            self.buf.extend_from_slice(tail);
            self.truncated = true;
            return;
        }

        self.buf.extend_from_slice(data);

        if self.buf.len() > self.capacity {
            let excess = self.buf.len() - self.capacity;
            self.buf.drain(..excess);
            self.truncated = true;
        }
    }

    /// Drena o acumulado. Devolve `None` quando não há nada pendente, para
    /// que o tick não gere tráfego de IPC à toa em terminal ocioso.
    pub fn flush_tick(&mut self) -> Option<Chunk> {
        if self.buf.is_empty() {
            return None;
        }

        let chunk = Chunk {
            bytes: std::mem::take(&mut self.buf),
            truncated: self.truncated,
        };
        self.truncated = false;
        Some(chunk)
    }

    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }

    pub fn len(&self) -> usize {
        self.buf.len()
    }
}

impl Default for OutputThrottle {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acumula_escritas_sucessivas() {
        let mut t = OutputThrottle::with_capacity(64);
        t.push(b"abc");
        t.push(b"def");

        let chunk = t.flush_tick().expect("havia dados pendentes");
        assert_eq!(chunk.bytes, b"abcdef");
        assert!(!chunk.truncated);
    }

    #[test]
    fn flush_esvazia_o_buffer() {
        let mut t = OutputThrottle::with_capacity(64);
        t.push(b"dados");

        assert_eq!(t.len(), 5);
        t.flush_tick().expect("primeiro flush entrega");
        assert!(t.is_empty(), "buffer deve ficar vazio após o flush");
    }

    #[test]
    fn flush_sem_dados_nao_gera_chunk() {
        let mut t = OutputThrottle::with_capacity(64);
        assert!(
            t.flush_tick().is_none(),
            "tick ocioso não deve gerar tráfego"
        );

        t.push(b"x");
        t.flush_tick().expect("com dados, entrega");
        assert!(
            t.flush_tick().is_none(),
            "segundo tick seguido também é ocioso"
        );
    }

    #[test]
    fn estouro_descarta_o_comeco_e_preserva_o_fim() {
        let mut t = OutputThrottle::with_capacity(8);
        t.push(b"1234567890");

        let chunk = t.flush_tick().expect("havia dados");
        assert_eq!(
            chunk.bytes, b"34567890",
            "o fim da saída é o que importa; o começo é descartado"
        );
        assert!(chunk.truncated);
    }

    #[test]
    fn flag_de_truncamento_reseta_apos_o_flush() {
        let mut t = OutputThrottle::with_capacity(4);
        t.push(b"abcdefgh");

        let primeiro = t.flush_tick().expect("havia dados");
        assert!(primeiro.truncated);

        t.push(b"ok");
        let segundo = t.flush_tick().expect("havia dados");
        assert!(
            !segundo.truncated,
            "truncamento é por chunk, não pega carona no seguinte"
        );
    }
}
