/**
 * Contrato modular de la actividad "Asociación" (matching) — EduEval v1.2.
 *
 * Propósito:
 * - Un archivo independiente por actividad para escalar sin mezclar reglas.
 * - La vista pública (`MatchingPublic`) entrega las dos columnas por separado (`leftItems` y `rightOptions` mezcladas)
 *   para que el estudiante enlace tocando las columnas sin recibir los pares ya resueltos en el mismo orden.
 * - Tras confirmar una respuesta completa, el estudiante recibe únicamente `hint` (pista orientadora neutral),
 *   igual si acierta todos los pares o si falla alguno, sin revelar las parejas correctas.
 * - La explicación (`explanation`) y el desglose de aciertos quedan reservados para el docente y el CSV.
 */

export const MATCHING_TYPE = 'matching' as const;

export const MATCHING_LIMITS = {
  context: 1500,
  prompt: 600,
  leftText: 240,
  rightText: 320,
  hint: 400,
  explanation: 1000,
  minPairs: 2,
  maxPairs: 6,
} as const;

export type MatchingPairPrivate = {
  id: string;
  left: string;
  right: string;
};

export type MatchingLeftPublic = {
  id: string;
  text: string;
};

/** Definición completa que manejan el editor docente, el backend y los reportes privados. */
export type MatchingPrivate = {
  type: typeof MATCHING_TYPE;
  id: string;
  prompt: string;
  pairs: MatchingPairPrivate[];
  /** Pista orientadora obligatoria que ve el estudiante tras confirmar. No debe revelar los enlaces correctos. */
  hint: string;
  /** Contexto o marco conceptual opcional que introduce la asociación. */
  context?: string;
  /** Justificación privada opcional para el docente y la exportación CSV. */
  explanation?: string;
};

/** Vista pública enviada al estudiante: columnas separadas y columna derecha desordenada, sin clave ni explicación. */
export type MatchingPublic = {
  type: typeof MATCHING_TYPE;
  id: string;
  prompt: string;
  leftItems: MatchingLeftPublic[];
  rightOptions: string[];
  context?: string;
};

export type MatchingResponseStatus = 'confirmed' | 'omitted' | 'partial_timeout';

/** Respuesta del estudiante para una ocurrencia específica dentro de la sala. */
export type MatchingResponse = {
  occurrenceId: string;
  activityId: string;
  activityType: typeof MATCHING_TYPE;
  status: MatchingResponseStatus;
  /** Mapa de enlaces realizados por el estudiante: `{ [conceptoIzquierda]: definicionDerecha }`. */
  pairs: Record<string, string>;
};

export type MatchingOutcome = 'correct' | 'incorrect' | 'omitted' | 'timeout' | 'rejected';

export type MatchingResult = {
  outcome: MatchingOutcome;
  correct: boolean | null;
  score: number;
  maxScore: number;
  matchedCount: number;
  totalPairs: number;
  recordedPairs: Record<string, string>;
  /** Pista orientadora mostrada al estudiante solo cuando confirma todos los pares. */
  studentFeedback: string | null;
  /** Explicación privada para el docente y el CSV. */
  explanation: string | null;
  rejectionReason?: string;
};

export type MatchingIssue = {
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
  issues: MatchingIssue[],
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
  const limit = MATCHING_LIMITS[field];
  if (trimmed.length > limit) {
    issues.push({ path: field, message: `Supera el máximo de ${limit} caracteres.` });
  }
}

