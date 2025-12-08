export interface ExperimentResult {
  id: string;
  experimentType: string;
  experimentName: string;
  timestamp: number;
  duration: number;
  completed: boolean;
  completionStatus: 'completed' | 'interrupted';
  annotations: AnnotationData[];
  rawData?: Record<string, unknown>;
}

export interface AnnotationData {
  timestamp: number;
  stimulusType: string;
  response?: 'spacebar' | 'escape';
  reactionTime?: number;
  stimulusValue?: string;
}

class VolatileExperimentDatabase {
  private static instance: VolatileExperimentDatabase;
  private experiments: Map<string, ExperimentResult> = new Map();

  private constructor() {}

  static getInstance(): VolatileExperimentDatabase {
    if (!VolatileExperimentDatabase.instance) {
      VolatileExperimentDatabase.instance = new VolatileExperimentDatabase();
    }
    return VolatileExperimentDatabase.instance;
  }

  saveExperiment(result: ExperimentResult): void {
    this.experiments.set(result.id, result);
  }

  getExperiment(id: string): ExperimentResult | undefined {
    return this.experiments.get(id);
  }

  getAllExperiments(): ExperimentResult[] {
    return Array.from(this.experiments.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  getExperimentsByType(experimentType: string): ExperimentResult[] {
    return Array.from(this.experiments.values())
      .filter(exp => exp.experimentType === experimentType)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  deleteExperiment(id: string): boolean {
    return this.experiments.delete(id);
  }

  clear(): void {
    this.experiments.clear();
  }

  exportToCSV(experimentId?: string): string {
    const experiments = experimentId 
      ? [this.getExperiment(experimentId)].filter(Boolean) as ExperimentResult[]
      : this.getAllExperiments();

    if (experiments.length === 0) {
      return 'No experiments to export\n';
    }

    const headers = [
      'Experiment_ID',
      'Experiment_Type', 
      'Experiment_Name',
      'Timestamp',
      'Date_Time',
      'Duration_ms',
      'Completed',
      'Completion_Status',
      'Annotation_Index',
      'Annotation_Timestamp',
      'Stimulus_Type',
      'Response',
      'Reaction_Time_ms',
      'Stimulus_Value',
      'Questionnaire_Score',
      'Questionnaire_Interpretation',
      'Valid_Responses',
      'Total_Questions'
    ];

    let csvContent = headers.join(',') + '\n';

    experiments.forEach(exp => {
      const baseRow = [
        exp.id,
        exp.experimentType,
        exp.experimentName,
        exp.timestamp.toString(),
        new Date(exp.timestamp).toISOString(),
        exp.duration.toString(),
        exp.completed.toString(),
        exp.completionStatus
      ];

      // Extract questionnaire-specific data if available
      const isQuestionnaire = exp.experimentType === 'Questionnaire';
      const questionnaireScore = isQuestionnaire && exp.rawData ? (exp.rawData.score || '') : '';
      const questionnaireInterpretation = isQuestionnaire && exp.rawData ? (exp.rawData.interpretation || '') : '';
      const validResponses = isQuestionnaire && exp.rawData ? (exp.rawData.validResponses || '') : '';
      const totalQuestions = isQuestionnaire && exp.rawData ? (exp.rawData.totalQuestions || '') : '';

      if (exp.annotations.length === 0) {
        csvContent += baseRow.join(',') + ',,,,,' + 
                     [questionnaireScore, questionnaireInterpretation, validResponses, totalQuestions].join(',') + '\n';
      } else {
        exp.annotations.forEach((annotation, index) => {
          const row = [
            ...baseRow,
            index.toString(),
            annotation.timestamp.toString(),
            annotation.stimulusType,
            annotation.response || '',
            annotation.reactionTime?.toString() || '',
            annotation.stimulusValue || '',
            // Only include questionnaire data on first row to avoid repetition
            index === 0 ? questionnaireScore : '',
            index === 0 ? questionnaireInterpretation : '',
            index === 0 ? validResponses : '',
            index === 0 ? totalQuestions : ''
          ];
          csvContent += row.join(',') + '\n';
        });
      }
    });

    return csvContent;
  }

  downloadCSV(experimentId?: string, filename?: string): void {
    const csvContent = this.exportToCSV(experimentId);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `experiments_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}

export const experimentDB = VolatileExperimentDatabase.getInstance();