'use client';

import React, { useState, useEffect, useCallback } from 'react';

/**
 * QUESTIONNAIRE SYSTEM - COGNITIVE SCREENING TOOLS
 * ================================================
 * 
 * This component provides a comprehensive questionnaire administration system
 * supporting validated cognitive screening instruments.
 * 
 * Features:
 * - JSON-based questionnaire loading
 * - Dynamic question rendering with different response scales
 * - Automated scoring and interpretation
 * - Results storage and export
 * - Professional presentation
 */

interface QuestionnaireConfig {
  id: string;
  type?: string;
}

interface QuestionOption {
  value: number | null;
  label: string;
}

interface Question {
  id: string;
  text: string;
}

interface ScoringRule {
  method: 'sum' | 'mean';
  range: [number, number];
  rules?: string;
  interpretation: Array<{
    min: number;
    max: number;
    label: string;
  }>;
}

interface QuestionnaireData {
  questionnaire: {
    id: string;
    name: string;
    description: string;
    num_items: number;
    respondent: string;
    instructions: string;
    scale: {
      type: 'dichotomous' | 'likert';
      options: QuestionOption[];
    };
    questions: Question[];
    scoring: ScoringRule;
  };
}

interface QuestionnaireResponse {
  questionId: string;
  value: number | null;
  timestamp: number;
}

interface QuestionnaireResult {
  questionnaireId: string;
  name: string;
  startTime: number;
  endTime: number;
  responses: QuestionnaireResponse[];
  score: number;
  interpretation: string;
  completionStatus: 'completed' | 'incomplete';
}

interface QuestionnaireSystemProps {
  onComplete: (result: QuestionnaireResult) => void;
  onCancel: () => void;
  config: QuestionnaireConfig;
}

type QuestionnairePhase = 'consent' | 'questionnaire' | 'complete';

