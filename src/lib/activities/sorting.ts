/**
 * Contrato modular de la actividad "Clasificación" (sorting) — EduEval v1.2.
 *
 * Propósito:
 * - Un archivo independiente por actividad para escalar sin mezclar reglas.
 * - La vista pública (`SortingPublic`) entrega las categorías (`categories`) y los elementos desordenados (`items`)
 *   sin exponer a qué categoría pertenece cada elemento.
 * - Tras confirmar una respuesta completa, el estudiante recibe únicamente `hint` (pista orientadora neutral),
 *   igual si acierta toda la clasificación o si falla algún elemento, sin revelar las categorías correctas.
 * - La explicación (`explanation`) y el desglose de aciertos quedan reservados para el docente y el CSV.
 */

export const SORTING_TYPE = 'sorting' as const;

export const SORTING_LIMITS = {
  context: 1500,
  prompt: 600,
  categoryName: 120,
  itemLabel: 240,
  hint: 400,
  explanation: 1000,
  minCategories: 2,
  maxCategories: 6,
  minItems: 2,
  maxItems: 12,
} as const;

export type SortingItemPrivate = {
  id: string;
  label: string;
  category: string;
};

export type SortingItemPublic = {
  id: string;
  label: string;
};

/** Definición completa que manejan el editor docente, el backend y los reportes privados. */
export type SortingPrivate = {
  type: typeof SORTING_TYPE;
  id: string;
  prompt: string;
  categories: string[];
  items: SortingItemPrivate[];
  /** Pista orientadora obligatoria que ve el estudiante tras confirmar. No debe revelar la clasificación correcta. */
  hint: string;
  /** Contexto o marco conceptual opcional que introduce el criterio de clasificación. */
  context?: string;
  /** Justificación privada opcional para el docente y la exportación CSV. */
  explanation?: string;
};

/** Vista pública enviada al estudiante: categorías y elementos desordenados sin su categoría correcta. */
export type SortingPublic = {
  type: typeof SORTING_TYPE;
  id: string;
  prompt: string;
  categories: string[];
  items: SortingItemPublic[];
  context?: string;
};

export type SortingResponseStatus = 'confirmed' | 'omitted' | 'partial_timeout';

/** Respuesta del estudiante para una ocurrencia específica dentro de la sala. */
export type SortingResponse = {
  occurrenceId: string;
  activityId: string;
  activityType: typeof SORTING_TYPE;
  status: SortingResponseStatus;
  /** Mapa de clasificación realizada por el estudiante: `{ [itemId]: categoryName }`. */
  assignments: Record<string, string>;
};

export type SortingOutcome = 'correct' | 'incorrect' | 'omitted' | 'timeout' | 'rejected';

export type SortingResult = {
  outcome: SortingOutcome;
  correct: boolean | null;
  score: number;
  maxScore: number;
  correctItemsCount: number;
  totalItems: number;
  recordedAssignments: Record<string, string>;
  /** Pista orientadora mostrada al estudiante solo cuando confirma todos los elementos. */
  studentFeedback: string | null;
  /** Explicación privada para el docente y el CSV. */
  explanation: string | null;
  rejectionReason?: string;
};

export type SortingIssue = {
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
  issues: SortingIssue[],
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
  const limit = SORTING_LIMITS[field];
  if (trimmed.length > limit) {
    issues.push({ path: field, message: `Supera el máximo de ${limit} caracteres.` });
  }
}

