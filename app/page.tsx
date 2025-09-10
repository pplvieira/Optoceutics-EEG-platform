'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import ComprehensiveEDFDashboard from './components/ComprehensiveEDFDashboard';
import PyodideEDFProcessor from './components/PyodideEDFProcessor';
import VercelEDFUpload from './components/VercelEDFUpload';
import VercelEDFAnalysis from './components/VercelEDFAnalysis';
import P300Experiment from './components/P300Experiment';
import { EDFFile } from './types/edf';
import { experimentDB, ExperimentResult } from './utils/experimentDatabase';

type DesktopMode = 'developer' | 'experiment' | 'local' | 'browser';

const DeveloperTabs = [
  'Data Collection',
  'Signal Processing', 
  'Analysis Tools',
  'Local Backend',
  'Visualization',
  'Export/API',
  'System Config'
];

const ExperimentTabs = [
  'Welcome',
  'Calibration',
  'Task 1: Memory',
  'Task 2: Attention', 
  'Task 3: Response',
  'Results'
];

export default function Home() {
  const [currentMode, setCurrentMode] = useState<DesktopMode>('developer');
  const [activeTab, setActiveTab] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<EDFFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EDFFile | null>(null);
  const [runningExperiment, setRunningExperiment] = useState<any | null>(null);
  const [experimentResults, setExperimentResults] = useState<any[]>([]);

  const currentTabs = currentMode === 'developer' ? DeveloperTabs : ExperimentTabs;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${
      currentMode === 'developer' 
        ? 'bg-[var(--dark-bg)]' 
        : 'bg-gradient-to-br from-slate-50 to-blue-50'
    }`}>
      {/* Header */}
      <header className="bg-[var(--navy)] text-white shadow-lg">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Image
                src="/assets/optoceutics_logo.jpeg"
                alt="Optoceutics Logo"
                width={48}
                height={48}
                className="rounded-lg"
              />
              <div>
                <h1 className="text-2xl font-bold">EEG Research Platform</h1>
                <p className="text-blue-200 text-sm">Advanced Neural Data Analysis</p>
              </div>
            </div>
            
            {/* Mode Toggle */}
            <div className="bg-blue-800 rounded-lg p-1 flex">
              <button
                onClick={() => {
                  setCurrentMode('browser');
                  setActiveTab(0);
                }}
                className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                  currentMode === 'browser'
                    ? 'bg-[var(--gold)] text-[var(--navy)] shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                Browser Python
              </button>
              <button
                onClick={() => {
                  setCurrentMode('local');
                  setActiveTab(0);
                }}
                className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                  currentMode === 'local'
                    ? 'bg-[var(--gold)] text-[var(--navy)] shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                Local Backend
              </button>
              <button
                onClick={() => {
                  setCurrentMode('developer');
                  setActiveTab(0);
                }}
                className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                  currentMode === 'developer'
                    ? 'bg-[var(--gold)] text-[var(--navy)] shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                Developer
              </button>
              <button
                onClick={() => {
                  setCurrentMode('experiment');
                  setActiveTab(0);
                }}
                className={`px-3 py-2 rounded-md font-medium transition-all text-sm ${
                  currentMode === 'experiment'
                    ? 'bg-[var(--gold)] text-[var(--navy)] shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                Experiment
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Mode Description */}
        <div className="mb-8 text-center">
          <h2 className={`text-3xl font-bold mb-4 ${
            currentMode === 'developer' || currentMode === 'local' || currentMode === 'browser'
              ? 'text-[var(--dark-text)]' 
              : 'text-[var(--navy)]'
          }`}>
            {currentMode === 'browser' ? 'Browser-Based Python Processing' :
             currentMode === 'developer' ? 'Technical Dashboard' : 
             currentMode === 'local' ? 'Local Backend Processing' : 'Participant Interface'}
          </h2>
          <p className={`max-w-3xl mx-auto ${
            currentMode === 'developer' || currentMode === 'local' || currentMode === 'browser'
              ? 'text-[var(--dark-text-secondary)]' 
              : 'text-gray-600'
          }`}>
            {currentMode === 'browser'
              ? 'Full Python-powered EEG analysis running entirely in your browser using WebAssembly. No server required, no file uploads, no size limits. Complete privacy with pyedflib, NumPy, SciPy, and scikit-learn.'
              : currentMode === 'developer' 
              ? 'Comprehensive tools for EEG data collection, analysis, and visualization. Configure experiments, process signals, and generate insights.'
              : currentMode === 'local' 
              ? 'Advanced EEG processing with local Python backend. Full scientific computing stack with SSVEP analysis, PCA, and large file support.'
              : 'Welcome to your experiment session. Follow the guided tasks and interact with the activities designed to capture neural responses.'
            }
          </p>
        </div>

        {/* Desktop Interface */}
        {/* Browser Python Mode */}
        {currentMode === 'browser' && (
          <PyodideEDFProcessor />
        )}
        
        {/* Local Backend Mode */}
        {currentMode === 'local' && (
          <ComprehensiveEDFDashboard />
        )}
        
        {/* Other Modes */}
        {currentMode !== 'local' && currentMode !== 'browser' && (
        <div className={`rounded-2xl shadow-xl border overflow-hidden transition-colors duration-300 ${
          currentMode === 'developer' 
            ? 'bg-[var(--dark-card)] border-[var(--dark-border)]' 
            : 'bg-white border-gray-200'
        }`}>
          {/* Tab Navigation */}
          <div className={`border-b transition-colors duration-300 ${
            currentMode === 'developer' 
              ? 'border-[var(--dark-border)] bg-[var(--dark-bg-secondary)]' 
              : 'border-gray-200 bg-gray-50'
          }`}>
            <nav className="flex overflow-x-auto">
              {currentTabs.map((tab, index) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(index)}
                  className={`flex-shrink-0 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === index
                      ? `border-[var(--gold)] ${
                          currentMode === 'developer' 
                            ? 'text-[var(--gold)] bg-[var(--dark-card)]' 
                            : 'text-[var(--navy)] bg-white'
                        }`
                      : `border-transparent ${
                          currentMode === 'developer' 
                            ? 'text-[var(--dark-text-secondary)] hover:text-[var(--dark-text)] hover:border-[var(--dark-border)]' 
                            : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {currentMode === 'developer' ? (
              <DeveloperTabContent 
                tabIndex={activeTab} 
                tabName={currentTabs[activeTab]} 
                isDarkMode={true}
                uploadedFiles={uploadedFiles}
                selectedFile={selectedFile}
                onFileUploaded={(file) => {
                  setUploadedFiles(prev => [...prev, file]);
                  if (!selectedFile) setSelectedFile(file);
                }}
                onFileSelected={setSelectedFile}
              />
            ) : (
              <ExperimentTabContent 
                tabIndex={activeTab} 
                tabName={currentTabs[activeTab]}
                onStartExperiment={setRunningExperiment}
                experimentResults={experimentResults}
              />
            )}
          </div>
        </div>
        )}

        {/* Features Overview */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentMode === 'developer' ? (
            <>
              <FeatureCard
                icon="📊"
                title="Real-time Processing"
                description="Live EEG signal processing with configurable filters and analysis pipelines."
                isDarkMode={true}
              />
              <FeatureCard
                icon="🧠"
                title="Advanced Analytics"
                description="Machine learning algorithms for pattern recognition and neural state classification."
                isDarkMode={true}
              />
              <FeatureCard
                icon="📈"
                title="Data Visualization"
                description="Interactive charts, spectrograms, and topographical brain maps."
                isDarkMode={true}
              />
            </>
          ) : (
            <>
              <FeatureCard
                icon="🎯"
                title="Guided Tasks"
                description="Structured experiments designed to capture specific neural responses."
              />
              <FeatureCard
                icon="🎮"
                title="Interactive Games"
                description="Engaging activities that make participation enjoyable and effective."
              />
              <FeatureCard
                icon="📱"
                title="User-Friendly"
                description="Intuitive interface designed for participants of all technical levels."
              />
            </>
          )}
        </div>

        {/* Running Experiment Overlay */}
        {runningExperiment && (
          <P300Experiment
            config={runningExperiment}
            onComplete={(data) => {
              setExperimentResults(prev => [...prev, data]);
              setRunningExperiment(null);
              console.log('Experiment completed:', data);
            }}
            onCancel={() => {
              setRunningExperiment(null);
              console.log('Experiment cancelled');
            }}
          />
        )}
      </main>
    </div>
  );
}

function DeveloperTabContent({ 
  tabIndex, 
  isDarkMode = false, 
  uploadedFiles = [], 
  selectedFile = null, 
  onFileUploaded, 
  onFileSelected 
}: { 
  tabIndex: number; 
  tabName: string; 
  isDarkMode?: boolean;
  uploadedFiles?: EDFFile[];
  selectedFile?: EDFFile | null;
  onFileUploaded?: (file: EDFFile) => void;
  onFileSelected?: (file: EDFFile) => void;
}) {
  const content = [
    {
      title: "Data Collection Hub",
      description: "Configure EEG devices, set sampling rates, and manage recording sessions.",
      features: ["Device Configuration", "Session Management", "Quality Monitoring", "Data Export"]
    },
    {
      title: "Signal Processing Pipeline",
      description: "Apply filters, artifact removal, and preprocessing to raw EEG signals.",
      features: ["Bandpass Filters", "ICA Components", "Artifact Rejection", "Baseline Correction"]
    },
    {
      title: "Analysis Toolkit",
      description: "Advanced analytics including frequency analysis, connectivity measures, and ML models.",
      features: ["Power Spectral Density", "Coherence Analysis", "Classification Models", "Statistical Tests"]
    },
    {
      title: "Visualization Center",
      description: "Interactive plots, brain maps, and real-time monitoring displays.",
      features: ["Time Series Plots", "Topographical Maps", "3D Brain Visualization", "Real-time Dashboard"]
    },
    {
      title: "Data Export & API",
      description: "Export processed data and integrate with external analysis tools.",
      features: ["Multiple Formats", "REST API", "Batch Processing", "Cloud Sync"]
    },
    {
      title: "System Configuration",
      description: "Platform settings, user management, and experiment protocols.",
      features: ["User Permissions", "Experiment Templates", "Hardware Settings", "Backup & Recovery"]
    }
  ];

  const current = content[tabIndex];

  // Handle Analysis Tools tab (index 2)
  if (tabIndex === 2) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className={`text-2xl font-bold mb-2 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-[var(--navy)]'
          }`}>Analysis Toolkit</h3>
          <p className={`text-lg ${
            isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
          }`}>Upload and analyze EEG files with advanced processing capabilities</p>
        </div>

        <VercelEDFUpload isDarkMode={isDarkMode} onFileUploaded={onFileUploaded} />

        {uploadedFiles.length > 0 && (
          <div className={`p-4 rounded-lg border ${
            isDarkMode 
              ? 'bg-[var(--dark-card)] border-[var(--dark-border)]' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <h4 className={`text-lg font-semibold mb-3 ${
              isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
            }`}>
              Select File for Analysis
            </h4>
            <div className="space-y-2">
              {uploadedFiles.map(file => (
                <button
                  key={file.id}
                  onClick={() => onFileSelected?.(file)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedFile?.id === file.id
                      ? isDarkMode
                        ? 'bg-[var(--gold)] text-[var(--navy)] border-[var(--gold)]'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                      : isDarkMode
                      ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)] text-[var(--dark-text)] hover:border-[var(--gold)]'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="font-medium">{file.name}</div>
                  <div className="text-sm opacity-75">
                    {file.num_channels} channels • {Math.round(file.duration_seconds || 0)}s • {file.file_size_mb}MB
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedFile && <VercelEDFAnalysis file={selectedFile} isDarkMode={isDarkMode} />}
      </div>
    );
  }

  // Handle Signal Processing tab (index 1)
  if (tabIndex === 1) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className={`text-2xl font-bold mb-2 ${
            isDarkMode ? 'text-[var(--dark-text)]' : 'text-[var(--navy)]'
          }`}>Signal Processing Pipeline</h3>
          <p className={`text-lg ${
            isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
          }`}>Upload EDF files and apply preprocessing operations</p>
        </div>

        <VercelEDFUpload isDarkMode={isDarkMode} onFileUploaded={onFileUploaded} />

        {uploadedFiles.length > 0 && (
          <div className={`p-4 rounded-lg border ${
            isDarkMode 
              ? 'bg-[var(--dark-card)] border-[var(--dark-border)]' 
              : 'bg-gray-50 border-gray-200'
          }`}>
            <h4 className={`text-lg font-semibold mb-3 ${
              isDarkMode ? 'text-[var(--dark-text)]' : 'text-gray-800'
            }`}>
              Select File for Processing
            </h4>
            <div className="space-y-2">
              {uploadedFiles.map(file => (
                <button
                  key={file.id}
                  onClick={() => onFileSelected?.(file)}
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    selectedFile?.id === file.id
                      ? isDarkMode
                        ? 'bg-[var(--gold)] text-[var(--navy)] border-[var(--gold)]'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                      : isDarkMode
                      ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)] text-[var(--dark-text)] hover:border-[var(--gold)]'
                      : 'bg-white border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="font-medium">{file.name}</div>
                  <div className="text-sm opacity-75">
                    {file.num_channels} channels • {Math.round(file.duration_seconds || 0)}s • {file.file_size_mb}MB
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedFile && <VercelEDFAnalysis file={selectedFile} isDarkMode={isDarkMode} />}
      </div>
    );
  }

  // Default content for other tabs
  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-2xl font-bold mb-2 ${
          isDarkMode ? 'text-[var(--dark-text)]' : 'text-[var(--navy)]'
        }`}>{current.title}</h3>
        <p className={`text-lg ${
          isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
        }`}>{current.description}</p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {current.features.map((feature, index) => (
          <div key={index} className={`p-4 rounded-lg border ${
            isDarkMode 
              ? 'bg-[var(--dark-bg-secondary)] border-[var(--dark-border)]' 
              : 'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-[var(--gold)] rounded-full"></div>
              <span className={`font-medium ${
                isDarkMode ? 'text-[var(--gold)]' : 'text-[var(--navy)]'
              }`}>{feature}</span>
            </div>
            <p className={`text-sm mt-2 ${
              isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
            }`}>Feature coming soon...</p>
          </div>
        ))}
      </div>

      <div className={`rounded-lg p-4 border ${
        isDarkMode 
          ? 'bg-[var(--dark-bg-tertiary)] border-[var(--dark-border)] text-[var(--gold)]' 
          : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      }`}>
        <p>
          <strong>Note:</strong> This is a placeholder interface. Full functionality will be implemented in subsequent development phases.
        </p>
      </div>
    </div>
  );
}

function ResultsTab() {
  const [allExperiments, setAllExperiments] = useState<ExperimentResult[]>([]);

  useEffect(() => {
    const updateResults = () => {
      setAllExperiments(experimentDB.getAllExperiments());
    };
    updateResults();
    // Update every second to catch new results
    const interval = setInterval(updateResults, 1000);
    return () => clearInterval(interval);
  }, []);

  const downloadExperimentCSV = (experimentId: string) => {
    const experiment = experimentDB.getExperiment(experimentId);
    if (experiment) {
      experimentDB.downloadCSV(experimentId, `${experiment.experimentName}_${experiment.id}.csv`);
    }
  };

  const downloadAllCSV = () => {
    experimentDB.downloadCSV(undefined, 'all_experiments.csv');
  };

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h3 className="text-3xl font-bold text-[var(--navy)] mb-4">Experiment Results</h3>
        <p className="text-xl text-gray-600 mb-6">Review and download your experiment data</p>
      </div>

      {allExperiments.length === 0 ? (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-8 rounded-xl border border-blue-200 text-center">
          <p className="text-lg text-gray-700">No experiments completed yet. Run some experiments to see results here!</p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-[var(--navy)]">
              {allExperiments.length} Experiment{allExperiments.length !== 1 ? 's' : ''} Completed
            </h4>
            <button
              onClick={downloadAllCSV}
              className="bg-[var(--navy)] text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-800 transition-colors"
            >
              📥 Download All CSV
            </button>
          </div>

          <div className="space-y-3">
            {allExperiments.map((experiment) => (
              <div
                key={experiment.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:border-[var(--gold)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-3 h-8 bg-gradient-to-b from-[var(--gold)] to-yellow-400 rounded-full"></div>
                      <div>
                        <h5 className="font-semibold text-[var(--navy)]">{experiment.experimentName}</h5>
                        <p className="text-sm text-gray-600">
                          {new Date(experiment.timestamp).toLocaleString()} • 
                          Duration: {Math.round(experiment.duration / 1000)}s • 
                          Annotations: {experiment.annotations.length}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 ml-6">
                      Type: {experiment.experimentType} • 
                      Status: {experiment.completionStatus === 'completed' ? '✅ Completed' : '⚠️ Interrupted'}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => downloadExperimentCSV(experiment.id)}
                      className="bg-[var(--gold)] text-[var(--navy)] px-3 py-1 rounded text-sm font-medium hover:bg-yellow-400 transition-colors"
                    >
                      📄 CSV
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ExperimentTabContent({ 
  tabIndex, 
  onStartExperiment,
  experimentResults 
}: { 
  tabIndex: number; 
  tabName: string;
  onStartExperiment: (experimentConfig: any) => void;
  experimentResults: any[];
}) {
  const [showExperimentModal, setShowExperimentModal] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);
  const [experimentDuration, setExperimentDuration] = useState(15);

  const content = [
    {
      title: "Welcome to Your Session",
      description: "Get ready to participate in our EEG research study.",
      content: "Please make yourself comfortable. We'll guide you through a series of simple tasks designed to measure brain activity. The entire session will take approximately 30 minutes."
    },
    {
      title: "System Calibration",
      description: "Setting up the EEG equipment for optimal signal quality.",
      content: "Please remain still while we calibrate the sensors. You'll see a progress indicator showing the signal quality from each electrode."
    },
    {
      title: "Memory Task",
      description: "A simple memory exercise to measure neural patterns.",
      content: "You'll be shown a sequence of images. Try to remember them in order. This task helps us understand memory-related brain activity."
    },
    {
      title: "Attention Task", 
      description: "Focus-based activities to measure attention networks.",
      content: "Watch the center of the screen and respond when you see specific targets. This measures how your brain maintains focus and filters distractions."
    },
    {
      title: "Response Task",
      description: "Motor response measurements for brain-behavior relationships.",
      content: "Simple button presses in response to visual or auditory cues. This helps us understand the connection between brain signals and actions."
    },
    {
      title: "Session Complete",
      description: "Thank you for participating! Here are your results.",
      content: "Your session data has been successfully recorded. You can view a summary of your performance and contribute to advancing our understanding of brain function."
    }
  ];

  const current = content[tabIndex];

  const availableExperiments = [
    {
      id: 'p300-1',
      name: 'P300#1',
      description: 'Visual stimulus with periodic and random flickers for P300 response measurement',
      duration: '10-15 minutes',
      type: 'ERP'
    }
  ];

  const handleNewExperiment = () => {
    setShowExperimentModal(true);
  };

  const handleExperimentSelection = (experimentId: string) => {
    setSelectedExperiment(experimentId);
    setShowExperimentModal(false);
    onStartExperiment({
      id: experimentId,
      duration: experimentDuration * 1000 // Convert to milliseconds
    });
  };

  // Handle Results tab (index 5)
  if (tabIndex === 5) {
    return <ResultsTab />;
  }

  return (
    <div className="space-y-8">
      {/* New Experiment Button */}
      <div className="flex justify-end mb-4">
        <button
          onClick={handleNewExperiment}
          className="bg-[var(--gold)] text-[var(--navy)] px-6 py-3 rounded-lg font-medium hover:bg-yellow-400 transition-colors shadow-md"
        >
          🧪 New Experiment
        </button>
      </div>

      <div className="text-center">
        <h3 className="text-3xl font-bold text-[var(--navy)] mb-4">{current.title}</h3>
        <p className="text-xl text-gray-600 mb-6">{current.description}</p>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-8 rounded-xl border border-blue-200">
        <p className="text-lg text-gray-700 leading-relaxed">{current.content}</p>
      </div>

      {/* Progress Indicator */}
      <div className="flex justify-center">
        <div className="flex space-x-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${
                i <= tabIndex ? 'bg-[var(--gold)]' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4 pt-4">
        <button className="bg-[var(--navy)] text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-800 transition-colors">
          {tabIndex === 5 ? 'Download Results' : tabIndex === 0 ? 'Begin Session' : 'Continue'}
        </button>
        {tabIndex > 0 && tabIndex < 5 && (
          <button className="bg-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-400 transition-colors">
            Pause
          </button>
        )}
      </div>

      {/* Experiment Selection Modal */}
      {showExperimentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-[var(--navy)]">Select Experiment</h3>
              <button
                onClick={() => setShowExperimentModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Choose an experiment to run. Each experiment is designed to capture specific neural responses.
            </p>

            {/* Duration Selector */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-lg font-semibold text-[var(--navy)] mb-3">Experiment Configuration</h4>
              <div className="flex items-center space-x-4">
                <label className="text-sm font-medium text-gray-700">
                  Duration (seconds):
                </label>
                <select
                  value={experimentDuration}
                  onChange={(e) => setExperimentDuration(parseInt(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--gold)] focus:border-transparent"
                >
                  <option value={10}>10 seconds (Quick test)</option>
                  <option value={15}>15 seconds (Short)</option>
                  <option value={30}>30 seconds (Medium)</option>
                  <option value={60}>1 minute (Standard)</option>
                  <option value={120}>2 minutes (Long)</option>
                  <option value={300}>5 minutes (Extended)</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {availableExperiments.map((experiment) => (
                <div
                  key={experiment.id}
                  className="border border-gray-200 rounded-lg p-6 hover:border-[var(--gold)] transition-colors cursor-pointer"
                  onClick={() => handleExperimentSelection(experiment.id)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="text-xl font-semibold text-[var(--navy)]">{experiment.name}</h4>
                    <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                      {experiment.type}
                    </span>
                  </div>
                  <p className="text-gray-700 mb-3">{experiment.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500">Will run for: {experimentDuration} seconds</span>
                    <button className="bg-[var(--gold)] text-[var(--navy)] px-4 py-2 rounded-lg font-medium hover:bg-yellow-400 transition-colors">
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setShowExperimentModal(false)}
                className="w-full bg-gray-300 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureCard({ icon, title, description, isDarkMode = false }: { icon: string; title: string; description: string; isDarkMode?: boolean }) {
  return (
    <div className={`p-6 rounded-xl shadow-md border hover:shadow-lg transition-all duration-300 ${
      isDarkMode 
        ? 'bg-[var(--dark-card)] border-[var(--dark-border)] hover:border-[var(--gold)]' 
        : 'bg-white border-gray-200'
    }`}>
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className={`text-xl font-semibold mb-2 ${
        isDarkMode ? 'text-[var(--dark-text)]' : 'text-[var(--navy)]'
      }`}>{title}</h3>
      <p className={`${
        isDarkMode ? 'text-[var(--dark-text-secondary)]' : 'text-gray-600'
      }`}>{description}</p>
    </div>
  );
}