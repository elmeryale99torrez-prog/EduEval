import { describe, expect, it } from 'vitest';
import {
  type Activity,
  activityRuntime,
  compareActivityResponse,
  evaluateActivityResponse,
} from '../activityEngine';

const scenarioActivity: Activity = {
  id: 'a1',
  title: 'Decidir con empatía',
  type: 'scenario',
  topic: 'Convivencia',
  difficulty: 'Inicial',
  prompt: 'Tu equipo no está de acuerdo. ¿Qué haces primero?',
  options: ['Escuchar las razones de cada persona', 'Imponer la decisión más rápida', 'Dejar que el conflicto crezca'],
  answer: 'Escuchar las razones de cada persona',
  feedback: 'Escuchar permite comprender el problema antes de decidir colectivamente.',
  details: {
    scenario: {
      situation: 'En la semana previa a la feria de ciencias, dos integrantes del grupo tienen propuestas metodológicas opuestas y los plazos de entrega se acortan.',
      stages: [
        {
          id: 'stage-1',
          title: 'Apertura del diálogo',
          prompt: '¿Cuál es el primer paso para desbloquear el trabajo del grupo?',
          options: [
            {
              id: 'opt-1',
              text: 'Escuchar las razones de cada persona y consensuar criterios',
              consequence: 'El grupo identifica puntos en común y retoma el cronograma sin fricciones.',
              feedback: 'Escuchar y acordar criterios comunes genera cohesión y avance real.',
              recommended: true,
            },
            {
              id: 'opt-2',
              text: 'Imponer la decisión más rápida para no perder tiempo',
              consequence: 'La mitad del equipo pierde motivación y la calidad del proyecto decae.',
              feedback: 'La imposición genera desapego y fractura el trabajo en equipo.',
              recommended: false,
            },
          ],
        },
      ],
      hint: 'Busca una alternativa que priorice el entendimiento mutuo antes de la ejecución técnica.',
      explanation: 'El liderazgo constructivo se fundamenta en la escucha activa y la construcción de acuerdos.',
    },
  },
  status: 'published',
};

describe('Integración de Escenario (scenario) en activityEngine', () => {
  it('conserva situation, stages, hint y explanation en runtime.scenario', () => {
    const runtime = activityRuntime(scenarioActivity);
    expect(runtime.scenario.situation).toContain('feria de ciencias');
    expect(runtime.scenario.hint).toContain('entendimiento mutuo');
    expect(runtime.scenario.explanation).toContain('liderazgo constructivo');
    expect(runtime.scenario.stages).toHaveLength(1);
    expect(runtime.scenario.stages[0].options[0].recommended).toBe(true);
  });

  it('evalúa correctamente la opción recomendada tanto por ID como por texto y rechaza tipos cruzados', () => {
    const byId = evaluateActivityResponse(
      scenarioActivity,
      {
        type: 'scenario',
        choices: { 'stage-1': 'opt-1' },
      },
      10,
    );
    expect(byId.correct).toBe(true);
    expect(byId.score).toBe(10);

    const byText = evaluateActivityResponse(
      scenarioActivity,
      {
        type: 'scenario',
        choices: { 'stage-1': 'Escuchar las razones de cada persona y consensuar criterios' },
      },
      10,
    );
    expect(byText.correct).toBe(true);

    const wrongType: Activity = { ...scenarioActivity, type: 'trueFalse' };
    expect(
      compareActivityResponse(wrongType, {
        type: 'scenario',
        choices: { 'stage-1': 'opt-1' },
      }),
    ).toBe(false);
  });

  it('trata una respuesta vacía como omitida (correct: null, score: 0)', () => {
    const evaluated = evaluateActivityResponse(scenarioActivity, { type: 'scenario', choices: {} }, 10);
    expect(evaluated).toEqual({
      response: '',
      status: 'omitted',
      correct: null,
      score: 0,
    });
  });
});
