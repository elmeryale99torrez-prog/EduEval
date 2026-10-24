/**
 * Contrato modular de la actividad "Escenario de decisiones" (scenario) — EduEval v1.2.
 *
 * Propósito:
 * - Un archivo independiente por actividad para escalar sin mezclar reglas.
 * - Inspirado en el modelo inmersivo de toma de decisiones de Ecoliderazgo, pero adaptado
 *   al rigor de evaluación formativa de EduEval para estudiantes de bachillerato en adelante.
 * - Sin requerir imágenes: estructura rica en texto donde un caso complejo (`situation`)
 *   se divide en etapas secuenciales (`stages`).
 * - Cada opción tiene un texto claro (`text`), una consecuencia pedagógica (`consequence`)
 *   y un feedback orientador (`feedback`).
 * - En la vista pública (`ScenarioPublic`), las opciones ocultan cuál es la recomendada
 *   y sus consecuencias hasta que el estudiante interactúa y confirma.
 * - Tras confirmar, el estudiante recibe `hint` y la consecuencia formativa de la opción que eligió,
 *   sin revelar directamente si era la recomendada o no, fomentando el pensamiento crítico.
 * - La explicación (`explanation`) y la clave recomendada quedan reservadas para el docente y el CSV.
 */

export const SCENARIO_TYPE = 'scenario' as const;

export const SCENARIO_LIMITS = {
  situation: 2000,
  prompt: 600,
  stageTitle: 120,
  stagePrompt: 600,
  optionText: 300,
  consequence: 400,
  feedback: 400,
  hint: 500,
  explanation: 1200,
  minStages: 1,
  maxStages: 3,
  minOptions: 2,
  maxOptions: 4,
} as const;

export type ScenarioOptionPrivate = {
  id: string;
  text: string;
  consequence: string;
  feedback: string;
  recommended: boolean;
};

export type ScenarioStagePrivate = {
  id: string;
  title: string;
  prompt: string;
  options: ScenarioOptionPrivate[];
};

export type ScenarioOptionPublic = {
  id: string;
  text: string;
};

export type ScenarioStagePublic = {
  id: string;
  title: string;
  prompt: string;
  options: ScenarioOptionPublic[];
};

/** Definición completa que manejan el editor docente, el backend y los reportes privados. */
export type ScenarioPrivate = {
  type: typeof SCENARIO_TYPE;
  id: string;
  prompt: string;
  /** Caso o dilema general de análisis contextualizado. */
  situation: string;
  /** Etapas secuenciales de toma de decisiones. */
  stages: ScenarioStagePrivate[];
  /** Pista orientadora obligatoria que invita a ponderar impactos. */
  hint: string;
  /** Justificación privada opcional para el docente y la exportación CSV. */
  explanation?: string;
};

/** Vista pública enviada al estudiante: caso y etapas sin revelar recomendadas ni consecuencias previas. */
export type ScenarioPublic = {
  type: typeof SCENARIO_TYPE;
  id: string;
  prompt: string;
  situation: string;
  stages: ScenarioStagePublic[];
};

export type ScenarioResponseStatus = 'confirmed' | 'omitted' | 'partial_timeout';

/** Respuesta del estudiante para una ocurrencia específica dentro de la sala. */
export type ScenarioResponse = {
  occurrenceId: string;
  activityId: string;
  activityType: typeof SCENARIO_TYPE;
  status: ScenarioResponseStatus;
  /** Mapa de elecciones del estudiante: `{ [stageId]: optionTextOrId }`. */
  choices: Record<string, string>;
};

export type ScenarioOutcome = 'correct' | 'incorrect' | 'omitted' | 'timeout' | 'rejected';

export type StageEvaluation = {
  stageId: string;
  stageTitle: string;
  chosenText: string;
  isRecommended: boolean;
  consequence: string;
  stageFeedback: string;
};

