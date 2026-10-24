/**
 * Contrato modular de la actividad "Ordenamiento" (ordering) — EduEval v1.2.
 *
 * Propósito:
 * - Un archivo independiente por actividad para escalar sin mezclar reglas.
 * - La vista pública (`OrderingPublic`) entrega los pasos desordenados (`scrambledSteps`)
 *   garantizando determinísticamente que nunca aparezcan ya ordenados según la clave.
 * - Tras confirmar una respuesta completa, el estudiante recibe únicamente `hint` (pista orientadora neutral),
 *   igual si acierta toda la secuencia o si falla alguna posición, sin revelar el orden correcto.
 * - La explicación (`explanation`) y el desglose de aciertos quedan reservados para el docente y el CSV.
 */

export const ORDERING_TYPE = 'ordering' as const;

export const ORDERING_LIMITS = {
  context: 1500,
  prompt: 600,
  stepText: 260,
  hint: 400,
  explanation: 1000,
  minSteps: 3,
  maxSteps: 8,
} as const;

/** Definición completa que manejan el editor docente, el backend y los reportes privados. */
export type OrderingPrivate = {
  type: typeof ORDERING_TYPE;
  id: string;
  prompt: string;
  /** Secuencia correcta de pasos en el orden exacto esperado. */
  steps: string[];
  /** Pista orientadora obligatoria que ve el estudiante tras confirmar. No debe revelar el orden correcto. */
  hint: string;
  /** Contexto o marco situacional opcional que introduce el proceso a secuenciar. */
  context?: string;
  /** Justificación privada opcional para el docente y la exportación CSV. */
  explanation?: string;
};

/** Vista pública enviada al estudiante: pasos desordenados sin clave ni explicación. */
export type OrderingPublic = {
  type: typeof ORDERING_TYPE;
  id: string;
  prompt: string;
  scrambledSteps: string[];
  context?: string;
};

export type OrderingResponseStatus = 'confirmed' | 'omitted' | 'partial_timeout';

/** Respuesta del estudiante para una ocurrencia específica dentro de la sala. */
export type OrderingResponse = {
  occurrenceId: string;
  activityId: string;
  activityType: typeof ORDERING_TYPE;
  status: OrderingResponseStatus;
  /** Secuencia propuesta por el estudiante. */
  order: string[];
};

export type OrderingOutcome = 'correct' | 'incorrect' | 'omitted' | 'timeout' | 'rejected';

export type OrderingResult = {
  outcome: OrderingOutcome;
  correct: boolean | null;
  score: number;
  maxScore: number;
  correctPositionsCount: number;
  totalSteps: number;
  recordedOrder: string[];
  /** Pista orientadora mostrada al estudiante tras confirmar. */
  studentFeedback: string | null;
  /** Explicación privada para el docente y el CSV. */
  explanation: string | null;
  rejectionReason?: string;
};

export type OrderingIssue = {
  path: string;
  message: string;
};

const FORBIDDEN_PLACEHOLDERS = new Set(['n/a', 'na', 'ninguno', 'ninguna', 'null', 'undefined', 'todo', 'pendiente', '...']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeForComparison(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function checkTextField(
  issues: OrderingIssue[],
  source: Record<string, unknown>,
  field: 'prompt' | 'hint' | 'context' | 'explanation',
  required: boolean,
) {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === '') {
    if (required) issues.push({ path: field, message: 'Este campo es obligatorio.' });
    return;
  }
  if (typeof raw !== 'string') {
    issues.push({ path: field, message: 'Debe ser un texto.' });
    return;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) issues.push({ path: field, message: 'No puede quedar vacío ni contener solo espacios.' });
    return;
  }
  if (FORBIDDEN_PLACEHOLDERS.has(trimmed.toLowerCase())) {
    issues.push({ path: field, message: 'No uses marcadores vacíos como "N/A" o "pendiente".' });
  }
  const limit = ORDERING_LIMITS[field];
  if (trimmed.length > limit) {
    issues.push({ path: field, message: `Supera el máximo de ${limit} caracteres.` });
  }
}

/** Valida que una definición de Ordenamiento esté lista para publicarse. */
export function validateOrderingDefinition(input: unknown): OrderingIssue[] {
  if (!isRecord(input)) return [{ path: '', message: 'La actividad debe ser un objeto.' }];
  const issues: OrderingIssue[] = [];

  const allowed = ['type', 'id', 'prompt', 'steps', 'hint', 'context', 'explanation'];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      issues.push({ path: key, message: 'Propiedad no permitida en Ordenamiento.' });
    }
  }

  if (input.type !== ORDERING_TYPE) {
    issues.push({ path: 'type', message: 'El tipo debe ser "ordering".' });
  }
  if (typeof input.id !== 'string' || !input.id.trim()) {
    issues.push({ path: 'id', message: 'El identificador es obligatorio.' });
  }

  checkTextField(issues, input, 'prompt', true);
  checkTextField(issues, input, 'hint', true);
  checkTextField(issues, input, 'context', false);
  checkTextField(issues, input, 'explanation', false);

  if (!Array.isArray(input.steps)) {
    issues.push({ path: 'steps', message: 'Los pasos deben ser una lista.' });
    return issues;
  }

  if (
    input.steps.length < ORDERING_LIMITS.minSteps ||
    input.steps.length > ORDERING_LIMITS.maxSteps
  ) {
    issues.push({
      path: 'steps',
      message: `El ordenamiento debe tener entre ${ORDERING_LIMITS.minSteps} y ${ORDERING_LIMITS.maxSteps} pasos.`,
    });
  }

  const seenSteps = new Set<string>();

  input.steps.forEach((rawStep, index) => {
    const stepPath = `steps[${index}]`;
    if (typeof rawStep !== 'string') {
      issues.push({ path: stepPath, message: `El paso ${index + 1} debe ser un texto.` });
      return;
    }
    const text = rawStep.trim();
    if (!text) {
      issues.push({ path: stepPath, message: `Completa el texto del paso ${index + 1}.` });
      return;
    }
    if (text.length > ORDERING_LIMITS.stepText) {
      issues.push({
        path: stepPath,
        message: `El paso ${index + 1} supera el máximo de ${ORDERING_LIMITS.stepText} caracteres.`,
      });
    }
    if (FORBIDDEN_PLACEHOLDERS.has(text.toLowerCase())) {
      issues.push({
        path: stepPath,
        message: `El paso ${index + 1} no puede usar marcadores como "N/A" o "pendiente".`,
      });
    }
    const normalized = normalizeForComparison(text);
    if (seenSteps.has(normalized)) {
      issues.push({ path: stepPath, message: `El paso "${text}" está duplicado en la secuencia.` });
    } else {
      seenSteps.add(normalized);
    }
  });

  return issues;
}

export function isOrderingDefinition(input: unknown): input is OrderingPrivate {
  return validateOrderingDefinition(input).length === 0;
}

/**
 * Desordena determinísticamente los pasos de la secuencia garantizando que el resultado
 * NUNCA sea idéntico a la secuencia original (la clave correcta).
 */
export function scrambleOrderingSteps(steps: string[]): string[] {
  if (steps.length <= 1) return [...steps];

  // Invertir orden
  const result: string[] = [];
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    result.push(steps[i]);
  }

  // Si tiene 4 o más elementos, permutar elementos pares con impares para romper simetría
  if (result.length >= 4) {
    const tmp = result[0];
    result[0] = result[2];
    result[2] = tmp;
  }

  // Garantía determinista estricta: si por alguna razón casual coincidiera con steps, intercambiar 0 y 1
  const matchesExact = result.every((step, idx) => step === steps[idx]);
  if (matchesExact && result.length >= 2) {
    const tmp = result[0];
    result[0] = result[1];
    result[1] = tmp;
  }

  return result;
}

/** Proyección pública: entrega pasos desordenados sin clave ni explicación. */
export function toOrderingPublic(definition: OrderingPrivate): OrderingPublic {
  const cleanSteps = definition.steps.map((s) => s.trim());
  const result: OrderingPublic = {
    type: ORDERING_TYPE,
    id: definition.id,
    prompt: definition.prompt,
    scrambledSteps: scrambleOrderingSteps(cleanSteps),
  };
  if (definition.context?.trim()) result.context = definition.context;
  return result;
}

export function createEmptyOrderingResponse(occurrenceId: string, activityId: string): OrderingResponse {
  return { occurrenceId, activityId, activityType: ORDERING_TYPE, status: 'omitted', order: [] };
}

