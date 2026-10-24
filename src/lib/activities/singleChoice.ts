/**
 * Contrato modular de la actividad "Selección múltiple con una sola respuesta correcta" (singleChoice) — EduEval v1.2.
 *
 * Propósito:
 * - Un archivo independiente por actividad para escalar sin mezclar reglas.
 * - La vista pública del estudiante nunca incluye la clave (`correct`), ni la explicación privada (`explanation`),
 *   ni la pista (`hint`) antes de confirmar.
 * - Tras confirmar una respuesta válida, el estudiante recibe únicamente `hint` (pista orientadora neutral),
 *   igual si acierta o falla, sin revelar cuál opción es la correcta.
 * - La explicación (`explanation`) y el estado real (`correct`) quedan reservados para el docente y el CSV.
 */

export const SINGLE_CHOICE_TYPE = 'singleChoice' as const;

export const SINGLE_CHOICE_LIMITS = {
  context: 1500,
  prompt: 600,
  optionLabel: 300,
  hint: 400,
  explanation: 1000,
  minOptions: 2,
  maxOptions: 6,
} as const;

export type SingleChoiceOptionPrivate = {
  id: string;
  label: string;
  correct: boolean;
};

export type SingleChoiceOptionPublic = {
  id: string;
  label: string;
};

/** Definición completa que manejan el editor docente, el backend y los reportes privados. */
export type SingleChoicePrivate = {
  type: typeof SINGLE_CHOICE_TYPE;
  id: string;
  prompt: string;
  options: SingleChoiceOptionPrivate[];
  /** Pista orientadora obligatoria que ve el estudiante tras confirmar. No debe delatar la opción correcta. */
  hint: string;
  /** Contexto o caso opcional que enmarca la pregunta. */
  context?: string;
  /** Justificación privada opcional para el docente y la exportación CSV. */
  explanation?: string;
};

/** Vista pública enviada al estudiante. No incluye `correct`, `explanation` ni `hint`. */
export type SingleChoicePublic = {
  type: typeof SINGLE_CHOICE_TYPE;
  id: string;
  prompt: string;
  options: SingleChoiceOptionPublic[];
  context?: string;
};

export type SingleChoiceResponseStatus = 'confirmed' | 'omitted' | 'partial_timeout';

/** Respuesta del estudiante para una ocurrencia específica dentro de la sala. */
export type SingleChoiceResponse = {
  occurrenceId: string;
  activityId: string;
  activityType: typeof SINGLE_CHOICE_TYPE;
  status: SingleChoiceResponseStatus;
  /** ID o etiqueta de la opción seleccionada, o `null` cuando se omite. */
  value: string | null;
};

export type SingleChoiceOutcome = 'correct' | 'incorrect' | 'omitted' | 'timeout' | 'rejected';

export type SingleChoiceResult = {
  outcome: SingleChoiceOutcome;
  correct: boolean | null;
  score: number;
  maxScore: number;
  /** Etiqueta legible de la opción registrada (o null si no hubo selección). */
  recordedValue: string | null;
  /** ID de la opción registrada (o null si no hubo selección). */
  recordedOptionId: string | null;
  /** Pista orientadora mostrada al estudiante solo cuando confirma una respuesta válida. */
  studentFeedback: string | null;
  /** Explicación privada para el docente y el CSV. */
  explanation: string | null;
  rejectionReason?: string;
};

export type SingleChoiceIssue = {
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
  issues: SingleChoiceIssue[],
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
  const limit = SINGLE_CHOICE_LIMITS[field];
  if (trimmed.length > limit) {
    issues.push({ path: field, message: `Supera el máximo de ${limit} caracteres.` });
  }
}