export type ScenarioResult = {
  outcome: ScenarioOutcome;
  correct: boolean | null;
  score: number;
  maxScore: number;
  recommendedCount: number;
  totalStages: number;
  stageEvaluations: StageEvaluation[];
  recordedChoices: Record<string, string>;
  /** Pista orientadora general mostrada al estudiante tras confirmar. */
  studentFeedback: string | null;
  /** Explicación privada para el docente y el CSV. */
  explanation: string | null;
  rejectionReason?: string;
};

export type ScenarioIssue = {
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
  issues: ScenarioIssue[],
  source: Record<string, unknown>,
  field: 'prompt' | 'situation' | 'hint' | 'explanation',
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
  const limit = SCENARIO_LIMITS[field];
  if (trimmed.length > limit) {
    issues.push({ path: field, message: `Supera el máximo de ${limit} caracteres.` });
  }
}

/** Valida que una definición de Escenario esté lista para publicarse. */
export function validateScenarioDefinition(input: unknown): ScenarioIssue[] {
  if (!isRecord(input)) return [{ path: '', message: 'La actividad debe ser un objeto.' }];
  const issues: ScenarioIssue[] = [];

  const allowed = ['type', 'id', 'prompt', 'situation', 'stages', 'hint', 'explanation'];
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      issues.push({ path: key, message: 'Propiedad no permitida en Escenario.' });
    }
  }

  if (input.type !== SCENARIO_TYPE) {
    issues.push({ path: 'type', message: 'El tipo debe ser "scenario".' });
  }
  if (typeof input.id !== 'string' || !input.id.trim()) {
    issues.push({ path: 'id', message: 'El identificador es obligatorio.' });
  }

  checkTextField(issues, input, 'prompt', true);
  checkTextField(issues, input, 'situation', true);
  checkTextField(issues, input, 'hint', true);
  checkTextField(issues, input, 'explanation', false);

  if (!Array.isArray(input.stages)) {
    issues.push({ path: 'stages', message: 'Las etapas deben ser una lista.' });
    return issues;
  }

  if (input.stages.length < SCENARIO_LIMITS.minStages || input.stages.length > SCENARIO_LIMITS.maxStages) {
    issues.push({
      path: 'stages',
      message: `El escenario debe tener entre ${SCENARIO_LIMITS.minStages} y ${SCENARIO_LIMITS.maxStages} etapas de decisión.`,
    });
  }

  const seenStageIds = new Set<string>();

  input.stages.forEach((rawStage, stageIndex) => {
    const stagePath = `stages[${stageIndex}]`;
    if (!isRecord(rawStage)) {
      issues.push({ path: stagePath, message: 'Cada etapa debe ser un objeto.' });
      return;
    }

    const stageAllowed = ['id', 'title', 'prompt', 'options'];
    for (const key of Object.keys(rawStage)) {
      if (!stageAllowed.includes(key)) {
        issues.push({ path: `${stagePath}.${key}`, message: 'Propiedad no permitida en una etapa.' });
      }
    }

    const stageId = typeof rawStage.id === 'string' ? rawStage.id.trim() : '';
    if (!stageId) {
      issues.push({ path: `${stagePath}.id`, message: 'Cada etapa necesita un identificador.' });
    } else if (seenStageIds.has(stageId)) {
      issues.push({ path: `${stagePath}.id`, message: 'El identificador de etapa está repetido.' });
    } else {
      seenStageIds.add(stageId);
    }

    const title = typeof rawStage.title === 'string' ? rawStage.title.trim() : '';
    if (!title) {
      issues.push({ path: `${stagePath}.title`, message: `Escribe el título de la etapa ${stageIndex + 1}.` });
    } else if (title.length > SCENARIO_LIMITS.stageTitle) {
      issues.push({ path: `${stagePath}.title`, message: `El título supera los ${SCENARIO_LIMITS.stageTitle} caracteres.` });
    }

    const prompt = typeof rawStage.prompt === 'string' ? rawStage.prompt.trim() : '';
    if (!prompt) {
      issues.push({ path: `${stagePath}.prompt`, message: `Escribe la consigna de decisión de la etapa ${stageIndex + 1}.` });
    } else if (prompt.length > SCENARIO_LIMITS.stagePrompt) {
      issues.push({ path: `${stagePath}.prompt`, message: `La consigna de etapa supera los ${SCENARIO_LIMITS.stagePrompt} caracteres.` });
    }

    if (!Array.isArray(rawStage.options)) {
      issues.push({ path: `${stagePath}.options`, message: 'Las opciones de la etapa deben ser una lista.' });
      return;
    }

    if (rawStage.options.length < SCENARIO_LIMITS.minOptions || rawStage.options.length > SCENARIO_LIMITS.maxOptions) {
      issues.push({
        path: `${stagePath}.options`,
        message: `La etapa ${stageIndex + 1} debe tener entre ${SCENARIO_LIMITS.minOptions} y ${SCENARIO_LIMITS.maxOptions} opciones.`,
      });
    }

    const seenOptionIds = new Set<string>();
    const seenOptionTexts = new Set<string>();
    let recommendedCount = 0;

    rawStage.options.forEach((rawOption, optionIndex) => {
      const optionPath = `${stagePath}.options[${optionIndex}]`;
      if (!isRecord(rawOption)) {
        issues.push({ path: optionPath, message: 'Cada opción debe ser un objeto.' });
        return;
      }

      const optAllowed = ['id', 'text', 'consequence', 'feedback', 'recommended'];
      for (const key of Object.keys(rawOption)) {
        if (!optAllowed.includes(key)) {
          issues.push({ path: `${optionPath}.${key}`, message: 'Propiedad no permitida en una opción.' });
        }
      }

      const optId = typeof rawOption.id === 'string' ? rawOption.id.trim() : '';
      if (!optId) {
        issues.push({ path: `${optionPath}.id`, message: 'Cada opción necesita un identificador.' });
      } else if (seenOptionIds.has(optId)) {
        issues.push({ path: `${optionPath}.id`, message: 'Identificador de opción duplicado.' });
      } else {
        seenOptionIds.add(optId);
      }

      const text = typeof rawOption.text === 'string' ? rawOption.text.trim() : '';
      if (!text) {
        issues.push({ path: `${optionPath}.text`, message: `Escribe el texto de la opción ${optionIndex + 1}.` });
      } else {
        if (text.length > SCENARIO_LIMITS.optionText) {
          issues.push({ path: `${optionPath}.text`, message: `El texto supera los ${SCENARIO_LIMITS.optionText} caracteres.` });
        }
        const normalized = normalizeForComparison(text);
        if (seenOptionTexts.has(normalized)) {
          issues.push({ path: `${optionPath}.text`, message: `La opción "${text}" está duplicada en esta etapa.` });
        } else {
          seenOptionTexts.add(normalized);
        }
      }

      const consequence = typeof rawOption.consequence === 'string' ? rawOption.consequence.trim() : '';
      if (!consequence) {
        issues.push({ path: `${optionPath}.consequence`, message: `Escribe la consecuencia de la opción ${optionIndex + 1}.` });
      } else if (consequence.length > SCENARIO_LIMITS.consequence) {
        issues.push({ path: `${optionPath}.consequence`, message: `La consecuencia supera los ${SCENARIO_LIMITS.consequence} caracteres.` });
      }

      const feedback = typeof rawOption.feedback === 'string' ? rawOption.feedback.trim() : '';
      if (!feedback) {
        issues.push({ path: `${optionPath}.feedback`, message: `Escribe el feedback de la opción ${optionIndex + 1}.` });
      } else if (feedback.length > SCENARIO_LIMITS.feedback) {
        issues.push({ path: `${optionPath}.feedback`, message: `El feedback supera los ${SCENARIO_LIMITS.feedback} caracteres.` });
      }

      if (rawOption.recommended === true) {
        recommendedCount += 1;
      }
    });

    if (recommendedCount !== 1) {
      issues.push({
        path: `${stagePath}.options`,
        message: `La etapa ${stageIndex + 1} debe tener exactamente una opción marcada como recomendada (encontradas: ${recommendedCount}).`,
      });
    }
  });

  return issues;
}

