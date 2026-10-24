import { describe, expect, it } from 'vitest';
import {
  createEmptyScenarioResponse,
  evaluateScenario,
  formatScenarioReport,
  type ScenarioPrivate,
  toScenarioPublic,
  validateScenarioDefinition,
} from './scenario';

const baseDefinition: ScenarioPrivate = {
  type: 'scenario',
  id: 'scen-gestion-ambiental-1',
  prompt: 'Analiza la situación de la microcuenca y toma las mejores decisiones de gestión participativa.',
  situation: 'Una comunidad rural enfrenta una disminución crítica del caudal de su río debido a la deforestación de la cabecera y el vertido de aguas residuales sin tratamiento.',
  hint: 'Prioriza medidas que involucren a la comunidad y que resuelvan la causa raíz sin generar conflictos territoriales.',
  explanation: 'La reforestación con especies nativas y la concertación social aseguran sostenibilidad a largo plazo.',
  stages: [
    {
      id: 'stg-1',
      title: 'Diagnóstico y primer acuerdo',
      prompt: '¿Cómo debe actuar el comité de cuenca en su primera sesión extraordinaria?',
      options: [
        {
          id: 'opt-1a',
          text: 'Convocar a una mesa de diálogo con diagnósticos técnicos participativos',
          consequence: 'Se genera confianza comunitaria y se identifican con precisión las zonas de mayor degradación.',
          feedback: 'Excelente inicio: la legitimidad social es indispensable para el cumplimiento de acuerdos.',
          recommended: true,
        },
        {
          id: 'opt-1b',
          text: 'Imponer sanciones económicas inmediatas sin consultar a los pobladores',
          consequence: 'Aumenta la tensión comunitaria y los pobladores rechazan las inspecciones ambientales.',
          feedback: 'Las medidas unilaterales generan resistencia y ocultan las prácticas informales de tala.',
          recommended: false,
        },
      ],
    },
    {
      id: 'stg-2',
      title: 'Acción de recuperación ecológica',
      prompt: '¿Qué intervención técnica debe priorizarse para restaurar la cabecera de la cuenca?',
      options: [
        {
          id: 'opt-2a',
          text: 'Reforestación con especies nativas y protección de rondas hídricas',
          consequence: 'Se mejora la infiltración del suelo y se previene la erosión hacia el cauce principal.',
          feedback: 'Decisión acertada: las especies nativas restauran la biodiversidad y regulan el ciclo hídrico.',
          recommended: true,
        },
        {
          id: 'opt-2b',
          text: 'Construir muros de contención de concreto sin cobertura vegetal',
          consequence: 'Se incrementa el costo financiero sin regenerar la esponja natural de agua.',
          feedback: 'El concreto puede contener taludes temporalmente pero no recupera el caudal hídrico.',
          recommended: false,
        },
      ],
    },
  ],
};

describe('validateScenarioDefinition', () => {
  it('acepta una definición completa y rigurosa de Escenario', () => {
    expect(validateScenarioDefinition(baseDefinition)).toEqual([]);
  });

  it('rechaza escenarios sin situación o con etapas fuera de los límites (1 a 3)', () => {
    const noSituation = { ...baseDefinition, situation: '   ' };
    expect(validateScenarioDefinition(noSituation).some((i) => i.path === 'situation')).toBe(true);

    const emptyStages = { ...baseDefinition, stages: [] };
    expect(validateScenarioDefinition(emptyStages).some((i) => i.path === 'stages')).toBe(true);
  });

  it('rechaza etapas sin exactamente una opción recomendada', () => {
    const noRecommended = {
      ...baseDefinition,
      stages: [
        {
          ...baseDefinition.stages[0],
          options: baseDefinition.stages[0].options.map((o) => ({ ...o, recommended: false })),
        },
      ],
    };
    expect(validateScenarioDefinition(noRecommended).some((i) => i.path.includes('options'))).toBe(true);

    const twoRecommended = {
      ...baseDefinition,
      stages: [
        {
          ...baseDefinition.stages[0],
          options: baseDefinition.stages[0].options.map((o) => ({ ...o, recommended: true })),
        },
      ],
    };
    expect(validateScenarioDefinition(twoRecommended).some((i) => i.path.includes('options'))).toBe(true);
  });

  it('rechaza opciones sin consecuencia o sin feedback', () => {
    const missingConsequence = {
      ...baseDefinition,
      stages: [
        {
          ...baseDefinition.stages[0],
          options: [
            { ...baseDefinition.stages[0].options[0], consequence: '' },
            baseDefinition.stages[0].options[1],
          ],
        },
      ],
    };
    expect(validateScenarioDefinition(missingConsequence).some((i) => i.path.includes('consequence'))).toBe(true);
  });
});

describe('toScenarioPublic', () => {
  it('entrega la situación y las etapas ocultando la opción recomendada, consecuencias y explicaciones', () => {
    const pub = toScenarioPublic(baseDefinition);
    expect(pub.situation).toContain('comunidad rural');
    expect(pub.stages).toHaveLength(2);
    for (const stage of pub.stages) {
      for (const opt of stage.options) {
        expect('recommended' in opt).toBe(false);
        expect('consequence' in opt).toBe(false);
        expect('feedback' in opt).toBe(false);
      }
    }
    expect('hint' in pub).toBe(false);
    expect('explanation' in pub).toBe(false);
  });
});

describe('evaluateScenario', () => {
  it('califica como correcta si se eligen todas las opciones recomendadas y entrega las consecuencias correspondientes', () => {
    const result = evaluateScenario(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'scenario',
        status: 'confirmed',
        choices: {
          'stg-1': 'opt-1a',
          'stg-2': 'opt-2a',
        },
      },
      10,
    );
    expect(result.outcome).toBe('correct');
    expect(result.correct).toBe(true);
    expect(result.score).toBe(10);
    expect(result.recommendedCount).toBe(2);
    expect(result.stageEvaluations).toHaveLength(2);
    expect(result.stageEvaluations[0].consequence).toContain('confianza comunitaria');
    expect(result.studentFeedback).toBe(baseDefinition.hint);
  });

  it('califica como incorrecta con 0 puntos si al menos una etapa no elige la recomendada, pero conserva consecuencias formativas', () => {
    const result = evaluateScenario(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'scenario',
        status: 'confirmed',
        choices: {
          'stg-1': 'opt-1b',
          'stg-2': 'opt-2a',
        },
      },
      10,
    );
    expect(result.outcome).toBe('incorrect');
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.recommendedCount).toBe(1);
    expect(result.stageEvaluations[0].consequence).toContain('tensión comunitaria');
    expect(result.studentFeedback).toBe(baseDefinition.hint);
  });

  it('gestiona omisión y tiempo parcial sin calificar como error', () => {
    const omitted = evaluateScenario(baseDefinition, createEmptyScenarioResponse('occ-1', baseDefinition.id), 10);
    expect(omitted.outcome).toBe('omitted');
    expect(omitted.correct).toBeNull();
    expect(omitted.score).toBe(0);

    const timeout = evaluateScenario(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'scenario',
        status: 'partial_timeout',
        choices: { 'stg-1': 'opt-1a' },
      },
      10,
    );
    expect(timeout.outcome).toBe('timeout');
    expect(timeout.correct).toBeNull();
    expect(formatScenarioReport(baseDefinition, timeout).studentAnswer).toContain('Sin confirmar por tiempo');
  });
});