/** Valida que una definición de Selección única esté lista para publicarse. */
export function validateSingleChoiceDefinition(input: unknown): SingleChoiceIssue[] {
  if (!isRecord(input)) return [{ path: '', message: 'La actividad debe ser un objeto.' }];
  const issues: SingleChoiceIssue[] = [];

  const allowed = ['type', 'id', 'prompt', 'options', 'hint', 'context', 'explanation'];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      issues.push({ path: key, message: 'Propiedad no permitida en Selección única.' });
    }
  }

  if (input.type !== SINGLE_CHOICE_TYPE) {
    issues.push({ path: 'type', message: 'El tipo debe ser "singleChoice".' });
  }
  if (typeof input.id !== 'string' || !input.id.trim()) {
    issues.push({ path: 'id', message: 'El identificador es obligatorio.' });
  }

  checkTextField(issues, input, 'prompt', true);
  checkTextField(issues, input, 'hint', true);
  checkTextField(issues, input, 'context', false);
  checkTextField(issues, input, 'explanation', false);

  if (!Array.isArray(input.options)) {
    issues.push({ path: 'options', message: 'Las opciones deben ser una lista.' });
    return issues;
  }

  if (input.options.length < SINGLE_CHOICE_LIMITS.minOptions || input.options.length > SINGLE_CHOICE_LIMITS.maxOptions) {
    issues.push({
      path: 'options',
      message: `La actividad debe tener entre ${SINGLE_CHOICE_LIMITS.minOptions} y ${SINGLE_CHOICE_LIMITS.maxOptions} opciones.`,
    });
  }

  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  let correctCount = 0;

  input.options.forEach((rawOption, index) => {
    const optionPath = `options[${index}]`;
    if (!isRecord(rawOption)) {
      issues.push({ path: optionPath, message: 'Cada opción debe ser un objeto.' });
      return;
    }

    const optionAllowed = ['id', 'label', 'correct'];
    for (const key of Object.keys(rawOption)) {
      if (!optionAllowed.includes(key)) {
        issues.push({ path: `${optionPath}.${key}`, message: 'Propiedad no permitida en una opción.' });
      }
    }

    const id = typeof rawOption.id === 'string' ? rawOption.id.trim() : '';
    if (!id) {
      issues.push({ path: `${optionPath}.id`, message: 'Cada opción necesita un identificador.' });
    } else if (seenIds.has(id)) {
      issues.push({ path: `${optionPath}.id`, message: 'El identificador de la opción está repetido.' });
    } else {
      seenIds.add(id);
    }

    const label = typeof rawOption.label === 'string' ? rawOption.label.trim() : '';
    if (!label) {
      issues.push({ path: `${optionPath}.label`, message: `Completa el texto de la opción ${index + 1}.` });
    } else {
      if (label.length > SINGLE_CHOICE_LIMITS.optionLabel) {
        issues.push({
          path: `${optionPath}.label`,
          message: `La opción ${index + 1} supera el máximo de ${SINGLE_CHOICE_LIMITS.optionLabel} caracteres.`,
        });
      }
      if (FORBIDDEN_PLACEHOLDERS.has(label.toLowerCase())) {
        issues.push({
          path: `${optionPath}.label`,
          message: `La opción ${index + 1} no puede usar marcadores como "N/A" o "pendiente".`,
        });
      }
      const normalizedLabel = normalizeForComparison(label);
      if (seenLabels.has(normalizedLabel)) {
        issues.push({ path: `${optionPath}.label`, message: `La opción "${label}" está duplicada.` });
      } else {
        seenLabels.add(normalizedLabel);
      }
    }

    if (typeof rawOption.correct !== 'boolean') {
      issues.push({ path: `${optionPath}.correct`, message: 'El indicador de opción correcta debe ser booleano.' });
    } else if (rawOption.correct) {
      correctCount += 1;
    }
  });

  if (correctCount === 0) {
    issues.push({ path: 'correct', message: 'Marca cuál de las opciones es la respuesta correcta.' });
  } else if (correctCount > 1) {
    issues.push({ path: 'correct', message: 'Solo puede haber una opción correcta en Selección única.' });
  }

  return issues;
}

export function isSingleChoiceDefinition(input: unknown): input is SingleChoicePrivate {
  return validateSingleChoiceDefinition(input).length === 0;
}

/** Proyección pública: elimina el indicador `correct` de cada opción, la explicación y la pista. */
export function toSingleChoicePublic(definition: SingleChoicePrivate): SingleChoicePublic {
  const result: SingleChoicePublic = {
    type: SINGLE_CHOICE_TYPE,
    id: definition.id,
    prompt: definition.prompt,
    options: definition.options.map((option) => ({ id: option.id, label: option.label })),
  };
  if (definition.context?.trim()) result.context = definition.context;
  return result;
}

export function createEmptySingleChoiceResponse(occurrenceId: string, activityId: string): SingleChoiceResponse {
  return { occurrenceId, activityId, activityType: SINGLE_CHOICE_TYPE, status: 'omitted', value: null };
}