export function isScenarioDefinition(input: unknown): input is ScenarioPrivate {
  return validateScenarioDefinition(input).length === 0;
}

/** Proyección pública: entrega caso y etapas con opciones simples sin revelar consecuencias ni recomendaciones. */
export function toScenarioPublic(definition: ScenarioPrivate): ScenarioPublic {
  return {
    type: SCENARIO_TYPE,
    id: definition.id,
    prompt: definition.prompt,
    situation: definition.situation,
    stages: definition.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      prompt: stage.prompt,
      options: stage.options.map((option) => ({
        id: option.id,
        text: option.text.trim(),
      })),
    })),
  };
}

export function createEmptyScenarioResponse(occurrenceId: string, activityId: string): ScenarioResponse {
  return { occurrenceId, activityId, activityType: SCENARIO_TYPE, status: 'omitted', choices: {} };
}

/** Comprueba la forma exacta de una respuesta recibida (cliente o servidor). */
export function validateScenarioResponse(
  input: unknown,
  definition: Pick<ScenarioPrivate, 'id' | 'stages'>,
): string | null {
  if (!isRecord(input)) return 'La respuesta debe ser un objeto.';
  const allowed = ['occurrenceId', 'activityId', 'activityType', 'status', 'choices'];
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return `Propiedad no permitida: ${extra}.`;
  if (input.activityType !== SCENARIO_TYPE) return 'El tipo de respuesta no corresponde a Escenario.';
  if (input.activityId !== definition.id) return 'La respuesta pertenece a otra actividad.';
  if (typeof input.occurrenceId !== 'string' || !input.occurrenceId.trim()) return 'Falta la ocurrencia.';
  if (input.status !== 'confirmed' && input.status !== 'omitted' && input.status !== 'partial_timeout') {
    return 'Estado de respuesta desconocido.';
  }
  if (!isRecord(input.choices)) return 'Las elecciones deben ser un objeto.';

  const validStageIds = new Set(definition.stages.map((s) => s.id));

  for (const [stageId, choiceValue] of Object.entries(input.choices)) {
    if (!validStageIds.has(stageId)) {
      return `La etapa "${stageId}" no pertenece a este escenario.`;
    }
    const stage = definition.stages.find((s) => s.id === stageId);
    if (!stage) continue;
    const validChoices = new Set(stage.options.flatMap((o) => [o.id, o.text.trim()]));
    if (typeof choiceValue !== 'string' || !validChoices.has(choiceValue.trim())) {
      return `La opción seleccionada en "${stage.title}" no es válida.`;
    }
  }

  if (input.status === 'confirmed') {
    const allStagesChosen = definition.stages.every((stage) => {
      const choice = (input.choices as Record<string, unknown>)[stage.id];
      return typeof choice === 'string' && choice.trim().length > 0;
    });
    if (!allStagesChosen) {
      return 'Debes completar tu decisión en todas las etapas del escenario.';
    }
  }

  if (input.status === 'omitted' && Object.keys(input.choices).length > 0) {
    return 'Una respuesta omitida no debe incluir elecciones.';
  }

  return null;
}

