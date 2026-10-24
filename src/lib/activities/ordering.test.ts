import { describe, expect, it } from 'vitest';
import {
  createEmptyOrderingResponse,
  evaluateOrdering,
  formatOrderingReport,
  type OrderingPrivate,
  scrambleOrderingSteps,
  toOrderingPublic,
  validateOrderingDefinition,
} from './ordering';

const baseDefinition: OrderingPrivate = {
  type: 'ordering',
  id: 'ord-investigacion-1',
  context: 'El método científico propone una secuencia lógica para indagar fenómenos naturales.',
  prompt: 'Ordena cronológicamente las fases de una investigación científica básica.',
  steps: [
    'Observar el fenómeno y formular la pregunta',
    'Plantear una hipótesis verificable',
    'Diseñar y ejecutar el experimento controlado',
    'Analizar datos y extraer conclusiones',
  ],
  hint: 'Considera qué etapa requiere necesariamente la recolección de evidencia empírica antes de elaborar conclusiones.',
  explanation: 'No se puede contrastar una hipótesis sin antes haberla formulado, ni concluir sin datos experimentales.',
};

describe('validateOrderingDefinition', () => {
  it('acepta una actividad de Ordenamiento válida con pasos únicos', () => {
    expect(validateOrderingDefinition(baseDefinition)).toEqual([]);
  });

  it('rechaza menos de 3 pasos o más de 8', () => {
    const tooFew = { ...baseDefinition, steps: ['Paso 1', 'Paso 2'] };
    expect(validateOrderingDefinition(tooFew).some((i) => i.path === 'steps')).toBe(true);

    const tooMany = {
      ...baseDefinition,
      steps: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    };
    expect(validateOrderingDefinition(tooMany).some((i) => i.path === 'steps')).toBe(true);
  });

  it('rechaza pasos vacíos o duplicados', () => {
    const withEmpty = {
      ...baseDefinition,
      steps: ['Paso 1', '   ', 'Paso 3'],
    };
    expect(validateOrderingDefinition(withEmpty).some((i) => i.path === 'steps[1]')).toBe(true);

    const withDup = {
      ...baseDefinition,
      steps: ['Observar', 'Experimentar', '  observar  '],
    };
    expect(validateOrderingDefinition(withDup).some((i) => i.path === 'steps[2]')).toBe(true);
  });

  it('rechaza falta de pista obligatoria (hint)', () => {
    const noHint = { ...baseDefinition, hint: '' };
    expect(validateOrderingDefinition(noHint).some((i) => i.path === 'hint')).toBe(true);
  });
});

describe('scrambleOrderingSteps & toOrderingPublic', () => {
  it('garantiza que la secuencia desordenada NUNCA sea idéntica a la clave correcta', () => {
    const steps = ['A', 'B', 'C', 'D'];
    const scrambled = scrambleOrderingSteps(steps);
    expect(scrambled).not.toEqual(steps);
    expect(new Set(scrambled)).toEqual(new Set(steps));
  });

  it('toOrderingPublic oculta la explicación y la pista orientadora', () => {
    const pub = toOrderingPublic(baseDefinition);
    expect(pub.scrambledSteps).toHaveLength(4);
    expect(pub.scrambledSteps).not.toEqual(baseDefinition.steps);
    expect('hint' in pub).toBe(false);
    expect('explanation' in pub).toBe(false);
  });
});

describe('evaluateOrdering', () => {
  it('califica como correcta cuando todos los pasos coinciden en su posición exacta y devuelve la pista', () => {
    const result = evaluateOrdering(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'ordering',
        status: 'confirmed',
        order: [
          'Observar el fenómeno y formular la pregunta',
          'Plantear una hipótesis verificable',
          'Diseñar y ejecutar el experimento controlado',
          'Analizar datos y extraer conclusiones',
        ],
      },
      10,
    );
    expect(result.outcome).toBe('correct');
    expect(result.correct).toBe(true);
    expect(result.score).toBe(10);
    expect(result.correctPositionsCount).toBe(4);
    expect(result.studentFeedback).toBe(baseDefinition.hint);
  });

  it('califica como incorrecta con 0 puntos si alguna posición falla y devuelve la pista orientadora', () => {
    const result = evaluateOrdering(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'ordering',
        status: 'confirmed',
        order: [
          'Plantear una hipótesis verificable',
          'Observar el fenómeno y formular la pregunta',
          'Diseñar y ejecutar el experimento controlado',
          'Analizar datos y extraer conclusiones',
        ],
      },
      10,
    );
    expect(result.outcome).toBe('incorrect');
    expect(result.correct).toBe(false);
    expect(result.score).toBe(0);
    expect(result.correctPositionsCount).toBe(2);
    expect(result.studentFeedback).toBe(baseDefinition.hint);
  });

  it('procesa omisión y tiempo parcial sin calificar como error, y rechaza pasos ajenos', () => {
    const omitted = evaluateOrdering(baseDefinition, createEmptyOrderingResponse('occ-1', baseDefinition.id), 10);
    expect(omitted.outcome).toBe('omitted');
    expect(omitted.correct).toBeNull();
    expect(omitted.score).toBe(0);

    const timeout = evaluateOrdering(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'ordering',
        status: 'partial_timeout',
        order: ['Observar el fenómeno y formular la pregunta'],
      },
      10,
    );
    expect(timeout.outcome).toBe('timeout');
    expect(timeout.correct).toBeNull();
    expect(formatOrderingReport(baseDefinition, timeout).studentAnswer).toContain('Sin confirmar por tiempo');

    const foreign = evaluateOrdering(
      baseDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: baseDefinition.id,
        activityType: 'ordering',
        status: 'confirmed',
        order: ['Paso inventado', 'Otro paso', 'Tercero', 'Cuarto'],
      },
      10,
    );
    expect(foreign.outcome).toBe('rejected');
  });
});