/** Busca una opción de la actividad tanto por su `id` como por su `label`. */
export function findSingleChoiceOption(
  definition: Pick<SingleChoicePrivate, 'options'>,
  value: string | null | undefined,
): SingleChoiceOptionPrivate | undefined {
  if (!value || typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return (
    definition.options.find((option) => option.id === trimmed) ??
    definition.options.find((option) => option.label.trim() === trimmed)
  );
}

/** Comprueba la forma exacta de una respuesta recibida (cliente o servidor). */
export function validateSingleChoiceResponse(
  input: unknown,
  definition: Pick<SingleChoicePrivate, 'id' | 'options'>,
): string | null {
  if (!isRecord(input)) return 'La respuesta debe ser un objeto.';
  const allowed = ['occurrenceId', 'activityId', 'activityType', 'status', 'value'];
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return `Propiedad no permitida: ${extra}.`;
  if (input.activityType !== SINGLE_CHOICE_TYPE) return 'El tipo de respuesta no corresponde a Selección única.';
  if (input.activityId !== definition.id) return 'La respuesta pertenece a otra actividad.';
  if (typeof input.occurrenceId !== 'string' || !input.occurrenceId.trim()) return 'Falta la ocurrencia.';
  if (input.status !== 'confirmed' && input.status !== 'omitted' && input.status !== 'partial_timeout') {
    return 'Estado de respuesta desconocido.';
  }
  if (input.value !== null && typeof input.value !== 'string') {
    return 'El valor seleccionado debe ser texto o nulo.';
  }
  if (input.status === 'confirmed') {
    if (input.value === null || !input.value.trim()) {
      return 'Una respuesta confirmada debe indicar una opción.';
    }
    if (!findSingleChoiceOption(definition, input.value)) {
      return 'La opción seleccionada no pertenece a esta actividad.';
    }
  }
  if (input.status === 'omitted' && input.value !== null) {
    return 'Una omisión no puede incluir una opción seleccionada.';
  }
  if (input.status === 'partial_timeout' && input.value !== null && input.value.trim() !== '') {
    if (!findSingleChoiceOption(definition, input.value)) {
      return 'La opción registrada al agotar el tiempo no pertenece a esta actividad.';
    }
  }
  return null;
}

/**
 * Evalúa una respuesta contra la definición privada.
 * - confirmada: se compara con la opción marcada como `correct: true`.
 * - omitida: 0 puntos, `correct: null`.
 * - tiempo agotado: se conserva la opción marcada como evidencia, pero no se puntúa
 *   porque el estudiante no la confirmó.
 */
export function evaluateSingleChoice(
  definition: SingleChoicePrivate,
  response: unknown,
  maxScore: number,
): SingleChoiceResult {
  const safeMax = Number.isFinite(maxScore) && maxScore > 0 ? maxScore : 0;
  const explanation = definition.explanation?.trim() ? definition.explanation : null;
  const base = { maxScore: safeMax, explanation };

  const problem = validateSingleChoiceResponse(response, definition);
  if (problem) {
    return {
      ...base,
      outcome: 'rejected',
      correct: null,
      score: 0,
      recordedValue: null,
      recordedOptionId: null,
      studentFeedback: null,
      rejectionReason: problem,
    };
  }
  const valid = response as SingleChoiceResponse;

  if (valid.status === 'omitted') {
    return {
      ...base,
      outcome: 'omitted',
      correct: null,
      score: 0,
      recordedValue: null,
      recordedOptionId: null,
      studentFeedback: null,
    };
  }

  const matchedOption = findSingleChoiceOption(definition, valid.value);

  if (valid.status === 'partial_timeout') {
    return {
      ...base,
      outcome: 'timeout',
      correct: null,
      score: 0,
      recordedValue: matchedOption ? matchedOption.label : null,
      recordedOptionId: matchedOption ? matchedOption.id : null,
      studentFeedback: null,
    };
  }

  const correct = Boolean(matchedOption?.correct);
  return {
    ...base,
    outcome: correct ? 'correct' : 'incorrect',
    correct,
    score: correct ? safeMax : 0,
    recordedValue: matchedOption ? matchedOption.label : null,
    recordedOptionId: matchedOption ? matchedOption.id : null,
    studentFeedback: definition.hint,
  };
}

const OUTCOME_LABEL: Record<SingleChoiceOutcome, string> = {
  correct: 'Correcta',
  incorrect: 'Incorrecta',
  omitted: 'Omitida',
  timeout: 'Tiempo agotado sin confirmar',
  rejected: 'Respuesta rechazada',
};

/** Fila legible para docente y exportación (sin IDs técnicos). */
export function formatSingleChoiceReport(definition: SingleChoicePrivate, result: SingleChoiceResult) {
  const correctOption = definition.options.find((option) => option.correct);
  return {
    pregunta: definition.prompt,
    claveCorrecta: correctOption ? correctOption.label : 'Sin clave definida',
    respuestaEstudiante: result.recordedValue ?? 'Sin respuesta',
    resultado: OUTCOME_LABEL[result.outcome],
    puntaje: `${result.score}/${result.maxScore}`,
    pistaEntregada: result.studentFeedback ?? '',
    explicacion: result.explanation ?? '',
  };
}
