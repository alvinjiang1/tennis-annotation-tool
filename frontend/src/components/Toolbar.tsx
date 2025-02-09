const Toolbar: React.FC = () => {
    return (
      <aside className="w-1/5 bg-base-300 p-4 flex flex-col gap-4 shadow-lg">
        <h2 className="text-xl font-bold text-primary">What's next?</h2>
        <button className="btn btn-accent">Annotate</button>
        <button className="btn btn-info">PLACEHOLDER</button>
        <button className="btn btn-error">PLACEHOLDER</button>
      </aside>
    );
  };
  
  export default Toolbar;
  