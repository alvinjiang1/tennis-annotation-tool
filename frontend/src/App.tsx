import React from 'react';
import { ToastProvider } from './components/common/ToastProvider';
import Sidebar from './components/layout/Sidebar';
import ThemeSwitcher from './components/common/ThemeSwitcher';
import MainComponent from './components/layout/MainComponent';
import useToolbarTab, { ANNOTATION, TRAINING, SHOT_LABELLING } from './hooks/useToolbarTab';

const App: React.FC = () => {
  const { toolbarTab, setToolbarTab } = useToolbarTab();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-base-200 flex flex-col">
        {/* Header */}
        <header className="bg-primary text-primary-content shadow-lg">
          <div className="container mx-auto p-4 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <button 
                className="btn btn-circle btn-ghost lg:hidden"
                onClick={toggleSidebar}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" 
                    className="w-6 h-6 stroke-current">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" 
                      d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              </button>
              <h1 className="text-2xl font-bold flex items-center">
                <span className="mr-2">🎾</span>
                Tennis Annotation Tool
              </h1>
            </div>
            <ThemeSwitcher />
          </div>
        </header>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar 
            setToolbarTab={setToolbarTab} 
            currentTab={toolbarTab}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
          />

          {/* Content area */}
          <main className={`flex-1 p-6 transition-all duration-300 ${sidebarCollapsed ? 'ml-0' : ''} overflow-y-auto`}>
            <div className="container mx-auto">
              <MainComponent mode={toolbarTab} />
            </div>
          </main>
        </div>

        {/* Footer */}
        <footer className="bg-neutral text-neutral-content p-4">
          <div className="container mx-auto text-center text-sm">
            Tennis Annotation Tool © {new Date().getFullYear()}
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
};

export default App;