/**
 * Evalúa la respuesta del estudiante contra la definición privada.
 * - `confirmed`: evalúa cada etapa; si todas las elecciones coinciden con la opción recomendada, otorga `maxScore` (o 0 si falla alguna).
 * - Genera el desglose de consecuencias formativas para cada etapa elegida por el estudiante.
 * - `omitted`: 0 puntos, `correct: null`, sin retroalimentación.
 * - `partial_timeout`: conserva las decisiones parciales como evidencia, 0 puntos, `correct: null`.
 */
export function evaluateScenario(
  definition: ScenarioPrivate,
  responseInput: unknown,
  scorePerQuestion: number,
): ScenarioResult {
  const maxScore = Math.max(0, Number.isFinite(scorePerQuestion) ? scorePerQuestion : 0);
  const explanation = definition.explanation?.trim() || null;
  const totalStages = definition.stages.length;

  const rejection = validateScenarioResponse(responseInput, definition);
  if (rejection) {
    return {
      outcome: 'rejected',
      correct: null,
      score: 0,
      maxScore,
      recommendedCount: 0,
      totalStages,
      stageEvaluations: [],
      recordedChoices: {},
      studentFeedback: null,
      explanation,
      rejectionReason: rejection,
    };
  }

  const response = responseInput as ScenarioResponse;
  const recordedChoices: Record<string, string> = {};
  for (const [k, v] of Object.entries(response.choices)) {
    recordedChoices[k] = v.trim();
  }

  if (response.status === 'omitted') {
    return {
      outcome: 'omitted',
      correct: null,
      score: 0,
      maxScore,
      recommendedCount: 0,
      totalStages,
      stageEvaluations: [],
      recordedChoices: {},
      studentFeedback: null,
      explanation,
    };
  }

  const stageEvaluations: StageEvaluation[] = [];
  let recommendedCount = 0;

  for (const stage of definition.stages) {
    const rawChoice = recordedChoices[stage.id];
    if (!rawChoice) continue;

    const matchedOption = stage.options.find(
      (opt) => opt.id === rawChoice || opt.text.trim() === rawChoice,
    );

    if (matchedOption) {
      if (matchedOption.recommended) recommendedCount += 1;
      stageEvaluations.push({
        stageId: stage.id,
        stageTitle: stage.title,
        chosenText: matchedOption.text.trim(),
        isRecommended: matchedOption.recommended,
        consequence: matchedOption.consequence.trim(),
        stageFeedback: matchedOption.feedback.trim(),
      });
    }
  }

  if (response.status === 'partial_timeout') {
    return {
      outcome: 'timeout',
      correct: null,
      score: 0,
      maxScore,
      recommendedCount,
      totalStages,
      stageEvaluations,
      recordedChoices,
      studentFeedback: null,
      explanation,
    };
  }

  const correct = recommendedCount === totalStages && totalStages > 0;
  return {
    outcome: correct ? 'correct' : 'incorrect',
    correct,
    score: correct ? maxScore : 0,
    maxScore,
    recommendedCount,
    totalStages,
    stageEvaluations,
    recordedChoices,
    studentFeedback: definition.hint.trim(),
    explanation,
  };
}