/** Valida que una definición de Clasificación esté lista para publicarse. */
export function validateSortingDefinition(input: unknown): SortingIssue[] {
  if (!isRecord(input)) return [{ path: '', message: 'La actividad debe ser un objeto.' }];
  const issues: SortingIssue[] = [];

  const allowed = ['type', 'id', 'prompt', 'categories', 'items', 'hint', 'context', 'explanation'];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      issues.push({ path: key, message: 'Propiedad no permitida en Clasificación.' });
    }
  }

  if (input.type !== SORTING_TYPE) {
    issues.push({ path: 'type', message: 'El tipo debe ser "sorting".' });
  }
  if (typeof input.id !== 'string' || !input.id.trim()) {
    issues.push({ path: 'id', message: 'El identificador es obligatorio.' });
  }

  checkTextField(issues, input, 'prompt', true);
  checkTextField(issues, input, 'hint', true);
  checkTextField(issues, input, 'context', false);
  checkTextField(issues, input, 'explanation', false);

  if (!Array.isArray(input.categories)) {
    issues.push({ path: 'categories', message: 'Las categorías deben ser una lista.' });
    return issues;
  }

  if (
    input.categories.length < SORTING_LIMITS.minCategories ||
    input.categories.length > SORTING_LIMITS.maxCategories
  ) {
    issues.push({
      path: 'categories',
      message: `La clasificación debe tener entre ${SORTING_LIMITS.minCategories} y ${SORTING_LIMITS.maxCategories} categorías.`,
    });
  }

  const validCategories = new Set<string>();
  const seenNormalizedCategories = new Set<string>();

  input.categories.forEach((rawCat, index) => {
    const catPath = `categories[${index}]`;
    const name = typeof rawCat === 'string' ? rawCat.trim() : '';
    if (!name) {
      issues.push({ path: catPath, message: `Completa el nombre de la categoría ${index + 1}.` });
      return;
    }
    if (name.length > SORTING_LIMITS.categoryName) {
      issues.push({
        path: catPath,
        message: `La categoría ${index + 1} supera el máximo de ${SORTING_LIMITS.categoryName} caracteres.`,
      });
    }
    if (FORBIDDEN_PLACEHOLDERS.has(name.toLowerCase())) {
      issues.push({
        path: catPath,
        message: `La categoría ${index + 1} no puede usar marcadores como "N/A" o "pendiente".`,
      });
    }
    const normalized = normalizeForComparison(name);
    if (seenNormalizedCategories.has(normalized)) {
      issues.push({ path: catPath, message: `La categoría "${name}" está duplicada.` });
    } else {
      seenNormalizedCategories.add(normalized);
      validCategories.add(name);
    }
  });

  if (!Array.isArray(input.items)) {
    issues.push({ path: 'items', message: 'Los elementos deben ser una lista.' });
    return issues;
  }

  if (input.items.length < SORTING_LIMITS.minItems || input.items.length > SORTING_LIMITS.maxItems) {
    issues.push({
      path: 'items',
      message: `La clasificación debe tener entre ${SORTING_LIMITS.minItems} y ${SORTING_LIMITS.maxItems} elementos.`,
    });
  }

  const seenItemIds = new Set<string>();
  const seenItemLabels = new Set<string>();
  const usedCategories = new Set<string>();

  input.items.forEach((rawItem, index) => {
    const itemPath = `items[${index}]`;
    if (!isRecord(rawItem)) {
      issues.push({ path: itemPath, message: 'Cada elemento debe ser un objeto.' });
      return;
    }

    const itemAllowed = ['id', 'label', 'category'];
    for (const key of Object.keys(rawItem)) {
      if (!itemAllowed.includes(key)) {
        issues.push({ path: `${itemPath}.${key}`, message: 'Propiedad no permitida en un elemento.' });
      }
    }

    const id = typeof rawItem.id === 'string' ? rawItem.id.trim() : '';
    if (!id) {
      issues.push({ path: `${itemPath}.id`, message: 'Cada elemento necesita un identificador.' });
    } else if (seenItemIds.has(id)) {
      issues.push({ path: `${itemPath}.id`, message: 'El identificador del elemento está repetido.' });
    } else {
      seenItemIds.add(id);
    }

    const label = typeof rawItem.label === 'string' ? rawItem.label.trim() : '';
    if (!label) {
      issues.push({ path: `${itemPath}.label`, message: `Completa el texto del elemento ${index + 1}.` });
    } else {
      if (label.length > SORTING_LIMITS.itemLabel) {
        issues.push({
          path: `${itemPath}.label`,
          message: `El elemento ${index + 1} supera el máximo de ${SORTING_LIMITS.itemLabel} caracteres.`,
        });
      }
      if (FORBIDDEN_PLACEHOLDERS.has(label.toLowerCase())) {
        issues.push({
          path: `${itemPath}.label`,
          message: `El elemento ${index + 1} no puede usar marcadores como "N/A" o "pendiente".`,
        });
      }
      const normalizedLabel = normalizeForComparison(label);
      if (seenItemLabels.has(normalizedLabel)) {
        issues.push({ path: `${itemPath}.label`, message: `El elemento "${label}" está duplicado.` });
      } else {
        seenItemLabels.add(normalizedLabel);
      }
    }

    const category = typeof rawItem.category === 'string' ? rawItem.category.trim() : '';
    if (!category) {
      issues.push({ path: `${itemPath}.category`, message: `Elige la categoría correcta para el elemento ${index + 1}.` });
    } else if (validCategories.size > 0 && !validCategories.has(category)) {
      issues.push({
        path: `${itemPath}.category`,
        message: `El elemento ${index + 1} apunta a una categoría que no existe ("${category}").`,
      });
    } else {
      usedCategories.add(category);
    }
  });

  if (validCategories.size >= 2 && input.items.length >= 2 && usedCategories.size < 2) {
    issues.push({
      path: 'items',
      message: 'Distribuye los elementos en al menos dos categorías distintas para que exista clasificación real.',
    });
  }

  return issues;
}

