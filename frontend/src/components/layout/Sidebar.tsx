import React from 'react';
import { ANNOTATION, TRAINING, SHOT_LABELLING } from '../../hooks/useToolbarTab'

interface SidebarProps {
  setToolbarTab: (tabIndex: number) => void;
  currentTab: number;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  setToolbarTab, 
  currentTab, 
  collapsed,
  setCollapsed 
}) => {
  const navItems = [
    { id: ANNOTATION, name: 'Annotate', icon: '✏️', color: 'accent' },
    { id: TRAINING, name: 'Training', icon: '🧠', color: 'primary' },
    { id: SHOT_LABELLING, name: 'Label Shots', icon: '🎬', color: 'error' }
  ];

  return (
    <aside 
      className={`bg-base-300 shadow-xl transition-all duration-300 flex flex-col ${
        collapsed ? 'w-16' : 'w-64'
      } h-full`}
    >
      <div className="flex justify-end p-2 lg:hidden">
        <button 
          className="btn btn-sm btn-circle btn-ghost"
          onClick={() => setCollapsed(true)}
        >
          ✕
        </button>
      </div>

      <div className="p-4">
        <h2 className={`font-bold mb-4 ${collapsed ? 'text-center text-xs' : 'text-xl'}`}>
          {collapsed ? '🎾' : "What's next?"}
        </h2>
        
        <ul className="menu gap-2">
          {navItems.map((item) => (
            <li key={item.id} className="mb-2">
              <button
                className={`btn ${currentTab === item.id ? `btn-${item.color}` : 'btn-ghost'} 
                  ${collapsed ? 'btn-square' : 'w-full justify-start'}`}
                onClick={() => setToolbarTab(item.id)}
              >
                <span className="text-lg">{item.icon}</span>
                {!collapsed && <span>{item.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      
      {/* Collapse toggle button (desktop only) */}
      <div className="mt-auto p-4 hidden lg:block">
        <button 
          className="btn btn-sm btn-ghost w-full"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '≫' : '≪'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;