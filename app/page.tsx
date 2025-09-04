'use client';

import { useState } from 'react';
import Image from 'next/image';
import VercelEDFUpload from './components/VercelEDFUpload';
import VercelEDFAnalysis from './components/VercelEDFAnalysis';

type DesktopMode = 'developer' | 'experiment';

const DeveloperTabs = [
  'Data Collection',
  'Signal Processing', 
  'Analysis Tools',
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

interface EDFFile {
  id: string;
  name: string;
  file_size_mb: number;
  uploaded_at: string;
  duration_seconds?: number;
  sampling_frequency?: number;
  num_channels?: number;
  channel_names?: string[];
  is_processed: boolean;
}

export default function Home() {
  const [currentMode, setCurrentMode] = useState<DesktopMode>('developer');
  const [activeTab, setActiveTab] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<EDFFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EDFFile | null>(null);

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
                  setCurrentMode('developer');
                  setActiveTab(0);
                }}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  currentMode === 'developer'
                    ? 'bg-[var(--gold)] text-[var(--navy)] shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                Developer Mode
              </button>
              <button
                onClick={() => {
                  setCurrentMode('experiment');
                  setActiveTab(0);
                }}
                className={`px-6 py-2 rounded-md font-medium transition-all ${
                  currentMode === 'experiment'
                    ? 'bg-[var(--gold)] text-[var(--navy)] shadow-lg'
                    : 'text-blue-200 hover:text-white hover:bg-blue-700'
                }`}
              >
                Experiment Mode
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
            currentMode === 'developer' 
              ? 'text-[var(--dark-text)]' 
              : 'text-[var(--navy)]'
          }`}>
            {currentMode === 'developer' ? 'Technical Dashboard' : 'Participant Interface'}
          </h2>
          <p className={`max-w-2xl mx-auto ${
            currentMode === 'developer' 
              ? 'text-[var(--dark-text-secondary)]' 
              : 'text-gray-600'
          }`}>
            {currentMode === 'developer' 
              ? 'Comprehensive tools for EEG data collection, analysis, and visualization. Configure experiments, process signals, and generate insights.'
              : 'Welcome to your experiment session. Follow the guided tasks and interact with the activities designed to capture neural responses.'
            }
          </p>
        </div>

        {/* Desktop Interface */}
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
              <ExperimentTabContent tabIndex={activeTab} tabName={currentTabs[activeTab]} />
            )}
          </div>
        </div>

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
      </main>
    </div>
  );
}

function DeveloperTabContent({ 
  tabIndex, 
  tabName, 
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

function ExperimentTabContent({ tabIndex, tabName }: { tabIndex: number; tabName: string }) {
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

  return (
    <div className="space-y-8">
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