import { describe, expect, it } from 'vitest';
import { compareActivityResponse, evaluateActivityResponse, type Activity } from '../activityEngine';

// Integración del contrato v1.2 de Asociación con el motor común (datos técnicos Fixture).
const activity: Activity = {
  id: 'm-int',
  title: 'Fixture Asociación',
  type: 'matching',
  topic: 'Fixture',
  difficulty: 'Intermedio',
  prompt: 'Enlaza cada concepto con su función.',
  options: [
    'Estudiante → propone ideas',
    'Docente → facilita el proceso',
    'Comunidad → aporta contexto',
  ],
  answer: [
    'Estudiante → propone ideas',
    'Docente → facilita el proceso',
    'Comunidad → aporta contexto',
  ],
  feedback: 'Observa qué función realiza directamente cada actor en el proceso.',
  status: 'published',
  details: {
    matching: {
      context: 'En una mesa de diálogo escolar intervienen tres actores complementarios.',
      hint: 'Observa qué función realiza directamente cada actor en el proceso.',
      explanation: 'Cada actor tiene un rol específico: proponer desde la vivencia (estudiante), guiar pedagógicamente (docente) y contextualizar (comunidad).',
      pairs: [
        { id: 'p1', left: 'Estudiante', right: 'propone ideas' },
        { id: 'p2', left: 'Docente', right: 'facilita el proceso' },
        { id: 'p3', left: 'Comunidad', right: 'aporta contexto' },
      ],
    },
  },
};

describe('Motor común · Asociación v1.2', () => {
  it('una respuesta con mapa vacío se registra como omitida, no como respuesta incorrecta', () => {
    expect(evaluateActivityResponse(activity, { type: 'matching', pairs: {} }, 10)).toEqual({
      response: '',
      status: 'omitted',
      correct: null,
      score: 0,
    });
  });

  it('califica según la coincidencia exacta de todos los pares', () => {
    expect(
      evaluateActivityResponse(
        activity,
        {
          type: 'matching',
          pairs: {
            Estudiante: 'propone ideas',
            Docente: 'facilita el proceso',
            Comunidad: 'aporta contexto',
          },
        },
        10,
      ),
    ).toMatchObject({ status: 'answered', correct: true, score: 10 });

    expect(
      evaluateActivityResponse(
        activity,
        {
          type: 'matching',
          pairs: {
            Estudiante: 'propone ideas',
            Docente: 'aporta contexto',
            Comunidad: 'facilita el proceso',
          },
        },
        10,
      ),
    ).toMatchObject({ status: 'answered', correct: false, score: 0 });
  });

  it('una respuesta de Asociación no puntúa en una actividad de otro tipo', () => {
    const other: Activity = {
      ...activity,
      id: 'tf',
      type: 'trueFalse',
      options: ['Verdadero', 'Falso'],
      answer: 'Verdadero',
      details: { trueFalse: { statement: 'Afirmación', correct: true, explanation: 'Explicación' } },
    };
    expect(
      compareActivityResponse(other, {
        type: 'matching',
        pairs: {
          Estudiante: 'propone ideas',
          Docente: 'facilita el proceso',
          Comunidad: 'aporta contexto',
        },
      }),
    ).toBe(false);
  });
});
