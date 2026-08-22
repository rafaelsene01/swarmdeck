-- SPEC: window-geometry (WGEO-01)

-- Geometria da janela `main` (WGEO-01): linha única, id fixo em 1.
--
-- Sem `INSERT` de semente de propósito: a **ausência** da linha é o sinal de
-- "primeira execução", e é ela que faz WGEO-06 cair no padrão de 90%
-- centralizado. Uma linha semeada com zeros seria indistinguível de uma
-- janela salva no canto superior esquerdo.
--
-- Valores em pixels físicos, como `Monitor::position`/`size` e
-- `Window::outer_position`/`inner_size` já entregam — sem ida e volta pelo
-- fator de escala.
CREATE TABLE window_state (
  id        INTEGER PRIMARY KEY CHECK (id = 1),
  x         INTEGER NOT NULL,
  y         INTEGER NOT NULL,
  width     INTEGER NOT NULL,
  height    INTEGER NOT NULL,
  maximized INTEGER NOT NULL DEFAULT 0
);
