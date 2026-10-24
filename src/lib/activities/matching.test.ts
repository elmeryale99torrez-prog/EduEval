import { describe, expect, it } from 'vitest';
import {
  createEmptyMatchingResponse,
  evaluateMatching,
  formatMatchingReport,
  isMatchingDefinition,
  MATCHING_LIMITS,
  toMatchingPublic,
  validateMatchingDefinition,
  type MatchingPrivate,
} from './matching';

const sampleDefinition: MatchingPrivate = {
  type: 'matching',
  id: 'm-1',
  context: 'En un proyecto de gestión socioambiental participan tres actores con funciones diferenciadas.',
  prompt: 'Enlaza cada actor con su responsabilidad principal dentro del proyecto.',
  pairs: [
    { id: 'p-1', left: 'Comité estudiantil', right: 'Levanta diagnósticos participativos en el aula' },
    { id: 'p-2', left: 'Equipo docente', right: 'Articula los criterios pedagógicos y el seguimiento' },
    { id: 'p-3', left: 'Comunidad local', right: 'Aporta conocimiento territorial y validación social' },
  ],
  hint: 'Identifica qué actor tiene acceso directo al aula, cuál guía la metodología y cuál conoce el entorno.',
  explanation: 'Cada rol se distingue por su ámbito de acción: aula (estudiantes), currículo (docentes) y territorio (comunidad).',
};

