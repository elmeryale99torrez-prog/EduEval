import { describe, expect, it } from 'vitest';
import {
  createEmptySortingResponse,
  evaluateSorting,
  formatSortingReport,
  type SortingPrivate,
  toSortingPublic,
  validateSortingDefinition,
} from './sorting';

const baseDefinition: SortingPrivate = {
  type: 'sorting',
  id: 'sort-ecosistemas-1',
  context: 'Un ecosistema integra componentes con vida y factores físicos del entorno.',
  prompt: 'Clasifica cada elemento según el tipo de factor ecológico al que pertenece.',
  categories: ['Factor biótico', 'Factor abiótico'],
  items: [
    { id: 'item-1', label: 'Hongo descomponedor', category: 'Factor biótico' },
    { id: 'item-2', label: 'Radiación solar', category: 'Factor abiótico' },
    { id: 'item-3', label: 'Planta productora', category: 'Factor biótico' },
    { id: 'item-4', label: 'Humedad del suelo', category: 'Factor abiótico' },
  ],
  hint: 'Distingue entre organismos vivos que cumplen un rol trófico y condiciones físico-químicas del ambiente.',
  explanation: 'Los hongos y plantas son seres vivos (bióticos), mientras que la radiación y la humedad son condiciones físicas (abióticas).',
};

describe('validateSortingDefinition', () => {
  it('acepta una actividad de Clasificación completa y bien distribuida', () => {
    expect(validateSortingDefinition(baseDefinition)).toEqual([]);
  });

  it('rechaza menos de 2 categorías o categorías duplicadas', () => {
    const onlyOneCat = { ...baseDefinition, categories: ['Factor biótico'] };
    expect(validateSortingDefinition(onlyOneCat).some((i) => i.path === 'categories')).toBe(true);

    const dupCat = { ...baseDefinition, categories: ['Factor biótico', '  factor BIÓTICO '] };
    expect(validateSortingDefinition(dupCat).some((i) => i.path === 'categories[1]')).toBe(true);
  });

  it('rechaza elementos duplicados o que apunten a una categoría inexistente', () => {
    const dupItems = {
      ...baseDefinition,
      items: [
        { id: 'i1', label: 'Hongo descomponedor', category: 'Factor biótico' },
        { id: 'i2', label: 'hongo DESCOMPONEDOR', category: 'Factor abiótico' },
      ],
    };
    expect(validateSortingDefinition(dupItems).some((i) => i.path === 'items[1].label')).toBe(true);

    const badCategory = {
      ...baseDefinition,
      items: [
        { id: 'i1', label: 'Hongo descomponedor', category: 'Factor biótico' },
        { id: 'i2', label: 'Radiación solar', category: 'Categoría fantasma' },
      ],
    };
    expect(validateSortingDefinition(badCategory).some((i) => i.path === 'items[1].category')).toBe(true);
  });

  it('rechaza que todos los elementos estén asignados a una sola categoría', () => {
    const singleUsedCategory = {
      ...baseDefinition,
      items: [
        { id: 'i1', label: 'Hongo descomponedor', category: 'Factor biótico' },
        { id: 'i2', label: 'Planta productora', category: 'Factor biótico' },
      ],
    };
    expect(validateSortingDefinition(singleUsedCategory).some((i) => i.path === 'items')).toBe(true);
  });

  it('rechaza falta de pista orientadora (hint) o propiedades extrañas', () => {
    const noHint = { ...baseDefinition, hint: '   ' };
    expect(validateSortingDefinition(noHint).some((i) => i.path === 'hint')).toBe(true);

    const extraProp = { ...baseDefinition, bonus: true };
    expect(validateSortingDefinition(extraProp).some((i) => i.path === 'bonus')).toBe(true);
  });
});

describe('toSortingPublic', () => {
  it('desordena los elementos y oculta la categoría correcta, la pista y la explicación', () => {
    const pub = toSortingPublic(baseDefinition);
    expect(pub.categories).toEqual(['Factor biótico', 'Factor abiótico']);
    expect(pub.items).toHaveLength(4);
    expect(pub.items.map((i) => i.id)).not.toEqual(['item-1', 'item-2', 'item-3', 'item-4']);
    for (const item of pub.items) {
      expect('category' in item).toBe(false);
    }
    expect('hint' in pub).toBe(false);
    expect('explanation' in pub).toBe(false);
  });
});

describe('evaluateSorting', () => {
  it('califica como correcta cuando todos los elementos están en su categoría y entrega la pista', () => {
    const result = evaluateSorting(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'sorting',
        status: 'confirmed',
        assignments: {
          'item-1': 'Factor biótico',
          'item-2': 'Factor abiótico',
          'item-3': 'Factor biótico',
          'item-4': 'Factor abiótico',
        },
      },
      10,
    );
    expect(result.outcome).toBe('correct');
    expect(result.correct).toBe(true);
    expect(result.score).toBe(10);
    expect(result.correctItemsCount).toBe(4);
    expect(result.studentFeedback).toBe(baseDefinition.hint);
  });

  it('califica como incorrecta con 0 puntos si algún elemento está mal clasificado y entrega la misma pista', () => {
    const result = evaluateSorting(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'sorting',
        status: 'confirmed',
        assignments: {
          'item-1': 'Factor abiótico',
          'item-2': 'Factor abiótico',
          'item-3': 'Factor biótico',
          'item-4': 'Factor abiótico',
        },
      },
      10,
    );
    expect(result.outcome).toBe('incorrect');
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.correctItemsCount).toBe(3);
    expect(result.studentFeedback).toBe(baseDefinition.hint);
  });

  it('registra omisión y tiempo agotado sin calificar como error y rechaza categorías inválidas', () => {
    const omitted = evaluateSorting(baseDefinition, createEmptySortingResponse('occ-1', baseDefinition.id), 10);
    expect(omitted.outcome).toBe('omitted');
    expect(omitted.correct).toBeNull();
    expect(omitted.score).toBe(0);

    const timeout = evaluateSorting(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'sorting',
        status: 'partial_timeout',
        assignments: { 'item-1': 'Factor biótico' },
      },
      10,
    );
    expect(timeout.outcome).toBe('timeout');
    expect(timeout.correct).toBeNull();
    expect(timeout.score).toBe(0);
    expect(formatSortingReport(baseDefinition, timeout).studentAnswer).toContain('Sin confirmar por tiempo');

    const invalidCat = evaluateSorting(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'sorting',
        status: 'confirmed',
        assignments: {
          'item-1': 'Inventada',
          'item-2': 'Factor abiótico',
          'item-3': 'Factor biótico',
          'item-4': 'Factor abiótico',
        },
      },
      10,
    );
    expect(invalidCat.outcome).toBe('rejected');
  });
});
