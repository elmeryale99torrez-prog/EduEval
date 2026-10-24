import { describe, expect, it } from 'vitest';
import { compareActivityResponse, evaluateActivityResponse, type Activity } from '../activityEngine';

// Integración del contrato v1.2 de Falso/verdadero con el motor común (datos técnicos Fixture).
const activity: Activity = {
  id: 'tf-int',
  title: 'Fixture V/F',
  type: 'trueFalse',
  topic: 'Fixture',
  difficulty: 'Avanzado',
  prompt: 'Fixture consigna',
  options: ['Verdadero', 'Falso'],
  answer: 'Falso',
  feedback: 'Fixture pista',
  status: 'published',
  details: { trueFalse: { statement: 'Fixture afirmación', correct: false, explanation: 'Fixture explicación', context: 'Fixture contexto', hint: 'Fixture pista' } },
};

describe('Motor común · Falso/verdadero v1.2', () => {
  it('una respuesta vacía se registra como omitida, no como Falso', () => {
    expect(evaluateActivityResponse(activity, { type: 'trueFalse', value: '' }, 10)).toEqual({ response: '', status: 'omitted', correct: null, score: 0 });
  });

  it('califica según la clave explícita', () => {
    expect(evaluateActivityResponse(activity, { type: 'trueFalse', value: 'Falso' }, 10)).toMatchObject({ status: 'answered', correct: true, score: 10 });
    expect(evaluateActivityResponse(activity, { type: 'trueFalse', value: 'Verdadero' }, 10)).toMatchObject({ status: 'answered', correct: false, score: 0 });
  });

  it('una respuesta de Falso/verdadero no puntúa en una actividad de otro tipo', () => {
    const other: Activity = { ...activity, id: 'sc', type: 'singleChoice', options: ['Falso', 'B'], answer: 'Falso', details: { singleChoice: { options: [{ id: 'a', label: 'Falso', correct: true }, { id: 'b', label: 'B', correct: false }] } } };
    expect(compareActivityResponse(other, { type: 'trueFalse', value: 'Falso' })).toBe(false);
  });
});
