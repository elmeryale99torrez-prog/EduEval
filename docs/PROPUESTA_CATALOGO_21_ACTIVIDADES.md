# Propuesta y Hoja de Ruta: Catálogo de 21 Actividades en EduEval

Este documento conserva la visión, arquitectura pedagógica y mapeo de referencia para el horizonte final de **21 actividades** de EvaluEdu/EduEval, fundamentado en el análisis de plataformas educativas abiertas (**H5P / Lumi**, Moodle y Canvas).

> [!NOTE]
> **Alcance de versión**: En la versión actual **v1.2** se trabaja y audita exclusivamente el **Núcleo de 6 actividades base**. Los 15 formatos futuros aquí descritos quedan documentados como propuesta técnica y pedagógica estructurada para su posterior desarrollo e incorporación progresiva a partir de la versión v1.3+, sin alterar el contrato operativo actual.

---

## 1. Arquitectura General del Catálogo (21 Actividades)

El catálogo completo se estructura en 5 bloques formativos para cubrir todas las dimensiones de la Taxonomía de Bloom (desde la recuperación conceptual hasta la síntesis crítica):

```text
Catálogo EduEval (21 Actividades)
├── Bloque 0: Núcleo v1.2 Implementado (6 actividades)
├── Bloque A: Comprensión Lectora y Análisis Textual (5 actividades)
├── Bloque B: Razonamiento, Matrices y Elección Avanzada (4 actividades)
├── Bloque C: Evaluación Visual y Procedimental (3 actividades)
└── Bloque D: Pensamiento Crítico y Autoevaluación (3 actividades)
```

---

## 2. Detalle y Mapeo con H5P / Lumi

| Nº | Actividad en EduEval | Estado | Equivalente / Inspiración Lumi | Enfoque Pedagógico y Adaptación EduEval |
| :-: | :--- | :---: | :--- | :--- |
| **1** | **Escenario de decisiones** (`scenario`) | **v1.2 Activo** | *Branching Scenario* | Dilemas secuenciales por etapas con consecuencias y feedback formativo. |
| **2** | **Falso / Verdadero** (`true_false`) | **v1.2 Activo** | *True/False Question* | Verificación de afirmaciones con justificación y pistas (*hints*). |
| **3** | **Selección Única** (`single_choice`) | **v1.2 Activo** | *Multiple Choice (Single)* | Una opción correcta con distractores plausibles del contenido. |
| **4** | **Asociación por Pares** (`matching`) | **v1.2 Activo** | *Drag and Drop (Pares)* | Selección táctil entre columnas (concepto ↔ definición, autor ↔ teoría). |
| **5** | **Clasificación por Categorías** (`sorting`) | **v1.2 Activo** | *Drag and Drop (Categorías)* | Cubos semánticos táctiles optimizados para pantalla móvil Android. |
| **6** | **Ordenamiento Secuencial** (`ordering`) | **v1.2 Activo** | *Sort Paragraphs / Sequencing* | Reordenamiento de pasos metodológicos o cronológicos. |
| **7** | **Completar Espacios en Blanco** | *Propuesta v1.3+* | *Fill in the Blanks* | Oraciones con términos clave ocultos extraídos de las definiciones. |
| **8** | **Marcar Palabras Clave** | *Propuesta v1.3+* | *Mark the Words* | Toque directo sobre palabras (sesgos, síntomas, factores) en un texto. |
| **9** | **Completar con Fichas Táctiles** | *Propuesta v1.3+* | *Drag the Words* | Variante móvil sin teclado: toques o arrastre de píldoras al texto. |
| **10** | **Reordenar Párrafos Argumentativos** | *Propuesta v1.3+* | *Sort the Paragraphs* | Reorganizar la coherencia de un caso, argumento o demostración. |
| **11** | **Respuesta Corta Conceptual** | *Propuesta v1.3+* | *Short Answer* | Entrada de 1 o 2 palabras clave con tolerancia ortográfica/sinónimos. |
| **12** | **Selección de Opción Múltiple** | *Propuesta v1.3+* | *Multiple Choice (Multiple)* | Casillas de verificación con puntaje ponderado y control de falsos positivos. |
| **13** | **Matriz o Tabla de Doble Entrada** | *Propuesta v1.3+* | *Matrix / Grid Question* | Evaluación de enunciados frente a una escala fija de criterios. |
| **14** | **Construcción Guiada de Resumen** | *Propuesta v1.3+* | *Summary* | Selección sucesiva de premisas nucleares descartando distractores. |
| **15** | **Identificación de Error en Cadena** | *Propuesta v1.3+* | *Find the Mistake* | Detección de la premisa o paso falso en un flujo argumental. |
| **16** | **Puntos Calientes en Diagramas** | *Propuesta v1.3+* | *Find the Hotspot* | Toque sobre zonas de un esquema técnico, mapa o lámina visual. |
| **17** | **Selección de Esquemas Visuales** | *Propuesta v1.3+* | *Image Choice* | Alternativas representadas por figuras, gráficos o fórmulas renderizadas. |
| **18** | **Secuenciación Visual de Fases** | *Propuesta v1.3+* | *Image Sequencing* | Ordenar cronológicamente diagramas o fases procedimentales. |
| **19** | **Pregunta de Desarrollo Formativa** | *Propuesta v1.3+* | *Essay* | Texto abierto analizado semánticamente por presencia de conceptos clave. |
| **20** | **Tarjetas de Recuperación Activa** | *Propuesta v1.3+* | *Flashcards / Dialog Cards* | Fase de calentamiento o repaso previo (*"Lo domino"* / *"Debo reforzar"*). |
| **21** | **Portafolio Reflexivo Estructurado** | *Propuesta v1.3+* | *Documentation Tool* | Respuestas secuenciales que componen el Comprobante de Evidencia final. |

---

## 3. Criterios de Calidad y Filtros de Admisión en EduEval

A diferencia de H5P (donde cada módulo funciona como un widget aislado con autoría manual), toda actividad que se desarrolle en EduEval debe satisfacer los siguientes principios de arquitectura:

1. **Derivación desde el Contrato Pedagógico (`edueval.content`)**: La actividad debe poder nutrirse automáticamente del tema del docente (conceptos, procesos, casos, situaciones, categorías) sin exigir tipeo redundante.
2. **Mobile-First Estricto**: 100% operable en teléfonos móviles Android táctiles sin problemas de coordenadas fijas, sin teclado virtual invasivo y con diseño ergonómico de una mano.
3. **Evaluación Formativa Protegida**:
   - Pistas formativas (*hints*) que orienten sin dar spoilers de la respuesta correcta.
   - Privacidad del resultado ante el estudiante (evitar ansiedad por calificaciones instantáneas o rankings públicos).
   - Generación del **Comprobante Oficial de Entrega** institucional.
4. **Respaldo de Contingencia en Papel (A4)**: Capacidad de exportarse en el *Examen en Blanco* imprimible en caso de fallas de conexión o luz en el aula (exceptuando actividades interactivas específicas como escenarios o audio).
5. **Seguridad y Motor Modular**: Cada actividad se encapsula en `src/lib/activities/<tipo>.ts`, con contrato discriminado, función de sanitización pública (`to*Public()`) y evaluador determinista (`evaluate*()`).
