import { describe, expect, it } from 'vitest'
import {
  activityRuntime,
  compareActivityResponse,
  createInitialResponse,
  evaluateActivityResponse,
  isResponseComplete,
  serializeActivityResponse,
} from './activityEngine'
import type { Activity } from './activityEngine'

const baseActivity = (type: Activity['type'], overrides: Partial<Activity> = {}): Activity => ({
  id: `test-${type}`,
  title: `Prueba ${type}`,
  type,
  topic: 'Demo',
  difficulty: 'Inicial',
  prompt: 'Responde la actividad.',
  options: ['A', 'B', 'C'],
  answer: 'A',
  feedback: 'Feedback orientador.',
  status: 'published',
  ...overrides,
})

describe('activityEngine', () => {
  it('normaliza una actividad antigua sin details', () => {
    const activity = baseActivity('trueFalse', { prompt: 'El agua es un recurso limitado.', options: ['Verdadero', 'Falso'], answer: 'Verdadero' })
    expect(activityRuntime(activity).trueFalse).toEqual({ statement: activity.prompt, correct: true, explanation: activity.feedback })
  })

  it('evalúa escenario por etapas y permite enviar una respuesta incorrecta', () => {
    const activity = baseActivity('scenario', {
      details: { scenario: { situation: 'Una decisión.', stages: [{ id: 'stage-1', title: 'Paso 1', prompt: '¿Qué haces?', options: [
        { id: 'good', text: 'Escuchar', consequence: 'Comprendes.', feedback: 'Bien.', recommended: true },
        { id: 'bad', text: 'Ignorar', consequence: 'Empeora.', feedback: 'Revisa.', recommended: false },
      ] }] } },
    })
    const wrong = { type: 'scenario' as const, choices: { 'stage-1': 'Ignorar' } }
    const correct = { type: 'scenario' as const, choices: { 'stage-1': 'Escuchar' } }
    expect(isResponseComplete(activity, wrong)).toBe(true)
    expect(compareActivityResponse(activity, wrong)).toBe(false)
    expect(compareActivityResponse(activity, correct)).toBe(true)
  })

  it('califica verdadero/falso y selección única con una sola respuesta correcta', () => {
    const trueFalse = baseActivity('trueFalse', { options: ['Verdadero', 'Falso'], answer: 'Falso', details: { trueFalse: { statement: 'Afirmación', correct: false, explanation: 'Explicación.' } } })
    const singleChoice = baseActivity('singleChoice', { details: { singleChoice: { options: [
      { id: 'a', label: 'A', correct: false },
      { id: 'b', label: 'B', correct: true },
    ] } } })
    expect(compareActivityResponse(trueFalse, { type: 'trueFalse', value: 'Falso' })).toBe(true)
    expect(compareActivityResponse(trueFalse, { type: 'trueFalse', value: 'Verdadero' })).toBe(false)
    expect(compareActivityResponse(singleChoice, { type: 'singleChoice', value: 'B' })).toBe(true)
    expect(compareActivityResponse(singleChoice, { type: 'singleChoice', value: 'A' })).toBe(false)
  })

  it('evalúa asociación y conserva las relaciones tipadas', () => {
    const activity = baseActivity('matching', { details: { matching: { pairs: [
      { id: 'p1', left: 'Concepto', right: 'Definición' },
      { id: 'p2', left: 'Ejemplo', right: 'Caso' },
    ] } } })
    const response = { type: 'matching' as const, pairs: { Concepto: 'Definición', Ejemplo: 'Caso' } }
    expect(isResponseComplete(activity, response)).toBe(true)
    expect(compareActivityResponse(activity, response)).toBe(true)
    expect(serializeActivityResponse(response)).toContain('Concepto → Definición')
  })

  it('evalúa clasificación usando las categorías configuradas, no categorías fijas', () => {
    const activity = baseActivity('sorting', { details: { sorting: { categories: ['Prioridad alta', 'Prioridad baja'], items: [
      { id: 'i1', label: 'Urgente', category: 'Prioridad alta' },
      { id: 'i2', label: 'Planificable', category: 'Prioridad baja' },
    ] } } })
    const response = { type: 'sorting' as const, assignments: { i1: 'Prioridad alta', i2: 'Prioridad baja' } }
    expect(activityRuntime(activity).sorting.categories).toEqual(['Prioridad alta', 'Prioridad baja'])
    expect(compareActivityResponse(activity, response)).toBe(true)
    expect(compareActivityResponse(activity, { type: 'sorting', assignments: { i1: 'Prioridad baja', i2: 'Prioridad alta' } })).toBe(false)
  })

  it('crea un orden inicial con los mismos pasos y compara el orden correcto', () => {
    const activity = baseActivity('ordering', { details: { ordering: { steps: ['Reconocer', 'Escuchar', 'Acordar'] } } })
    const initial = createInitialResponse(activity)
    expect(initial.type).toBe('ordering')
    if (initial.type === 'ordering') expect(new Set(initial.order)).toEqual(new Set(['Reconocer', 'Escuchar', 'Acordar']))
    expect(compareActivityResponse(activity, { type: 'ordering', order: ['Reconocer', 'Escuchar', 'Acordar'] })).toBe(true)
    expect(compareActivityResponse(activity, { type: 'ordering', order: ['Escuchar', 'Reconocer', 'Acordar'] })).toBe(false)
  })

  it('devuelve un resultado uniforme para omitidas, correctas e incorrectas', () => {
    const activity = baseActivity('singleChoice')
    expect(evaluateActivityResponse(activity, undefined, 5)).toEqual({ response: '', status: 'omitted', correct: null, score: 0 })
    expect(evaluateActivityResponse(activity, { type: 'singleChoice', value: 'A' }, 5)).toMatchObject({ status: 'answered', correct: true, score: 5, response: 'A' })
    expect(evaluateActivityResponse(activity, { type: 'singleChoice', value: 'B' }, 5)).toMatchObject({ status: 'answered', correct: false, score: 0, response: 'B' })
  })
})