/** Valida que una definición de Asociación esté lista para publicarse. */
export function validateMatchingDefinition(input: unknown): MatchingIssue[] {
  if (!isRecord(input)) return [{ path: '', message: 'La actividad debe ser un objeto.' }];
  const issues: MatchingIssue[] = [];

  const allowed = ['type', 'id', 'prompt', 'pairs', 'hint', 'context', 'explanation'];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      issues.push({ path: key, message: 'Propiedad no permitida en Asociación.' });
    }
  }

  if (input.type !== MATCHING_TYPE) {
    issues.push({ path: 'type', message: 'El tipo debe ser "matching".' });
  }
  if (typeof input.id !== 'string' || !input.id.trim()) {
    issues.push({ path: 'id', message: 'El identificador es obligatorio.' });
  }

  checkTextField(issues, input, 'prompt', true);
  checkTextField(issues, input, 'hint', true);
  checkTextField(issues, input, 'context', false);
  checkTextField(issues, input, 'explanation', false);

  if (!Array.isArray(input.pairs)) {
    issues.push({ path: 'pairs', message: 'Los pares deben ser una lista.' });
    return issues;
  }

  if (input.pairs.length < MATCHING_LIMITS.minPairs || input.pairs.length > MATCHING_LIMITS.maxPairs) {
    issues.push({
      path: 'pairs',
      message: `La asociación debe tener entre ${MATCHING_LIMITS.minPairs} y ${MATCHING_LIMITS.maxPairs} pares.`,
    });
  }

  const seenIds = new Set<string>();
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();

  input.pairs.forEach((rawPair, index) => {
    const pairPath = `pairs[${index}]`;
    if (!isRecord(rawPair)) {
      issues.push({ path: pairPath, message: 'Cada par debe ser un objeto.' });
      return;
    }

    const pairAllowed = ['id', 'left', 'right'];
    for (const key of Object.keys(rawPair)) {
      if (!pairAllowed.includes(key)) {
        issues.push({ path: `${pairPath}.${key}`, message: 'Propiedad no permitida en un par.' });
      }
    }

    const id = typeof rawPair.id === 'string' ? rawPair.id.trim() : '';
    if (!id) {
      issues.push({ path: `${pairPath}.id`, message: 'Cada par necesita un identificador.' });
    } else if (seenIds.has(id)) {
      issues.push({ path: `${pairPath}.id`, message: 'El identificador del par está repetido.' });
    } else {
      seenIds.add(id);
    }

    const left = typeof rawPair.left === 'string' ? rawPair.left.trim() : '';
    if (!left) {
      issues.push({ path: `${pairPath}.left`, message: `Completa el concepto o idea ${index + 1}.` });
    } else {
      if (left.length > MATCHING_LIMITS.leftText) {
        issues.push({
          path: `${pairPath}.left`,
          message: `El concepto ${index + 1} supera el máximo de ${MATCHING_LIMITS.leftText} caracteres.`,
        });
      }
      if (FORBIDDEN_PLACEHOLDERS.has(left.toLowerCase())) {
        issues.push({
          path: `${pairPath}.left`,
          message: `El concepto ${index + 1} no puede usar marcadores como "N/A" o "pendiente".`,
        });
      }
      const normalizedLeft = normalizeForComparison(left);
      if (seenLeft.has(normalizedLeft)) {
        issues.push({ path: `${pairPath}.left`, message: `El concepto "${left}" está duplicado en la columna izquierda.` });
      } else {
        seenLeft.add(normalizedLeft);
      }
    }

    const right = typeof rawPair.right === 'string' ? rawPair.right.trim() : '';
    if (!right) {
      issues.push({ path: `${pairPath}.right`, message: `Completa la relación o definición ${index + 1}.` });
    } else {
      if (right.length > MATCHING_LIMITS.rightText) {
        issues.push({
          path: `${pairPath}.right`,
          message: `La relación ${index + 1} supera el máximo de ${MATCHING_LIMITS.rightText} caracteres.`,
        });
      }
      if (FORBIDDEN_PLACEHOLDERS.has(right.toLowerCase())) {
        issues.push({
          path: `${pairPath}.right`,
          message: `La relación ${index + 1} no puede usar marcadores como "N/A" o "pendiente".`,
        });
      }
      const normalizedRight = normalizeForComparison(right);
      if (seenRight.has(normalizedRight)) {
        issues.push({ path: `${pairPath}.right`, message: `La relación "${right}" está duplicada en la columna derecha.` });
      } else {
        seenRight.add(normalizedRight);
      }
      if (left && normalizeForComparison(left) === normalizedRight) {
        issues.push({
          path: `${pairPath}.right`,
          message: `El par ${index + 1} no puede tener el mismo texto en ambos lados.`,
        });
      }
    }
  });

  return issues;
}

export function isMatchingDefinition(input: unknown): input is MatchingPrivate {
  return validateMatchingDefinition(input).length === 0;
}

/**
 * Desordena de forma determinista las opciones de la columna derecha para que nunca coincidan
 * trivialmente 1 a 1 en el mismo orden que la columna izquierda.
 */
export function scrambleRightOptions(options: string[]): string[] {
  if (options.length <= 1) return [...options];
  // Desplazamiento e inversión intercalada determinista para romper la alineación fila por fila
  const result: string[] = [];
  for (let index = options.length - 1; index >= 0; index -= 1) {
    result.push(options[index]);
  }
  if (result.length >= 3) {
    const first = result[0];
    result[0] = result[1];
    result[1] = first;
  }
  return result;
}

/** Proyección pública: separa columnas, desordena la columna derecha y oculta clave, pista y explicación. */
export function toMatchingPublic(definition: MatchingPrivate): MatchingPublic {
  const result: MatchingPublic = {
    type: MATCHING_TYPE,
    id: definition.id,
    prompt: definition.prompt,
    leftItems: definition.pairs.map((pair) => ({ id: pair.id, text: pair.left.trim() })),
    rightOptions: scrambleRightOptions(definition.pairs.map((pair) => pair.right.trim())),
  };
  if (definition.context?.trim()) result.context = definition.context;
  return result;
}

export function createEmptyMatchingResponse(occurrenceId: string, activityId: string): MatchingResponse {
  return { occurrenceId, activityId, activityType: MATCHING_TYPE, status: 'omitted', pairs: {} };
}

