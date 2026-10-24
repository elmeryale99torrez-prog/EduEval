import { describe, expect, it } from 'vitest';
import {
  type Activity,
  activityRuntime,
  compareActivityResponse,
  createInitialResponse,
  evaluateActivityResponse,
} from '../activityEngine';

const sortingActivity: Activity = {
  id: 'a4',
  title: 'Clasificación de recursos energéticos',
  type: 'sorting',
  topic: 'Física y Ambiente',
  difficulty: 'Intermedio',
  prompt: 'Clasifica cada fuente de energía según su capacidad de regeneración natural.',
  options: ['Energía solar', 'Gas natural', 'Energía eólica', 'Carbón mineral'],
  answer: ['Renovable', 'No renovable', 'Renovable', 'No renovable'],
  feedback: 'Compara el tiempo de regeneración de la fuente frente al ritmo de consumo humano.',
  details: {
    sorting: {
      context: 'Las fuentes energéticas se dividen según se agoten o se renueven continuamente en la naturaleza.',
      categories: ['Renovable', 'No renovable'],
      items: [
        { id: 'sort-1', label: 'Energía solar', category: 'Renovable' },
        { id: 'sort-2', label: 'Gas natural', category: 'No renovable' },
        { id: 'sort-3', label: 'Energía eólica', category: 'Renovable' },
        { id: 'sort-4', label: 'Carbón mineral', category: 'No renovable' },
      ],
      hint: 'Compara el tiempo de regeneración de la fuente frente al ritmo de consumo humano.',
      explanation: 'El sol y el viento son fuentes inagotables a escala humana; el gas y el carbón son combustibles fósiles finitos.',
    },
  },
  status: 'published',
};

describe('Integración de Clasificación (sorting) en activityEngine', () => {
  it('conserva context, hint y explanation en runtime.sorting', () => {
    const runtime = activityRuntime(sortingActivity);
    expect(runtime.sorting.context).toContain('fuentes energéticas');
    expect(runtime.sorting.hint).toContain('tiempo de regeneración');
    expect(runtime.sorting.explanation).toContain('combustibles fósiles');
    expect(runtime.sorting.categories).toEqual(['Renovable', 'No renovable']);
  });

  it('evalúa correctamente todos los elementos clasificados y rechaza tipos cruzados', () => {
    const ok = evaluateActivityResponse(
      sortingActivity,
      {
        type: 'sorting',
        assignments: {
          'sort-1': 'Renovable',
          'sort-2': 'No renovable',
          'sort-3': 'Renovable',
          'sort-4': 'No renovable',
        },
      },
      10,
    );
    expect(ok).toEqual({
      response: 'sort-1 → Renovable | sort-2 → No renovable | sort-3 → Renovable | sort-4 → No renovable',
      status: 'answered',
      correct: true,
      score: 10,
    });

    const wrongType: Activity = { ...sortingActivity, type: 'ordering' };
    expect(
      compareActivityResponse(wrongType, {
        type: 'sorting',
        assignments: {
          'sort-1': 'Renovable',
          'sort-2': 'No renovable',
          'sort-3': 'Renovable',
          'sort-4': 'No renovable',
        },
      }),
    ).toBe(false);
  });

  it('trata una respuesta inicial sin asignaciones como omitida (correct: null, score: 0)', () => {
    const initial = createInitialResponse(sortingActivity);
    const evaluated = evaluateActivityResponse(sortingActivity, initial, 10);
    expect(evaluated).toEqual({
      response: '',
      status: 'omitted',
      correct: null,
      score: 0,
    });
  });
});