export function isSortingDefinition(input: unknown): input is SortingPrivate {
  return validateSortingDefinition(input).length === 0;
}

/**
 * Desordena de forma determinista la lista de elementos para que nunca aparezcan agrupados
 * trivialmente por categoría en la vista del estudiante.
 */
export function scrambleSortingItems<T>(items: T[]): T[] {
  if (items.length <= 1) return [...items];
  const result: T[] = [];
  for (let index = items.length - 1; index >= 0; index -= 1) {
    result.push(items[index]);
  }
  if (result.length >= 3) {
    const first = result[0];
    result[0] = result[1];
    result[1] = first;
  }
  return result;
}

/** Proyección pública: entrega categorías y elementos desordenados sin su categoría correcta ni clave/pista. */
export function toSortingPublic(definition: SortingPrivate): SortingPublic {
  const result: SortingPublic = {
    type: SORTING_TYPE,
    id: definition.id,
    prompt: definition.prompt,
    categories: definition.categories.map((cat) => cat.trim()),
    items: scrambleSortingItems(definition.items.map((item) => ({ id: item.id, label: item.label.trim() }))),
  };
  if (definition.context?.trim()) result.context = definition.context;
  return result;
}

export function createEmptySortingResponse(occurrenceId: string, activityId: string): SortingResponse {
  return { occurrenceId, activityId, activityType: SORTING_TYPE, status: 'omitted', assignments: {} };
}

/** Comprueba la forma exacta de una respuesta recibida (cliente o servidor). */
export function validateSortingResponse(
  input: unknown,
  definition: Pick<SortingPrivate, 'id' | 'categories' | 'items'>,
): string | null {
  if (!isRecord(input)) return 'La respuesta debe ser un objeto.';
  const allowed = ['occurrenceId', 'activityId', 'activityType', 'status', 'assignments'];
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return `Propiedad no permitida: ${extra}.`;
  if (input.activityType !== SORTING_TYPE) return 'El tipo de respuesta no corresponde a Clasificación.';
  if (input.activityId !== definition.id) return 'La respuesta pertenece a otra actividad.';
  if (typeof input.occurrenceId !== 'string' || !input.occurrenceId.trim()) return 'Falta la ocurrencia.';
  if (input.status !== 'confirmed' && input.status !== 'omitted' && input.status !== 'partial_timeout') {
    return 'Estado de respuesta desconocido.';
  }
  if (!isRecord(input.assignments)) return 'El mapa de clasificación debe ser un objeto.';

  const validItemIds = new Set(definition.items.map((item) => item.id));
  const validCategories = new Set(definition.categories.map((cat) => cat.trim()));

  for (const [itemId, rawCat] of Object.entries(input.assignments)) {
    if (!validItemIds.has(itemId)) {
      return `El elemento "${itemId}" no pertenece a esta actividad.`;
    }
    if (typeof rawCat !== 'string' || !rawCat.trim()) {
      return `La categoría asignada al elemento "${itemId}" no es válida.`;
    }
    if (!validCategories.has(rawCat.trim())) {
      return `La categoría "${rawCat}" no pertenece a esta actividad.`;
    }
  }

  if (input.status === 'confirmed') {
    const allAssigned = definition.items.every((item) => {
      const assigned = input.assignments && (input.assignments as Record<string, unknown>)[item.id];
      return typeof assigned === 'string' && assigned.trim().length > 0;
    });
    if (!allAssigned) {
      return 'Una respuesta confirmada debe clasificar todos los elementos.';
    }
  }

  if (input.status === 'omitted' && Object.keys(input.assignments).length > 0) {
    return 'Una respuesta omitida no debe incluir elementos clasificados.';
  }

  return null;
}