/** Comprueba la forma exacta de una respuesta recibida (cliente o servidor). */
export function validateMatchingResponse(
  input: unknown,
  definition: Pick<MatchingPrivate, 'id' | 'pairs'>,
): string | null {
  if (!isRecord(input)) return 'La respuesta debe ser un objeto.';
  const allowed = ['occurrenceId', 'activityId', 'activityType', 'status', 'pairs'];
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return `Propiedad no permitida: ${extra}.`;
  if (input.activityType !== MATCHING_TYPE) return 'El tipo de respuesta no corresponde a Asociación.';
  if (input.activityId !== definition.id) return 'La respuesta pertenece a otra actividad.';
  if (typeof input.occurrenceId !== 'string' || !input.occurrenceId.trim()) return 'Falta la ocurrencia.';
  if (input.status !== 'confirmed' && input.status !== 'omitted' && input.status !== 'partial_timeout') {
    return 'Estado de respuesta desconocido.';
  }
  if (!isRecord(input.pairs)) return 'El mapa de enlaces debe ser un objeto.';

  const validLeftSet = new Set(definition.pairs.map((pair) => pair.left.trim()));
  const validRightSet = new Set(definition.pairs.map((pair) => pair.right.trim()));
  const entries = Object.entries(input.pairs).filter(([, value]) => typeof value === 'string' && value.trim() !== '');

  for (const [leftKey, rightVal] of Object.entries(input.pairs)) {
    if (typeof rightVal !== 'string') return 'Cada enlace debe ser un texto.';
    const cleanLeft = leftKey.trim();
    const cleanRight = rightVal.trim();
    if (!cleanRight) continue;
    if (!validLeftSet.has(cleanLeft)) {
      return `El concepto "${cleanLeft}" no pertenece a esta actividad.`;
    }
    if (!validRightSet.has(cleanRight)) {
      return `La relación "${cleanRight}" no pertenece a esta actividad.`;
    }
  }

  if (input.status === 'confirmed') {
    if (entries.length !== definition.pairs.length) {
      return 'Una respuesta confirmada debe enlazar todos los pares de la actividad.';
    }
  }
  if (input.status === 'omitted' && entries.length > 0) {
    return 'Una omisión no puede contener pares enlazados.';
  }
  return null;
}

/**
 * Evalúa una respuesta contra la definición privada.
 * - confirmada: verifica que todos los pares coincidan exactamente (`left -> right`).
 * - omitida: 0 puntos, `correct: null`.
 * - tiempo agotado: conserva los enlaces parciales realizados como evidencia, pero no los puntúa.
 */
export function evaluateMatching(
  definition: MatchingPrivate,
  response: unknown,
  maxScore: number,
): MatchingResult {
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0;
  const explanation = definition.explanation?.trim() ? definition.explanation : null;
  const totalPairs = definition.pairs.length;
  const base = { maxScore: safeMax, explanation, totalPairs };

  const problem = validateMatchingResponse(response, definition);
  if (problem) {
    return {
      ...base,
      outcome: 'rejected',
      correct: null,
      score: 0,
      matchedCount: 0,
      recordedPairs: {},
      studentFeedback: null,
      rejectionReason: problem,
    };
  }
  const valid = response as MatchingResponse;

  const cleanRecorded: Record<string, string> = {};
  for (const [left, right] of Object.entries(valid.pairs)) {
    if (typeof right === 'string' && right.trim()) {
      cleanRecorded[left.trim()] = right.trim();
    }
  }

  const matchedCount = definition.pairs.filter(
    (pair) => cleanRecorded[pair.left.trim()] === pair.right.trim(),
  ).length;

  if (valid.status === 'omitted') {
    return {
      ...base,
      outcome: 'omitted',
      correct: null,
      score: 0,
      matchedCount: 0,
      recordedPairs: {},
      studentFeedback: null,
    };
  }

  if (valid.status === 'partial_timeout') {
    return {
      ...base,
      outcome: 'timeout',
      correct: null,
      score: 0,
      matchedCount,
      recordedPairs: cleanRecorded,
      studentFeedback: null,
    };
  }

  const correct = matchedCount === totalPairs && totalPairs > 0;
  return {
    ...base,
    outcome: correct ? 'correct' : 'incorrect',
    correct,
    score: correct ? safeMax : 0,
    matchedCount,
    recordedPairs: cleanRecorded,
    studentFeedback: definition.hint,
  };
}

const OUTCOME_LABEL: Record<MatchingOutcome, string> = {
  correct: 'Correcta',
  incorrect: 'Incorrecta',
  omitted: 'Omitida',
  timeout: 'Tiempo agotado sin confirmar',
  rejected: 'Respuesta rechazada',
};

/** Fila legible para docente y exportación (sin IDs técnicos). */
export function formatMatchingReport(definition: MatchingPrivate, result: MatchingResult) {
  const expected = definition.pairs.map((pair) => `${pair.left.trim()} → ${pair.right.trim()}`).join(' | ');
  const recordedEntries = Object.entries(result.recordedPairs);
  const studentText = recordedEntries.length
    ? recordedEntries.map(([left, right]) => `${left} → ${right}`).join(' | ')
    : 'Sin respuesta';
  return {
    consigna: definition.prompt,
    paresCorrectos: expected,
    respuestaEstudiante: studentText,
    aciertosPares: `${result.matchedCount}/${result.totalPairs}`,
    resultado: OUTCOME_LABEL[result.outcome],
    puntaje: `${result.score}/${result.maxScore}`,
    pistaEntregada: result.studentFeedback ?? '',
    explicacion: result.explanation ?? '',
  };
}
