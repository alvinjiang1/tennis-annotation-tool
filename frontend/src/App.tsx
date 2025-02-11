import Toolbar from "./components/Toolbar";
import useToolbarTab from "./routes/useToolbarTab";
import MainComponent from "./components/MainComponent";

const App: React.FC = () => {
  const { toolbarTab, setToolbarTab } = useToolbarTab();

  return (
    <div className="app-container flex h-screen">
      <Toolbar setToolbarTab={setToolbarTab} />      
      <div className="content flex-1 p-4">
        <h1 className="text-3xl font-bold text-white mb-4">Tennis Annotation Tool</h1>
        <MainComponent mode={toolbarTab}/>        
      </div>
    </div>
  );
};

export default App;
