import { describe, expect, it } from 'vitest';
import {
  createEmptySingleChoiceResponse,
  evaluateSingleChoice,
  formatSingleChoiceReport,
  isSingleChoiceDefinition,
  SINGLE_CHOICE_LIMITS,
  toSingleChoicePublic,
  validateSingleChoiceDefinition,
  type SingleChoicePrivate,
} from './singleChoice';

const sampleDefinition: SingleChoicePrivate = {
  type: 'singleChoice',
  id: 'sc-1',
  context: 'Un equipo de laboratorio registra una variación repentina de temperatura en un cultivo bacteriano.',
  prompt: '¿Qué variable debe controlarse primero para aislar la causa de la variación?',
  options: [
    { id: 'opt-1', label: 'La calibración del termostato de la incubadora', correct: true },
    { id: 'opt-2', label: 'El color del recipiente externo', correct: false },
    { id: 'opt-3', label: 'El orden alfabético de las muestras', correct: false },
  ],
  hint: 'Revisa qué factor interviene directamente en la transferencia de calor dentro de la incubadora.',
  explanation: 'El termostato regula directamente la temperatura interna; los demás factores no alteran el equilibrio térmico.',
};

describe('Contrato modular singleChoice v1.2', () => {
  it('acepta una definición completa y válida', () => {
    expect(validateSingleChoiceDefinition(sampleDefinition)).toEqual([]);
    expect(isSingleChoiceDefinition(sampleDefinition)).toBe(true);
  });

  it('rechaza definiciones sin opción correcta marcada o con más de una correcta', () => {
    const withoutCorrect = {
      ...sampleDefinition,
      options: sampleDefinition.options.map((option) => ({ ...option, correct: false })),
    };
    const withTwoCorrect = {
      ...sampleDefinition,
      options: sampleDefinition.options.map((option, index) => ({ ...option, correct: index < 2 })),
    };
    expect(validateSingleChoiceDefinition(withoutCorrect).map((issue) => issue.path)).toContain('correct');
    expect(validateSingleChoiceDefinition(withTwoCorrect).map((issue) => issue.path)).toContain('correct');
  });

  it('rechaza opciones duplicadas normalizando espacios y mayúsculas', () => {
    const duplicated = {
      ...sampleDefinition,
      options: [
        { id: 'opt-1', label: 'Controlar el termostato', correct: true },
        { id: 'opt-2', label: '  controlar   el TERMOSTATO ', correct: false },
      ],
    };
    const issues = validateSingleChoiceDefinition(duplicated);
    expect(issues.some((issue) => issue.path === 'options[1].label')).toBe(true);
  });

  it('exige entre 2 y 6 opciones y rechaza textos vacíos o marcadores prohibidos', () => {
    const onlyOneOption = {
      ...sampleDefinition,
      options: [{ id: 'opt-1', label: 'Única opción', correct: true }],
    };
    expect(validateSingleChoiceDefinition(onlyOneOption).map((issue) => issue.path)).toContain('options');

    const withPlaceholder = {
      ...sampleDefinition,
      hint: 'N/A',
      options: [
        { id: 'opt-1', label: 'Opción válida', correct: true },
        { id: 'opt-2', label: 'pendiente', correct: false },
      ],
    };
    const paths = validateSingleChoiceDefinition(withPlaceholder).map((issue) => issue.path);
    expect(paths).toContain('hint');
    expect(paths).toContain('options[1].label');
  });

  it('valida los límites de longitud de enunciado, contexto, opciones, pista y explicación', () => {
    const tooLong = {
      ...sampleDefinition,
      context: 'x'.repeat(SINGLE_CHOICE_LIMITS.context + 1),
      prompt: 'x'.repeat(SINGLE_CHOICE_LIMITS.prompt + 1),
      hint: 'x'.repeat(SINGLE_CHOICE_LIMITS.hint + 1),
      explanation: 'x'.repeat(SINGLE_CHOICE_LIMITS.explanation + 1),
      options: [
        { id: 'opt-1', label: 'x'.repeat(SINGLE_CHOICE_LIMITS.optionLabel + 1), correct: true },
        { id: 'opt-2', label: 'Opción 2', correct: false },
      ],
    };
    const paths = validateSingleChoiceDefinition(tooLong).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['context', 'prompt', 'hint', 'explanation', 'options[0].label']));
  });

  it('elimina la clave correcta, la pista y la explicación en la proyección pública para el estudiante', () => {
    const pub = toSingleChoicePublic(sampleDefinition);
    expect(pub).toEqual({
      type: 'singleChoice',
      id: 'sc-1',
      context: sampleDefinition.context,
      prompt: sampleDefinition.prompt,
      options: [
        { id: 'opt-1', label: 'La calibración del termostato de la incubadora' },
        { id: 'opt-2', label: 'El color del recipiente externo' },
        { id: 'opt-3', label: 'El orden alfabético de las muestras' },
      ],
    });
    expect('hint' in pub).toBe(false);
    expect('explanation' in pub).toBe(false);
    pub.options.forEach((option) => {
      expect('correct' in option).toBe(false);
    });
  });

  it('califica respuestas confirmadas por ID o etiqueta y entrega siempre la misma pista orientadora', () => {
    const hitById = evaluateSingleChoice(
      sampleDefinition,
      { occurrenceId: 'occ-1', activityId: 'sc-1', activityType: 'singleChoice', status: 'confirmed', value: 'opt-1' },
      10,
    );
    const missByLabel = evaluateSingleChoice(
      sampleDefinition,
      {
        occurrenceId: 'occ-2',
        activityId: 'sc-1',
        activityType: 'singleChoice',
        status: 'confirmed',
        value: 'El color del recipiente externo',
      },
      10,
    );

    expect(hitById).toMatchObject({
      outcome: 'correct',
      correct: true,
      score: 10,
      recordedValue: 'La calibración del termostato de la incubadora',
      recordedOptionId: 'opt-1',
      studentFeedback: sampleDefinition.hint,
    });
    expect(missByLabel).toMatchObject({
      outcome: 'incorrect',
      correct: false,
      score: 0,
      recordedValue: 'El color del recipiente externo',
      recordedOptionId: 'opt-2',
      studentFeedback: sampleDefinition.hint,
    });
    expect(hitById.studentFeedback).toBe(missByLabel.studentFeedback);
  });

  it('distingue omisión y tiempo agotado sin otorgar puntos ni mostrar pista', () => {
    const empty = createEmptySingleChoiceResponse('occ-1', 'sc-1');
    const omitted = evaluateSingleChoice(sampleDefinition, empty, 10);
    expect(omitted).toMatchObject({
      outcome: 'omitted',
      correct: null,
      score: 0,
      recordedValue: null,
      studentFeedback: null,
    });

    const timeout = evaluateSingleChoice(
      sampleDefinition,
      { occurrenceId: 'occ-1', activityId: 'sc-1', activityType: 'singleChoice', status: 'partial_timeout', value: 'opt-1' },
      10,
    );
    expect(timeout).toMatchObject({
      outcome: 'timeout',
      correct: null,
      score: 0,
      recordedValue: 'La calibración del termostato de la incubadora',
      recordedOptionId: 'opt-1',
      studentFeedback: null,
    });
  });

  it('rechaza respuestas con opciones inexistentes, de otra actividad o de otro tipo', () => {
    const unknownOption = evaluateSingleChoice(
      sampleDefinition,
      { occurrenceId: 'occ-1', activityId: 'sc-1', activityType: 'singleChoice', status: 'confirmed', value: 'Opción inventada' },
      10,
    );
    expect(unknownOption.outcome).toBe('rejected');

    const wrongType = evaluateSingleChoice(
      sampleDefinition,
      { occurrenceId: 'occ-1', activityId: 'sc-1', activityType: 'trueFalse', status: 'confirmed', value: 'opt-1' },
      10,
    );
    expect(wrongType.outcome).toBe('rejected');
  });

  it('genera fila legible para el docente y exportación CSV sin exponer IDs internos', () => {
    const hit = evaluateSingleChoice(
      sampleDefinition,
      { occurrenceId: 'occ-1', activityId: 'sc-1', activityType: 'singleChoice', status: 'confirmed', value: 'opt-1' },
      10,
    );
    const report = formatSingleChoiceReport(sampleDefinition, hit);
    expect(report).toEqual({
      pregunta: sampleDefinition.prompt,
      claveCorrecta: 'La calibración del termostato de la incubadora',
      respuestaEstudiante: 'La calibración del termostato de la incubadora',
      resultado: 'Correcta',
      puntaje: '10/10',
      pistaEntregada: sampleDefinition.hint,
      explicacion: sampleDefinition.explanation,
    });
  });
});