const QuestionnaireSystem: React.FC<QuestionnaireSystemProps> = ({ 
  onComplete, 
  onCancel, 
  config 
}) => {
  const [phase, setPhase] = useState<QuestionnairePhase>('consent');
  const [questionnaireData, setQuestionnaireData] = useState<QuestionnaireData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [responses, setResponses] = useState<QuestionnaireResponse[]>([]);
  const [startTime, setStartTime] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [completedResult, setCompletedResult] = useState<QuestionnaireResult | null>(null);

  // Load questionnaire data from JSON
  const loadQuestionnaireData = useCallback(async (questionnaireId: string) => {
    setLoading(true);
    setError('');
    
    try {
      console.log('Loading questionnaire:', questionnaireId);
      const response = await fetch(`/questionnaires/${questionnaireId}.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to load questionnaire: ${response.statusText}`);
      }
      
      const data: QuestionnaireData = await response.json();
      console.log('Loaded questionnaire data:', data);
      setQuestionnaireData(data);
    } catch (error) {
      console.error('Error loading questionnaire:', error);
      setError(`Failed to load questionnaire: ${error}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load questionnaire on component mount
  useEffect(() => {
    if (config.id) {
      loadQuestionnaireData(config.id);
    }
  }, [config.id, loadQuestionnaireData]);

  // Start questionnaire
  const startQuestionnaire = useCallback(() => {
    if (!questionnaireData) return;
    
    console.log('Starting questionnaire:', questionnaireData.questionnaire.name);
    setStartTime(Date.now());
    setPhase('questionnaire');
    setCurrentQuestionIndex(0);
    setResponses([]);
  }, [questionnaireData]);

  // Handle response to current question
  const handleResponse = useCallback((value: number | null) => {
    if (!questionnaireData) return;
    
    const currentQuestion = questionnaireData.questionnaire.questions[currentQuestionIndex];
    const response: QuestionnaireResponse = {
      questionId: currentQuestion.id,
      value: value,
      timestamp: Date.now()
    };

    console.log('Response recorded:', response);
    
    setResponses(prev => {
      // Remove any previous response to this question
      const filteredResponses = prev.filter(r => r.questionId !== currentQuestion.id);
      return [...filteredResponses, response];
    });

    // Move to next question after a brief delay
    setTimeout(() => {
      if (currentQuestionIndex < questionnaireData.questionnaire.questions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // All questions completed
        completeQuestionnaire([...responses.filter(r => r.questionId !== currentQuestion.id), response]);
      }
    }, 300);
  }, [questionnaireData, currentQuestionIndex, responses]);

  // Calculate score and complete questionnaire
  const completeQuestionnaire = useCallback((finalResponses: QuestionnaireResponse[]) => {
    if (!questionnaireData) return;

    console.log('Completing questionnaire with responses:', finalResponses);

    const scoring = questionnaireData.questionnaire.scoring;
    
    // Filter out null responses (N/A answers)
    const validResponses = finalResponses.filter(r => r.value !== null);
    const scores = validResponses.map(r => r.value as number);

    let finalScore: number;
    
    if (scoring.method === 'sum') {
      finalScore = scores.reduce((sum, score) => sum + score, 0);
    } else if (scoring.method === 'mean') {
      finalScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    } else {
      finalScore = 0;
    }

    // Find interpretation based on score
    const interpretation = scoring.interpretation.find(interp => 
      finalScore >= interp.min && finalScore <= interp.max
    ) || { label: 'Unable to determine' };

    const result: QuestionnaireResult = {
      questionnaireId: questionnaireData.questionnaire.id,
      name: questionnaireData.questionnaire.name,
      startTime: startTime,
      endTime: Date.now(),
      responses: finalResponses,
      score: finalScore,
      interpretation: interpretation.label,
      completionStatus: finalResponses.length === questionnaireData.questionnaire.num_items ? 'completed' : 'incomplete'
    };

    console.log('Questionnaire result:', result);
    setCompletedResult(result);
    setPhase('complete');
    
    // Do not auto-return - wait for user button press

  }, [questionnaireData, startTime, onComplete]);

  // Cancel questionnaire
  const handleCancel = useCallback(() => {
    console.log('Questionnaire cancelled');
    onCancel();
  }, [onCancel]);

  // Handle return to main screen with results
  const handleReturnToMain = useCallback(() => {
    if (completedResult) {
      console.log('Returning to main screen with results:', completedResult);
      onComplete(completedResult);
    } else {
      console.log('No results available, cancelling');
      onCancel();
    }
  }, [completedResult, onComplete, onCancel]);

  // Render consent screen
  const renderConsentScreen = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-lg text-gray-600">Loading questionnaire...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
          <div className="text-red-600 text-xl">⚠️ Error</div>
          <p className="text-gray-700">{error}</p>
          <button
            onClick={handleCancel}
            className="bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-400 transition-colors"
          >
            Return to Menu
          </button>
        </div>
      );
    }

    if (!questionnaireData) return null;

    const { questionnaire } = questionnaireData;

    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-8">
        <h1 className="text-4xl font-bold text-[var(--navy)] mb-4">{questionnaire.name}</h1>
        
        <div className="max-w-3xl space-y-6">
          <div className="bg-green-50 p-6 rounded-lg border border-green-200">
            <h2 className="text-2xl font-semibold text-[var(--navy)] mb-4">Questionnaire Information</h2>
            <div className="text-left space-y-4 text-gray-700">
              <p><strong>Description:</strong> {questionnaire.description}</p>
              <p><strong>Number of items:</strong> {questionnaire.num_items} questions</p>
              <p><strong>Respondent:</strong> {questionnaire.respondent}</p>
              <p><strong>Instructions:</strong> {questionnaire.instructions}</p>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="text-blue-800 font-medium">
              📝 This questionnaire is designed for research purposes and screening.
              Results should be interpreted by qualified healthcare professionals.
            </p>
          </div>

          <div className="space-y-4">
            <p className="text-xl font-semibold text-[var(--navy)]">
              Ready to begin?
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={startQuestionnaire}
                className="bg-green-500 text-white px-8 py-4 rounded-lg font-medium hover:bg-green-600 transition-colors text-lg"
              >
                Start Questionnaire
              </button>
              <button
                onClick={handleCancel}
                className="bg-gray-300 text-gray-700 px-8 py-4 rounded-lg font-medium hover:bg-gray-400 transition-colors text-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render questionnaire screen
  const renderQuestionnaireScreen = () => {
    if (!questionnaireData) return null;

    const { questionnaire } = questionnaireData;
    const currentQuestion = questionnaire.questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questionnaire.num_items) * 100;

    return (
      <div className="flex flex-col items-center justify-center h-full bg-gray-50 p-8">
        {/* Progress bar */}
        <div className="w-full max-w-2xl mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-600">Progress</span>
            <span className="text-sm font-medium text-gray-600">
              {currentQuestionIndex + 1} of {questionnaire.num_items}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>

        {/* Question */}
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-3xl w-full text-center">
          <h2 className="text-2xl font-bold text-[var(--navy)] mb-6">
            Question {currentQuestionIndex + 1}
          </h2>
          
          <p className="text-xl text-gray-700 mb-8 leading-relaxed">
            {currentQuestion.text}
          </p>

          {/* Response options */}
          <div className="space-y-3">
            {questionnaire.scale.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleResponse(option.value)}
                className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg text-gray-700 group-hover:text-green-700">
                    {option.label}
                  </span>
                  <span className="text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    →
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Instructions reminder */}
          <p className="text-sm text-gray-500 mt-6 italic">
            {questionnaire.instructions}
          </p>
        </div>

        {/* Cancel option */}
        <button
          onClick={handleCancel}
          className="mt-6 text-gray-500 hover:text-gray-700 text-sm underline"
        >
          Cancel questionnaire
        </button>
      </div>
    );
  };

  // Render completion screen
  const renderCompletionScreen = () => {
    if (!completedResult || !questionnaireData) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-4xl font-bold text-[var(--navy)]">Processing Results...</h1>
        </div>
      );
    }

    const { questionnaire } = questionnaireData;
    const duration = Math.round((completedResult.endTime - completedResult.startTime) / 1000);
    const validResponseCount = completedResult.responses.filter(r => r.value !== null).length;

    // Get score range for display
    const scoreRange = questionnaire.scoring.method === 'sum' 
      ? `${questionnaire.scoring.range[0]} - ${questionnaire.scoring.range[1]}`
      : `${questionnaire.scoring.range[0]}.0 - ${questionnaire.scoring.range[1]}.0`;

    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-8 p-8 bg-gray-50">
        <div className="text-6xl mb-4">
          {completedResult.completionStatus === 'completed' ? '✅' : '⚠️'}
        </div>
        
        <h1 className="text-4xl font-bold text-[var(--navy)]">
          {questionnaire.name} - Results
        </h1>

        {/* Main Results Panel */}
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-4xl w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Score Results */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-[var(--navy)] border-b pb-2">Your Results</h2>
              
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <div className="text-center">
                  <div className="text-4xl font-bold text-blue-600 mb-2">
                    {questionnaire.scoring.method === 'sum' 
                      ? Math.round(completedResult.score)
                      : completedResult.score.toFixed(2)
                    }
                  </div>
                  <div className="text-lg text-blue-800 mb-1">
                    {questionnaire.scoring.method === 'sum' ? 'Total Score' : 'Average Score'}
                  </div>
                  <div className="text-sm text-blue-600">
                    (Range: {scoreRange})
                  </div>
                </div>
              </div>

              <div className="bg-green-50 p-6 rounded-lg border border-green-200">
                <h3 className="text-lg font-semibold text-green-800 mb-3">Interpretation</h3>
                <p className="text-green-700 text-lg font-medium">
                  {completedResult.interpretation}
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h3 className="text-md font-semibold text-gray-700 mb-2">Important Note</h3>
                <p className="text-sm text-gray-600">
                  This is a screening tool for research purposes. Results should be interpreted by qualified healthcare professionals. 
                  This assessment does not provide a medical diagnosis.
                </p>
              </div>
            </div>

            {/* Session Details */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-[var(--navy)] border-b pb-2">Session Summary</h2>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Questionnaire:</span>
                  <span className="text-gray-900">{questionnaire.id}</span>
                </div>
                
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Completion Status:</span>
                  <span className={`font-semibold ${
                    completedResult.completionStatus === 'completed' 
                      ? 'text-green-600' 
                      : 'text-yellow-600'
                  }`}>
                    {completedResult.completionStatus === 'completed' ? '✓ Completed' : '⚠ Partial'}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Questions Answered:</span>
                  <span className="text-gray-900">
                    {validResponseCount} of {questionnaire.num_items}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Time Taken:</span>
                  <span className="text-gray-900">{duration} seconds</span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Completed At:</span>
                  <span className="text-gray-900">
                    {new Date(completedResult.endTime).toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <span className="font-medium text-gray-700">Scoring Method:</span>
                  <span className="text-gray-900 capitalize">
                    {questionnaire.scoring.method}
                    {questionnaire.scoring.method === 'sum' ? ' of responses' : ' of responses'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Return Button */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-gray-600 mb-4">
              Your results have been saved and can be downloaded from the Results tab.
            </p>
            
            <button
              onClick={handleReturnToMain}
              className="bg-[var(--navy)] text-white px-8 py-4 rounded-lg font-medium hover:bg-blue-800 transition-colors text-lg shadow-lg"
            >
              Return to Main Menu
            </button>
          </div>
        </div>

        {/* Additional Information */}
        <div className="max-w-2xl text-center">
          <p className="text-sm text-gray-500">
            Thank you for participating in this assessment. Your responses contribute to important research 
            in cognitive health and help advance our understanding of brain function.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-white overflow-hidden">
      {phase === 'consent' && renderConsentScreen()}
      {phase === 'questionnaire' && renderQuestionnaireScreen()}
      {phase === 'complete' && renderCompletionScreen()}
    </div>
  );
};

export default QuestionnaireSystem;