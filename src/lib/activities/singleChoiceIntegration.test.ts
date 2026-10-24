import { describe, expect, it } from 'vitest';
import { compareActivityResponse, evaluateActivityResponse, type Activity } from '../activityEngine';

// Integración del contrato v1.2 de Selección única con el motor común (datos técnicos Fixture).
const activity: Activity = {
  id: 'sc-int',
  title: 'Fixture Selección única',
  type: 'singleChoice',
  topic: 'Fixture',
  difficulty: 'Intermedio',
  prompt: '¿Cuál es el paso inicial para validar una hipótesis experimental?',
  options: [
    'Definir las variables controladas y dependientes',
    'Publicar los resultados preliminares',
    'Descartar las mediciones atípicas sin registro',
  ],
  answer: 'Definir las variables controladas y dependientes',
  feedback: 'Recuerda qué condición permite que el experimento sea reproducible.',
  status: 'published',
  details: {
    singleChoice: {
      context: 'Un grupo de estudiantes diseña un protocolo de laboratorio.',
      hint: 'Recuerda qué condición permite que el experimento sea reproducible.',
      explanation: 'Sin variables definidas no es posible aislar el efecto del factor estudiado.',
      options: [
        { id: 'opt-a', label: 'Definir las variables controladas y dependientes', correct: true },
        { id: 'opt-b', label: 'Publicar los resultados preliminares', correct: false },
        { id: 'opt-c', label: 'Descartar las mediciones atípicas sin registro', correct: false },
      ],
    },
  },
};

describe('Motor común · Selección única v1.2', () => {
  it('una respuesta vacía se registra como omitida, no como respuesta incorrecta', () => {
    expect(evaluateActivityResponse(activity, { type: 'singleChoice', value: '' }, 10)).toEqual({
      response: '',
      status: 'omitted',
      correct: null,
      score: 0,
    });
  });

  it('califica según la opción marcada como correcta tanto por etiqueta como por ID', () => {
    expect(
      evaluateActivityResponse(activity, { type: 'singleChoice', value: 'Definir las variables controladas y dependientes' }, 10),
    ).toMatchObject({ status: 'answered', correct: true, score: 10 });
    expect(evaluateActivityResponse(activity, { type: 'singleChoice', value: 'opt-a' }, 10)).toMatchObject({
      status: 'answered',
      correct: true,
      score: 10,
    });
    expect(
      evaluateActivityResponse(activity, { type: 'singleChoice', value: 'Publicar los resultados preliminares' }, 10),
    ).toMatchObject({ status: 'answered', correct: false, score: 0 });
  });

  it('una respuesta de Selección única no puntúa en una actividad de otro tipo', () => {
    const other: Activity = {
      ...activity,
      id: 'tf',
      type: 'trueFalse',
      options: ['Verdadero', 'Falso'],
      answer: 'Verdadero',
      details: { trueFalse: { statement: 'Afirmación', correct: true, explanation: 'Explicación' } },
    };
    expect(compareActivityResponse(other, { type: 'singleChoice', value: 'Verdadero' })).toBe(false);
  });
});
