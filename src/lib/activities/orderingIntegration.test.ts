import { describe, expect, it } from 'vitest';
import {
  type Activity,
  activityRuntime,
  compareActivityResponse,
  evaluateActivityResponse,
} from '../activityEngine';

const orderingActivity: Activity = {
  id: 'a5',
  title: 'Pasos para dialogar',
  type: 'ordering',
  topic: 'Convivencia',
  difficulty: 'Intermedio',
  prompt: 'Ordena el proceso para resolver un desacuerdo.',
  options: ['Reconocer el problema', 'Escuchar activamente', 'Proponer alternativas', 'Acordar un siguiente paso'],
  answer: ['Reconocer el problema', 'Escuchar activamente', 'Proponer alternativas', 'Acordar un siguiente paso'],
  feedback: 'Nombrar el problema y escuchar son la base previa para acordar alternativas viables.',
  details: {
    ordering: {
      context: 'En una asamblea estudiantil surge un desacuerdo respecto al uso de las áreas comunes.',
      steps: ['Reconocer el problema', 'Escuchar activamente', 'Proponer alternativas', 'Acordar un siguiente paso'],
      hint: 'Nombrar el problema y escuchar son la base previa para acordar alternativas viables.',
      explanation: 'Primero se define el conflicto y se escucha a las partes; solo después se diseñan y pactan soluciones.',
    },
  },
  status: 'published',
};

describe('Integración de Ordenamiento (ordering) en activityEngine', () => {
  it('conserva context, hint y explanation en runtime.ordering', () => {
    const runtime = activityRuntime(orderingActivity);
    expect(runtime.ordering.context).toContain('asamblea estudiantil');
    expect(runtime.ordering.hint).toContain('Nombrar el problema');
    expect(runtime.ordering.explanation).toContain('Primero se define el conflicto');
    expect(runtime.ordering.steps).toHaveLength(4);
  });

  it('evalúa correctamente la secuencia ordenada y rechaza tipos cruzados', () => {
    const ok = evaluateActivityResponse(
      orderingActivity,
      {
        type: 'ordering',
        order: ['Reconocer el problema', 'Escuchar activamente', 'Proponer alternativas', 'Acordar un siguiente paso'],
      },
      10,
    );
    expect(ok).toEqual({
      response: 'Reconocer el problema → Escuchar activamente → Proponer alternativas → Acordar un siguiente paso',
      status: 'answered',
      correct: true,
      score: 10,
    });

    const wrongType: Activity = { ...orderingActivity, type: 'sorting' };
    expect(
      compareActivityResponse(wrongType, {
        type: 'ordering',
        order: ['Reconocer el problema', 'Escuchar activamente', 'Proponer alternativas', 'Acordar un siguiente paso'],
      }),
    ).toBe(false);
  });

  it('trata una respuesta vacía como omitida (correct: null, score: 0)', () => {
    const evaluated = evaluateActivityResponse(orderingActivity, { type: 'ordering', order: [] }, 10);
    expect(evaluated).toEqual({
      response: '',
      status: 'omitted',
      correct: null,
      score: 0,
    });
  });
});
