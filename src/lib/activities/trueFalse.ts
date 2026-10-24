/**
 * Contrato y motor independiente de la actividad Falso/verdadero (v1.2).
 *
 * Estado: implementado como módulo aislado y probado con Vitest.
 * Todavía NO está integrado en App.tsx, Supabase, el esquema JSON ni el prompt.
 *
 * Reglas acordadas con el docente (2026-10-24):
 * - Una afirmación por actividad, con contexto/evidencia opcional.
 * - La clave (`correct`) es obligatoria y explícita; nunca se asume un valor por defecto.
 * - `explanation` es privada (docente y CSV); nunca viaja al estudiante.
 * - `hint` es la orientación pública que el estudiante ve solo tras confirmar,
 *   idéntica acierte o falle, para no revelar la clave.
 * - Una omisión no equivale a "Falso".
 * - Una respuesta de otro tipo o de otra actividad se rechaza y no se puntúa.
 */

export const TRUE_FALSE_TYPE = 'trueFalse' as const;

export const TRUE_FALSE_LIMITS = {
  context: 1500,
  statement: 500,
  explanation: 1000,
  hint: 400,
} as const;

/** Definición privada: solo docente y servidor. */
export interface TrueFalsePrivate {
  type: typeof TRUE_FALSE_TYPE;
  id: string;
  context?: string;
  statement: string;
  correct: boolean;
  explanation?: string;
  hint: string;
}

/** Vista pública: lo único que recibe el navegador del estudiante. */
export interface TrueFalsePublic {
  type: typeof TRUE_FALSE_TYPE;
  id: string;
  context?: string;
  statement: string;
}

/** Estado común de una respuesta por ocurrencia. */
export type ResponseStatus = 'confirmed' | 'omitted' | 'partial_timeout';

export interface TrueFalseResponse {
  occurrenceId: string;
  activityId: string;
  activityType: typeof TRUE_FALSE_TYPE;
  status: ResponseStatus;
  value: boolean | null;
}

export type TrueFalseOutcome = 'correct' | 'incorrect' | 'omitted' | 'timeout' | 'rejected';

export interface TrueFalseResult {
  outcome: TrueFalseOutcome;
  /** `null` cuando no hubo respuesta confirmada evaluable. */
  correct: boolean | null;
  score: number;
  maxScore: number;
  /** Valor registrado (se conserva aunque no se haya confirmado). */
  recordedValue: boolean | null;
  /** Lo que puede ver el estudiante: la pista, solo si confirmó. */
  studentFeedback: string | null;
  /** Solo docente y CSV. */
  explanation: string | null;
  /** Motivo técnico cuando la respuesta se rechaza. */
  rejectionReason?: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ALLOWED_DEFINITION_KEYS = ['type', 'id', 'context', 'statement', 'correct', 'explanation', 'hint'];

function checkText(
  issues: ValidationIssue[],
  source: Record<string, unknown>,
  key: keyof typeof TRUE_FALSE_LIMITS,
  required: boolean,
) {
  const value = source[key];
  if (value === undefined) {
    if (required) issues.push({ path: key, message: 'Campo obligatorio.' });
    return;
  }
  if (typeof value !== 'string') {
    issues.push({ path: key, message: 'Debe ser texto.' });
    return;
  }
  const trimmed = value.trim();
  if (required && !trimmed) issues.push({ path: key, message: 'No puede estar vacío.' });
  if (trimmed.length > TRUE_FALSE_LIMITS[key]) {
    issues.push({ path: key, message: `Máximo ${TRUE_FALSE_LIMITS[key]} caracteres.` });
  }
}

/** Valida una definición docente antes de aprobarla para una sala. */
export function validateTrueFalseDefinition(input: unknown): ValidationIssue[] {
  if (!isRecord(input)) return [{ path: '', message: 'La definición debe ser un objeto.' }];
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(input)) {
    if (!ALLOWED_DEFINITION_KEYS.includes(key)) issues.push({ path: key, message: 'Propiedad no permitida.' });
  }
  if (input.type !== TRUE_FALSE_TYPE) issues.push({ path: 'type', message: 'El tipo debe ser "trueFalse".' });
  if (typeof input.id !== 'string' || !input.id.trim()) issues.push({ path: 'id', message: 'Identificador obligatorio.' });
  if (typeof input.correct !== 'boolean') {
    issues.push({ path: 'correct', message: 'La clave debe indicarse explícitamente como verdadero o falso.' });
  }
  checkText(issues, input, 'statement', true);
  checkText(issues, input, 'hint', true);
  checkText(issues, input, 'context', false);
  checkText(issues, input, 'explanation', false);
  return issues;
}

