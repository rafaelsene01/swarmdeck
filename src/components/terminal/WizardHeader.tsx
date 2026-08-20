// SPEC: projects (PROJ-10, PROJ-13)

/**
 * Cabeçalho comum às duas etapas do wizard de novo terminal: a trilha
 * "① Projeto › ② Agente" e o contador. Mora à parte porque as
 * duas etapas precisam do mesmo bloco pixel a pixel — cada uma renderizando
 * o seu produziria dois cabeçalhos que divergem no primeiro ajuste.
 */

export interface WizardHeaderProps {
  /** Etapa em foco: 1 = Projeto, 2 = Agente. */
  step: 1 | 2
  /** Texto pronto do contador, no formato "N / M projects". */
  counter: string
}

export default function WizardHeader({ step, counter }: WizardHeaderProps) {
  return (
    <div className="wizard-head" data-step={step}>
      <style>{`
        .wizard-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .wizard-head__trail { display: flex; align-items: center; gap: 0.45rem; }
        .wizard-head__step {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: var(--muted, #8a8a92);
        }
        .wizard-head__step[data-active='true'] { color: var(--accent, #f5b700); }
        .wizard-head__bullet {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 15px;
          height: 15px;
          border: 1px solid currentColor;
          border-radius: 50%;
          font-size: 0.58rem;
          letter-spacing: 0;
        }
        .wizard-head__sep { color: var(--muted, #8a8a92); font-size: 0.7rem; }
        .wizard-head__counter {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.72rem;
          font-weight: 600;
          color: var(--accent, #f5b700);
          white-space: nowrap;
        }
      `}</style>

      <div className="wizard-head__trail">
        <span className="wizard-head__step" data-active={step === 1}>
          <span className="wizard-head__bullet">1</span>
          Projeto
        </span>
        <span className="wizard-head__sep" aria-hidden="true">
          ›
        </span>
        <span className="wizard-head__step" data-active={step === 2}>
          <span className="wizard-head__bullet">2</span>
          Agente
        </span>
      </div>

      <span className="wizard-head__counter">{counter}</span>
    </div>
  )
}