/** Resumen listo para la vista de resultados del docente y la exportación CSV. */
export function formatScenarioReport(definition: ScenarioPrivate, result: ScenarioResult) {
  const serializedChoices = result.stageEvaluations
    .map((evalItem) => `${evalItem.stageTitle}: ${evalItem.chosenText}`)
    .join(' | ');
  const expectedRecommendations = definition.stages
    .map((stage) => {
      const rec = stage.options.find((o) => o.recommended);
      return `${stage.title}: ${rec?.text.trim() ?? 'No definida'}`;
    })
    .join(' | ');

  return {
    activityType: SCENARIO_TYPE,
    prompt: definition.prompt,
    expectedAnswer: expectedRecommendations,
    studentAnswer:
      result.outcome === 'omitted'
        ? 'Omitida'
        : result.outcome === 'timeout'
          ? serializedChoices
            ? `Sin confirmar por tiempo (${serializedChoices})`
            : 'Tiempo agotado sin decidir'
          : result.outcome === 'rejected'
            ? 'Respuesta inválida'
            : serializedChoices,
    outcome: result.outcome,
    correct: result.correct,
    score: result.score,
    maxScore: result.maxScore,
    hintShownToStudent: result.studentFeedback ?? '',
    privateExplanation: result.explanation ?? '',
  };
}