/**
 * Evalúa la respuesta del estudiante contra la definición privada.
 * - `confirmed`: compara cada elemento con su categoría correcta; otorga `maxScore` si todos coinciden (100 %) o 0 si falla alguno, y devuelve `hint`.
 * - `omitted`: 0 puntos, `correct: null`, sin pista.
 * - `partial_timeout`: conserva las asignaciones parciales como evidencia, 0 puntos, `correct: null`.
 * - Cualquier respuesta inválida se rechaza sin otorgar puntaje.
 */
export function evaluateSorting(
  definition: SortingPrivate,
  responseInput: unknown,
  scorePerQuestion: number,
): SortingResult {
  const maxScore = Math.max(0, Number.isFinite(scorePerQuestion) ? scorePerQuestion : 0);
  const explanation = definition.explanation?.trim() || null;
  const totalItems = definition.items.length;

  const rejection = validateSortingResponse(responseInput, definition);
  if (rejection) {
    return {
      outcome: 'rejected',
      correct: null,
      score: 0,
      maxScore,
      correctItemsCount: 0,
      totalItems,
      recordedAssignments: {},
      studentFeedback: null,
      explanation,
      rejectionReason: rejection,
    };
  }

  const response = responseInput as SortingResponse;
  const recordedAssignments: Record<string, string> = {};
  for (const [k, v] of Object.entries(response.assignments)) {
    recordedAssignments[k] = v.trim();
  }

  if (response.status === 'omitted') {
    return {
      outcome: 'omitted',
      correct: null,
      score: 0,
      maxScore,
      correctItemsCount: 0,
      totalItems,
      recordedAssignments: {},
      studentFeedback: null,
      explanation,
    };
  }

  let correctItemsCount = 0;
  for (const item of definition.items) {
    if (recordedAssignments[item.id] === item.category.trim()) {
      correctItemsCount += 1;
    }
  }

  if (response.status === 'partial_timeout') {
    return {
      outcome: 'timeout',
      correct: null,
      score: 0,
      maxScore,
      correctItemsCount,
      totalItems,
      recordedAssignments,
      studentFeedback: null,
      explanation,
    };
  }

  const correct = correctItemsCount === totalItems && totalItems > 0;
  return {
    outcome: correct ? 'correct' : 'incorrect',
    correct,
    score: correct ? maxScore : 0,
    maxScore,
    correctItemsCount,
    totalItems,
    recordedAssignments,
    studentFeedback: definition.hint.trim(),
    explanation,
  };
}

/** Resumen listo para la vista de resultados del docente y la exportación CSV. */
export function formatSortingReport(definition: SortingPrivate, result: SortingResult) {
  const itemById = new Map(definition.items.map((item) => [item.id, item.label.trim()]));
  const serializedAssignments = Object.entries(result.recordedAssignments)
    .map(([itemId, cat]) => `${itemById.get(itemId) ?? itemId} → ${cat}`)
    .join(' | ');
  const expectedAssignments = definition.items
    .map((item) => `${item.label.trim()} → ${item.category.trim()}`)
    .join(' | ');
  return {
    activityType: SORTING_TYPE,
    prompt: definition.prompt,
    expectedAnswer: expectedAssignments,
    studentAnswer:
      result.outcome === 'omitted'
        ? 'Omitida'
        : result.outcome === 'timeout'
          ? serializedAssignments
            ? `Sin confirmar por tiempo (${serializedAssignments})`
            : 'Tiempo agotado sin clasificar'
          : result.outcome === 'rejected'
            ? 'Respuesta inválida'
            : serializedAssignments,
    outcome: result.outcome,
    correct: result.correct,
    score: result.score,
    maxScore: result.maxScore,
    hintShownToStudent: result.studentFeedback ?? '',
    privateExplanation: result.explanation ?? '',
  };
}