/** Comprueba la forma exacta de una respuesta recibida (cliente o servidor). */
export function validateOrderingResponse(
  input: unknown,
  definition: Pick<OrderingPrivate, 'id' | 'steps'>,
): string | null {
  if (!isRecord(input)) return 'La respuesta debe ser un objeto.';
  const allowed = ['occurrenceId', 'activityId', 'activityType', 'status', 'order'];
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return `Propiedad no permitida: ${extra}.`;
  if (input.activityType !== ORDERING_TYPE) return 'El tipo de respuesta no corresponde a Ordenamiento.';
  if (input.activityId !== definition.id) return 'La respuesta pertenece a otra actividad.';
  if (typeof input.occurrenceId !== 'string' || !input.occurrenceId.trim()) return 'Falta la ocurrencia.';
  if (input.status !== 'confirmed' && input.status !== 'omitted' && input.status !== 'partial_timeout') {
    return 'Estado de respuesta desconocido.';
  }
  if (!Array.isArray(input.order)) return 'La secuencia de pasos debe ser una lista.';

  const validSteps = new Set(definition.steps.map((s) => s.trim()));

  for (const step of input.order) {
    if (typeof step !== 'string' || !validSteps.has(step.trim())) {
      return `El paso "${step}" no pertenece a esta actividad.`;
    }
  }

  if (input.status === 'confirmed') {
    if (input.order.length !== definition.steps.length) {
      return `La secuencia debe contener exactamente los ${definition.steps.length} pasos.`;
    }
    const proposedSet = new Set(input.order.map((s) => (typeof s === 'string' ? s.trim() : '')));
    if (proposedSet.size !== definition.steps.length) {
      return 'La secuencia no puede tener pasos duplicados u omitidos.';
    }
  }

  if (input.status === 'omitted' && input.order.length > 0) {
    return 'Una respuesta omitida no debe incluir pasos ordenados.';
  }

  return null;
}

/**
 * Evalúa la respuesta del estudiante contra la definición privada.
 * - `confirmed`: compara cada posición de la secuencia con la clave; si coincide al 100% otorga `maxScore`, o 0 si falla alguna, y devuelve `hint`.
 * - `omitted`: 0 puntos, `correct: null`, sin pista.
 * - `partial_timeout`: conserva el orden propuesto como evidencia, 0 puntos, `correct: null`.
 * - Cualquier respuesta inválida se rechaza sin otorgar puntaje.
 */
export function evaluateOrdering(
  definition: OrderingPrivate,
  responseInput: unknown,
  scorePerQuestion: number,
): OrderingResult {
  const maxScore = Math.max(0, Number.isFinite(scorePerQuestion) ? scorePerQuestion : 0);
  const explanation = definition.explanation?.trim() || null;
  const totalSteps = definition.steps.length;

  const rejection = validateOrderingResponse(responseInput, definition);
  if (rejection) {
    return {
      outcome: 'rejected',
      correct: null,
      score: 0,
      maxScore,
      correctPositionsCount: 0,
      totalSteps,
      recordedOrder: [],
      studentFeedback: null,
      explanation,
      rejectionReason: rejection,
    };
  }

  const response = responseInput as OrderingResponse;
  const recordedOrder = response.order.map((s) => s.trim());

  if (response.status === 'omitted') {
    return {
      outcome: 'omitted',
      correct: null,
      score: 0,
      maxScore,
      correctPositionsCount: 0,
      totalSteps,
      recordedOrder: [],
      studentFeedback: null,
      explanation,
    };
  }

  let correctPositionsCount = 0;
  definition.steps.forEach((expectedStep, index) => {
    if (recordedOrder[index] === expectedStep.trim()) {
      correctPositionsCount += 1;
    }
  });

  if (response.status === 'partial_timeout') {
    return {
      outcome: 'timeout',
      correct: null,
      score: 0,
      maxScore,
      correctPositionsCount,
      totalSteps,
      recordedOrder,
      studentFeedback: null,
      explanation,
    };
  }

  const correct = correctPositionsCount === totalSteps && totalSteps > 0;
  return {
    outcome: correct ? 'correct' : 'incorrect',
    correct,
    score: correct ? maxScore : 0,
    maxScore,
    correctPositionsCount,
    totalSteps,
    recordedOrder,
    studentFeedback: definition.hint.trim(),
    explanation,
  };
}

/** Resumen listo para la vista de resultados del docente y la exportación CSV. */
export function formatOrderingReport(definition: OrderingPrivate, result: OrderingResult) {
  const serializedOrder = result.recordedOrder.join(' → ');
  const expectedOrder = definition.steps.map((s) => s.trim()).join(' → ');
  return {
    activityType: ORDERING_TYPE,
    prompt: definition.prompt,
    expectedAnswer: expectedOrder,
    studentAnswer:
      result.outcome === 'omitted'
        ? 'Omitida'
        : result.outcome === 'timeout'
          ? serializedOrder
            ? `Sin confirmar por tiempo (${serializedOrder})`
            : 'Tiempo agotado sin ordenar'
          : result.outcome === 'rejected'
            ? 'Respuesta inválida'
            : serializedOrder,
    outcome: result.outcome,
    correct: result.correct,
    score: result.score,
    maxScore: result.maxScore,
    hintShownToStudent: result.studentFeedback ?? '',
    privateExplanation: result.explanation ?? '',
  };
}
