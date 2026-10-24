import { describe, expect, it } from 'vitest';
import {
  createEmptyTrueFalseResponse,
  evaluateTrueFalse,
  formatTrueFalseReport,
  toTrueFalsePublic,
  validateTrueFalseDefinition,
  type TrueFalsePrivate,
} from './trueFalse';

// Datos técnicos de prueba (Fixture); no constituyen material pedagógico.
const definition: TrueFalsePrivate = {
  type: 'trueFalse',
  id: 'tf-1',
  context: 'Fixture: contexto de prueba.',
  statement: 'Fixture: afirmación A.',
  correct: false,
  explanation: 'Fixture: explicación privada.',
  hint: 'Fixture: pista orientadora.',
};

const answer = (value: boolean | null, status: 'confirmed' | 'omitted' | 'partial_timeout' = 'confirmed') => ({
  occurrenceId: 'occ-1',
  activityId: 'tf-1',
  activityType: 'trueFalse' as const,
  status,
  value,
});

describe('Falso/verdadero · validación de la definición', () => {
  it('acepta una definición completa', () => {
    expect(validateTrueFalseDefinition(definition)).toEqual([]);
  });

  it('exige la clave explícita: no asume verdadero por defecto', () => {
    const { correct, ...withoutKey } = definition;
    expect(validateTrueFalseDefinition(withoutKey).map((i) => i.path)).toContain('correct');
    expect(validateTrueFalseDefinition({ ...definition, correct: 'true' }).map((i) => i.path)).toContain('correct');
  });

  it('exige afirmación y pista no vacías; contexto y explicación son opcionales', () => {
    const paths = validateTrueFalseDefinition({ ...definition, statement: '  ', hint: '' }).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['statement', 'hint']));
    const { context, explanation, ...minimal } = definition;
    expect(validateTrueFalseDefinition(minimal)).toEqual([]);
  });

  it('rechaza propiedades no permitidas, otro tipo y textos excesivos', () => {
    const paths = validateTrueFalseDefinition({
      ...definition,
      type: 'singleChoice',
      extra: 1,
      statement: 'x'.repeat(501),
    }).map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['type', 'extra', 'statement']));
  });
});

describe('Falso/verdadero · vista pública', () => {
  it('no contiene clave, explicación ni pista', () => {
    const view = toTrueFalsePublic(definition);
    const serialized = JSON.stringify(view);
    expect(view).toEqual({ type: 'trueFalse', id: 'tf-1', context: definition.context, statement: definition.statement });
    expect(serialized).not.toContain('correct');
    expect(serialized).not.toContain('explicación privada');
    expect(serialized).not.toContain('pista');
  });
});

describe('Falso/verdadero · evaluación', () => {
  it('califica correcta e incorrecta según la clave', () => {
    expect(evaluateTrueFalse(definition, answer(false), 10)).toMatchObject({ outcome: 'correct', correct: true, score: 10 });
    expect(evaluateTrueFalse(definition, answer(true), 10)).toMatchObject({ outcome: 'incorrect', correct: false, score: 0 });
  });

  it('entrega la misma pista acierte o falle, sin delatar la clave', () => {
    const right = evaluateTrueFalse(definition, answer(false), 10);
    const wrong = evaluateTrueFalse(definition, answer(true), 10);
    expect(right.studentFeedback).toBe(definition.hint);
    expect(wrong.studentFeedback).toBe(right.studentFeedback);
  });

  it('una omisión no equivale a Falso aunque la clave sea Falso', () => {
    const result = evaluateTrueFalse(definition, createEmptyTrueFalseResponse('occ-1', 'tf-1'), 10);
    expect(result).toMatchObject({ outcome: 'omitted', correct: null, score: 0, recordedValue: null, studentFeedback: null });
  });

  it('con tiempo agotado conserva el valor marcado pero no lo puntúa', () => {
    const result = evaluateTrueFalse(definition, answer(false, 'partial_timeout'), 10);
    expect(result).toMatchObject({ outcome: 'timeout', correct: null, score: 0, recordedValue: false, studentFeedback: null });
  });

  it('rechaza respuestas de otro tipo, de otra actividad o mal formadas', () => {
    const cases: unknown[] = [
      { ...answer(false), activityType: 'singleChoice' },
      { ...answer(false), activityId: 'otra' },
      { ...answer(false), value: 'false' },
      { ...answer(false), extra: true },
      answer(null, 'confirmed'),
      answer(true, 'omitted'),
      null,
    ];
    for (const item of cases) {
      const result = evaluateTrueFalse(definition, item, 10);
      expect(result.outcome).toBe('rejected');
      expect(result.score).toBe(0);
      expect(result.rejectionReason).toBeTruthy();
    }
  });
});

describe('Falso/verdadero · reporte docente', () => {
  it('usa etiquetas legibles e incluye explicación y pista entregada', () => {
    const report = formatTrueFalseReport(definition, evaluateTrueFalse(definition, answer(true), 10));
    expect(report).toEqual({
      afirmacion: definition.statement,
      claveCorrecta: 'Falso',
      respuestaEstudiante: 'Verdadero',
      resultado: 'Incorrecta',
      puntaje: '0/10',
      pistaEntregada: definition.hint,
      explicacion: definition.explanation,
    });
    const omitted = formatTrueFalseReport(definition, evaluateTrueFalse(definition, answer(null, 'omitted'), 10));
    expect(omitted).toMatchObject({ respuestaEstudiante: 'Sin respuesta', resultado: 'Omitida', pistaEntregada: '' });
  });
});