export function isTrueFalseDefinition(input: unknown): input is TrueFalsePrivate {
  return validateTrueFalseDefinition(input).length === 0;
}

/** Proyección pública: elimina clave, explicación y pista. */
export function toTrueFalsePublic(definition: TrueFalsePrivate): TrueFalsePublic {
  const result: TrueFalsePublic = { type: TRUE_FALSE_TYPE, id: definition.id, statement: definition.statement };
  if (definition.context?.trim()) result.context = definition.context;
  return result;
}

export function createEmptyTrueFalseResponse(occurrenceId: string, activityId: string): TrueFalseResponse {
  return { occurrenceId, activityId, activityType: TRUE_FALSE_TYPE, status: 'omitted', value: null };
}

/** Comprueba la forma exacta de una respuesta recibida (cliente o servidor). */
export function validateTrueFalseResponse(input: unknown, activityId: string): string | null {
  if (!isRecord(input)) return 'La respuesta debe ser un objeto.';
  const allowed = ['occurrenceId', 'activityId', 'activityType', 'status', 'value'];
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return `Propiedad no permitida: ${extra}.`;
  if (input.activityType !== TRUE_FALSE_TYPE) return 'El tipo de respuesta no corresponde a Falso/verdadero.';
  if (input.activityId !== activityId) return 'La respuesta pertenece a otra actividad.';
  if (typeof input.occurrenceId !== 'string' || !input.occurrenceId.trim()) return 'Falta la ocurrencia.';
  if (input.status !== 'confirmed' && input.status !== 'omitted' && input.status !== 'partial_timeout') {
    return 'Estado de respuesta desconocido.';
  }
  if (input.value !== null && typeof input.value !== 'boolean') return 'El valor debe ser verdadero, falso o vacío.';
  if (input.status === 'confirmed' && input.value === null) return 'Una respuesta confirmada debe tener valor.';
  if (input.status === 'omitted' && input.value !== null) return 'Una omisión no puede tener valor.';
  return null;
}

/**
 * Evalúa una respuesta contra la definición privada.
 * - confirmada: se compara con la clave.
 * - omitida: 0 puntos, `correct: null`.
 * - tiempo agotado: se conserva el valor marcado como evidencia, pero no se puntúa
 *   porque el estudiante no lo confirmó.
 */
export function evaluateTrueFalse(
  definition: TrueFalsePrivate,
  response: unknown,
  maxScore: number,
): TrueFalseResult {
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0;
  const explanation = definition.explanation?.trim() ? definition.explanation : null;
  const base = { maxScore: safeMax, explanation };

  const problem = validateTrueFalseResponse(response, definition.id);
  if (problem) {
    return { ...base, outcome: 'rejected', correct: null, score: 0, recordedValue: null, studentFeedback: null, rejectionReason: problem };
  }
  const valid = response as TrueFalseResponse;

  if (valid.status === 'omitted') {
    return { ...base, outcome: 'omitted', correct: null, score: 0, recordedValue: null, studentFeedback: null };
  }
  if (valid.status === 'partial_timeout') {
    return { ...base, outcome: 'timeout', correct: null, score: 0, recordedValue: valid.value, studentFeedback: null };
  }
  const correct = valid.value === definition.correct;
  return {
    ...base,
    outcome: correct ? 'correct' : 'incorrect',
    correct,
    score: correct ? safeMax : 0,
    recordedValue: valid.value,
    studentFeedback: definition.hint,
  };
}

const VALUE_LABEL = (value: boolean | null) => (value === null ? 'Sin respuesta' : value ? 'Verdadero' : 'Falso');

const OUTCOME_LABEL: Record<TrueFalseOutcome, string> = {
  correct: 'Correcta',
  incorrect: 'Incorrecta',
  omitted: 'Omitida',
  timeout: 'Tiempo agotado sin confirmar',
  rejected: 'Respuesta rechazada',
};

/** Fila legible para docente y exportación (sin IDs técnicos). */
export function formatTrueFalseReport(definition: TrueFalsePrivate, result: TrueFalseResult) {
  return {
    afirmacion: definition.statement,
    claveCorrecta: VALUE_LABEL(definition.correct),
    respuestaEstudiante: VALUE_LABEL(result.recordedValue),
    resultado: OUTCOME_LABEL[result.outcome],
    puntaje: `${result.score}/${result.maxScore}`,
    pistaEntregada: result.studentFeedback ?? '',
    explicacion: result.explanation ?? '',
  };
}