describe('Contrato modular matching v1.2', () => {
  it('acepta una definición completa y válida', () => {
    expect(validateMatchingDefinition(sampleDefinition)).toEqual([]);
    expect(isMatchingDefinition(sampleDefinition)).toBe(true);
  });

  it('exige entre 2 y 6 pares y rechaza lados vacíos o marcadores prohibidos', () => {
    const onlyOnePair = {
      ...sampleDefinition,
      pairs: [{ id: 'p-1', left: 'Concepto único', right: 'Definición única' }],
    };
    expect(validateMatchingDefinition(onlyOnePair).map((issue) => issue.path)).toContain('pairs');

    const withPlaceholders = {
      ...sampleDefinition,
      hint: 'pendiente',
      pairs: [
        { id: 'p-1', left: 'N/A', right: 'Definición válida' },
        { id: 'p-2', left: 'Concepto 2', right: '   ' },
      ],
    };
    const paths = validateMatchingDefinition(withPlaceholders).map((issue) => issue.path);
    expect(paths).toEqual(expect.arrayContaining(['hint', 'pairs[0].left', 'pairs[1].right']));
  });

  it('rechaza conceptos o definiciones duplicadas y pares con el mismo texto en ambos lados', () => {
    const duplicated = {
      ...sampleDefinition,
      pairs: [
        { id: 'p-1', left: 'Actor A', right: 'Función 1' },
        { id: 'p-2', left: '  actor a ', right: 'Función 2' },
        { id: 'p-3', left: 'Mismo texto', right: 'mismo TEXTO' },
      ],
    };
    const paths = validateMatchingDefinition(duplicated).map((issue) => issue.path);
    expect(paths).toContain('pairs[1].left');
    expect(paths).toContain('pairs[2].right');
  });

  it('valida los límites de longitud en todos los campos', () => {
    const tooLong = {
      ...sampleDefinition,
      context: 'x'.repeat(MATCHING_LIMITS.context + 1),
      prompt: 'x'.repeat(MATCHING_LIMITS.prompt + 1),
      hint: 'x'.repeat(MATCHING_LIMITS.hint + 1),
      explanation: 'x'.repeat(MATCHING_LIMITS.explanation + 1),
      pairs: [
        {
          id: 'p-1',
          left: 'x'.repeat(MATCHING_LIMITS.leftText + 1),
          right: 'x'.repeat(MATCHING_LIMITS.rightText + 1),
        },
        { id: 'p-2', left: 'Concepto 2', right: 'Definición 2' },
      ],
    };
    const paths = validateMatchingDefinition(tooLong).map((issue) => issue.path);
    expect(paths).toEqual(
      expect.arrayContaining(['context', 'prompt', 'hint', 'explanation', 'pairs[0].left', 'pairs[0].right']),
    );
  });

  it('proyecta la vista pública separando las dos columnas, desordenando la derecha y ocultando la clave', () => {
    const pub = toMatchingPublic(sampleDefinition);
    expect(pub.leftItems).toEqual([
      { id: 'p-1', text: 'Comité estudiantil' },
      { id: 'p-2', text: 'Equipo docente' },
      { id: 'p-3', text: 'Comunidad local' },
    ]);
    // La columna derecha contiene exactamente las mismas opciones pero en un orden distinto al 1-a-1 original
    expect(new Set(pub.rightOptions)).toEqual(
      new Set(sampleDefinition.pairs.map((pair) => pair.right)),
    );
    expect(pub.rightOptions).not.toEqual(sampleDefinition.pairs.map((pair) => pair.right));
    expect('pairs' in pub).toBe(false);
    expect('hint' in pub).toBe(false);
    expect('explanation' in pub).toBe(false);
  });

  it('califica como correcta cuando todos los pares coinciden e incorrecta si falla alguno, entregando la misma pista', () => {
    const allCorrect = evaluateMatching(
      sampleDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: 'm-1',
        activityType: 'matching',
        status: 'confirmed',
        pairs: {
          'Comité estudiantil': 'Levanta diagnósticos participativos en el aula',
          'Equipo docente': 'Articula los criterios pedagógicos y el seguimiento',
          'Comunidad local': 'Aporta conocimiento territorial y validación social',
        },
      },
      10,
    );

    const oneSwapped = evaluateMatching(
      sampleDefinition,
      {
        occurrenceId: 'occ-2',
        activityId: 'm-1',
        activityType: 'matching',
        status: 'confirmed',
        pairs: {
          'Comité estudiantil': 'Levanta diagnósticos participativos en el aula',
          'Equipo docente': 'Aporta conocimiento territorial y validación social',
          'Comunidad local': 'Articula los criterios pedagógicos y el seguimiento',
        },
      },
      10,
    );

    expect(allCorrect).toMatchObject({
      outcome: 'correct',
      correct: true,
      score: 10,
      matchedCount: 3,
      totalPairs: 3,
      studentFeedback: sampleDefinition.hint,
    });
    expect(oneSwapped).toMatchObject({
      outcome: 'incorrect',
      correct: false,
      score: 0,
      matchedCount: 1,
      totalPairs: 3,
      studentFeedback: sampleDefinition.hint,
    });
    expect(allCorrect.studentFeedback).toBe(oneSwapped.studentFeedback);
  });

  it('distingue omisión y tiempo agotado con enlaces parciales sin otorgar puntaje', () => {
    const empty = createEmptyMatchingResponse('occ-1', 'm-1');
    const omitted = evaluateMatching(sampleDefinition, empty, 10);
    expect(omitted).toMatchObject({
      outcome: 'omitted',
      correct: null,
      score: 0,
      matchedCount: 0,
      studentFeedback: null,
    });

    const partialTimeout = evaluateMatching(
      sampleDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: 'm-1',
        activityType: 'matching',
        status: 'partial_timeout',
        pairs: {
          'Comité estudiantil': 'Levanta diagnósticos participativos en el aula',
        },
      },
      10,
    );
    expect(partialTimeout).toMatchObject({
      outcome: 'timeout',
      correct: null,
      score: 0,
      matchedCount: 1,
      recordedPairs: {
        'Comité estudiantil': 'Levanta diagnósticos participativos en el aula',
      },
      studentFeedback: null,
    });
  });

  it('rechaza respuestas incompletas marcadas como confirmadas o con conceptos inventados', () => {
    const incompleteConfirmed = evaluateMatching(
      sampleDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: 'm-1',
        activityType: 'matching',
        status: 'confirmed',
        pairs: {
          'Comité estudiantil': 'Levanta diagnósticos participativos en el aula',
        },
      },
      10,
    );
    expect(incompleteConfirmed.outcome).toBe('rejected');

    const unknownConcept = evaluateMatching(
      sampleDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: 'm-1',
        activityType: 'matching',
        status: 'confirmed',
        pairs: {
          'Actor inventado': 'Levanta diagnósticos participativos en el aula',
          'Equipo docente': 'Articula los criterios pedagógicos y el seguimiento',
          'Comunidad local': 'Aporta conocimiento territorial y validación social',
        },
      },
      10,
    );
    expect(unknownConcept.outcome).toBe('rejected');
  });

  it('genera fila legible para el docente y exportación CSV', () => {
    const hit = evaluateMatching(
      sampleDefinition,
      {
        occurrenceId: 'occ-1',
        activityId: 'm-1',
        activityType: 'matching',
        status: 'confirmed',
        pairs: {
          'Comité estudiantil': 'Levanta diagnósticos participativos en el aula',
          'Equipo docente': 'Articula los criterios pedagógicos y el seguimiento',
          'Comunidad local': 'Aporta conocimiento territorial y validación social',
        },
      },
      10,
    );
    const report = formatMatchingReport(sampleDefinition, hit);
    expect(report).toMatchObject({
      consigna: sampleDefinition.prompt,
      aciertosPares: '3/3',
      resultado: 'Correcta',
      puntaje: '10/10',
      pistaEntregada: sampleDefinition.hint,
      explicacion: sampleDefinition.explanation,
    });
  });
});
