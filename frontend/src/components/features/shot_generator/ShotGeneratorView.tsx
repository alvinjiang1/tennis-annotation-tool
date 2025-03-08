import { useState, useEffect } from 'react';
import { useToast } from '../../../hooks';

interface RallyData {
  video_id: string;
  rallies: any[];
}

interface ModelInfo {
  id: string;
  name: string;
  description: string;
}

const ShotGeneratorView = () => {
  const [selectedVideo, setSelectedVideo] = useState<string>("");
  const [availableVideos, setAvailableVideos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedLabels, setGeneratedLabels] = useState<RallyData | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("random");
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(true);
  const { showToast } = useToast();
  
  // Backend URL
  const backendUrl = 'http://localhost:5000';
  
  // Load available models from backend
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setIsLoadingModels(true);
        const response = await fetch(`${backendUrl}/api/generate_label/models`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models);
            // Set default selected model to the first one
            setSelectedModel(data.models[0].id);
          } else {
            // Fallback if no models returned
            setAvailableModels([{
              id: "random",
              name: "Random Generator",
              description: "Default model for shot label generation"
            }]);
          }
        } else {
          // Fallback for error case
          console.error("Failed to fetch models, using default");
          setAvailableModels([{
            id: "random",
            name: "Random Generator",
            description: "Default model for shot label generation"
          }]);
        }
      } catch (error) {
        console.error('Error fetching models:', error);
        // Fallback for exception
        setAvailableModels([{
          id: "random",
          name: "Random Generator",
          description: "Default model for shot label generation"
        }]);
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    fetchModels();
  }, []);
  
  // Load available videos with rally data
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${backendUrl}/api/video/uploaded-videos`);
        if (response.ok) {
          const data = await response.json();
          
          // For each video, check if it has rally data
          const videosWithRallies = [];
          for (const video of data.videos) {
            const videoId = video.split('.')[0];
            try {
              const rallyResponse = await fetch(`${backendUrl}/api/annotation/get-rallies/${videoId}`);
              if (rallyResponse.ok) {
                const rallyData = await rallyResponse.json();
                if (rallyData.rallies && Object.keys(rallyData.rallies).length > 0) {
                  videosWithRallies.push(video);
                }
              }
            } catch (error) {
              console.error(`Error checking rally data for ${video}:`, error);
            }
          }
          
          setAvailableVideos(videosWithRallies);
        }
      } catch (error) {
        console.error('Error fetching videos:', error);
        showToast('Failed to load videos with rally data', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchVideos();
  }, []);

  const handleGenerateLabels = async () => {
    if (!selectedVideo) {
      showToast('Please select a video first', 'warning');
      return;
    }
    
    try {
      setIsGenerating(true);
      
      // Get model name for notification
      const modelName = availableModels.find(m => m.id === selectedModel)?.name || selectedModel;
      showToast(`Generating shot labels using ${modelName}...`, 'info');
      
      const videoId = selectedVideo.split('.')[0];
      
      // Call the API with the selected model
      const response = await fetch(`${backendUrl}/api/generate_label/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          video_id: videoId,
          model: selectedModel
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate labels');
      }

      const data = await response.json();
      console.log("Generated labels:", data);
      setGeneratedLabels(data.rallies);
      showToast('Shot labels generated successfully!', 'success');
    } catch (error) {
      console.error('Error generating labels:', error);
      showToast('Failed to generate shot labels', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  // Helper function to get the name of the selected model
  const getSelectedModelName = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    return model ? model.name : 'Unknown Model';
  };

  // Helper function to get the description of the selected model
  const getSelectedModelDescription = () => {
    const model = availableModels.find(m => m.id === selectedModel);
    return model ? model.description : '';
  };

  // Helper function to get handedness icon
  const getHandednessIcon = (handedness?: string) => {
    switch(handedness) {
      case 'right': return '👉';
      case 'left': return '👈';
      default: return '❓';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Shot Generator</h2>
        {isLoading && (
          <div className="flex items-center">
            <span className="loading loading-spinner loading-md mr-2"></span>
            <span>Loading videos...</span>
          </div>
        )}
      </div>
      
      <div className="card bg-base-100 shadow-lg">
        <div className="card-body">
          <h3 className="card-title">Select Video with Rally Data</h3>
          <div className="form-control w-full">
            <div className="flex gap-2">
              <select
                className="select select-bordered w-full"
                value={selectedVideo}
                onChange={(e) => setSelectedVideo(e.target.value)}
                disabled={isLoading || isGenerating}
              >
                <option value="">-- Select a video --</option>
                {availableVideos.map((video) => (
                  <option key={video} value={video}>
                    {video}
                  </option>
                ))}
              </select>
            </div>
            
            {availableVideos.length === 0 && !isLoading && (
              <div className="alert alert-warning mt-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>No videos with rally data found. Please analyze rallies first.</span>
              </div>
            )}
          </div>
          
          {/* Model Selection */}
          <div className="form-control w-full mt-4">
            <label className="label">
              <span className="label-text font-medium">Select Model</span>
            </label>
            
            {isLoadingModels ? (
              <div className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                <span>Loading available models...</span>
              </div>
            ) : (
              <>
                <select
                  className="select select-bordered w-full"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isLoading || isGenerating || availableModels.length === 0}
                >
                  {availableModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
                
                {/* Model Description */}
                <div className="mt-2 text-sm opacity-70">
                  {getSelectedModelDescription()}
                </div>
              </>
            )}
            
            <button
              className="btn btn-primary mt-4"
              onClick={handleGenerateLabels}
              disabled={!selectedVideo || isGenerating || isLoadingModels}
            >
              {isGenerating ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Generating...
                </>
              ) : (
                'Generate Shot Labels'
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Results section */}
      {generatedLabels && (
        <div className="card bg-base-100 shadow-lg">
          <div className="card-body">
            <h3 className="card-title">
              Generated Shot Labels
              <div className="badge badge-secondary ml-2">
                {generatedLabels.rallies?.length || 0} Rallies
              </div>
              <div className="badge badge-primary ml-2">
                Model: {getSelectedModelName()}
              </div>
            </h3>
            
            <div className="divider"></div>
            
            {generatedLabels.rallies?.map((rally, rallyIndex) => (
              <div key={rallyIndex} className="mb-6 card bg-base-200 shadow-sm">
                <div className="card-body">
                  <h4 className="card-title text-base">Rally #{rallyIndex + 1}</h4>
                  
                  {rally.player_descriptons && (
                    <>
                      <div className="divider my-2">Player Descriptions</div>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {Object.entries(rally.player_descriptons?.descriptions || {}).map(([player, description]: [string, any]) => (
                          <div key={player} className="flex items-center gap-2">
                            <span className="font-bold">{player.toUpperCase()}</span>: {description}
                            {/* Show handedness if available */}
                            {rally.player_descriptons?.handedness && rally.player_descriptons.handedness[player] && (
                              <span className="text-lg ml-1" title={rally.player_descriptons.handedness[player]}>
                                {getHandednessIcon(rally.player_descriptons.handedness[player])}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  
                  {rally.events && rally.events.length > 0 && (
                    <>
                      <div className="divider my-2">Shot Events</div>
                      <div className="overflow-x-auto">
                        <table className="table table-zebra w-full">
                          <thead>
                            <tr>
                              <th>Player</th>
                              <th>Hand</th>
                              <th>Frame</th>
                              <th>Label</th>
                              <th>Outcome</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rally.events.map((event: any, eventIndex: number) => (
                              <tr key={eventIndex}>
                                <td>{event.player}</td>
                                <td className="text-center">
                                  <span title={event.handedness || 'unknown'}>
                                    {getHandednessIcon(event.handedness)}
                                  </span>
                                </td>
                                <td>{event.frame}</td>
                                <td className="font-mono text-xs">{event.label}</td>
                                <td>
                                  <span className={`badge ${
                                    event.outcome === 'in' ? 'badge-success' : 
                                    event.outcome === 'err' ? 'badge-error' :
                                    event.outcome === 'win' ? 'badge-accent' : 'badge-warning'
                                  }`}>
                                    {event.outcome}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  
                  {rally.error && (
                    <div className="alert alert-error mt-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{rally.error}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Help Section */}
      <div className="collapse collapse-arrow bg-base-100 shadow-lg">
        <input type="checkbox" /> 
        <div className="collapse-title font-medium">
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How Shot Generation Works
          </div>
        </div>
        <div className="collapse-content"> 
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold mb-2">Steps to Generate Shot Labels</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>First define player descriptions including handedness</li>
                <li>Analyze rallies in the "Rally Analysis" tab</li>
                <li>Mark all hitting moments in each rally</li>
                <li>Save the rally data when complete</li>
                <li>Return to this tab and select your video</li>
                <li>Choose an appropriate model for analysis</li>
                <li>Click "Generate Shot Labels" to start AI analysis</li>
                <li>Review the generated labels for each rally</li>
              </ol>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Available Models</h4>
              {isLoadingModels ? (
                <div className="flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Loading model information...</span>
                </div>
              ) : (
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {availableModels.map(model => (
                    <li key={model.id} className="mb-2">
                      <strong>{model.name}:</strong> {model.description}
                    </li>
                  ))}
                </ul>
              )}

              <h4 className="font-semibold mt-4 mb-2">Label Format</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li><strong>Court Position:</strong> near/far + deuce/ad</li>
                <li><strong>Shot Type:</strong> serve, return, stroke</li>
                <li><strong>Shot Technique:</strong> forehand (fh), backhand (bh)</li>
                <li><strong>Shot Style:</strong> volley (v), slice (s), groundstroke (gs)</li>
                <li><strong>Direction:</strong> crosscourt (CC), down the line (DL)</li>
                <li><strong>Outcome:</strong> in, error (err), winner (win)</li>
                <li><strong>Handedness:</strong> affects technique and shot direction</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShotGeneratorView;