import React, { useState, useEffect } from 'react';
import { useToast } from '../../../hooks';

interface Player {
  id: number;
  name: string;
  handedness: "right" | "left" | "unknown";
}

interface PlayerDescriptionFormProps {
  videoId: string;
  onComplete: () => void;
  editMode?: boolean; // New prop to indicate editing mode
}

const PlayerDescriptionForm: React.FC<PlayerDescriptionFormProps> = ({ 
  videoId, 
  onComplete,
  editMode = false // Default to false for backward compatibility
}) => {
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: "", handedness: "unknown" },
    { id: 2, name: "", handedness: "unknown" },
    { id: 3, name: "", handedness: "unknown" },
    { id: 4, name: "", handedness: "unknown" }
  ]);
  const [originalPlayers, setOriginalPlayers] = useState<Player[]>([]); // Store original data for comparison
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  // Load existing categories when component mounts
  useEffect(() => {
    if (!videoId) return;
    
    const loadCategories = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`http://localhost:5000/api/annotation/get/${videoId}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Check if we have categories defined
          if (data.categories && data.categories.length > 0) {
            // Map categories to our player structure
            const loadedPlayers = data.categories.map((cat: any) => ({
              id: cat.id,
              name: cat.name,
              // Extract handedness from metadata if available, default to unknown
              handedness: cat.handedness || "unknown"
            }));
            
            // Ensure we always have 4 players
            const updatedPlayers = [...loadedPlayers];
            while (updatedPlayers.length < 4) {
              updatedPlayers.push({ id: updatedPlayers.length + 1, name: "", handedness: "unknown" });
            }
            
            setPlayers(updatedPlayers);
            setOriginalPlayers(JSON.parse(JSON.stringify(updatedPlayers))); // Deep copy for comparison
            
            // If not in edit mode and all players have descriptions, we can consider setup complete
            if (!editMode && updatedPlayers.every(p => p.name && p.name.trim() !== '')) {
              showToast('Player descriptions loaded', 'info');
              onComplete(); // Skip the form if we already have all descriptions and not in edit mode
            }
          }
        }
      } catch (error) {
        console.error('Error loading player categories:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadCategories();
  }, [videoId, editMode]);

  const handleNameChange = (id: number, name: string) => {
    setPlayers(prev => 
      prev.map(player => 
        player.id === id ? { ...player, name } : player
      )
    );
  };

  const handleHandednessChange = (id: number, handedness: "right" | "left" | "unknown") => {
    setPlayers(prev => 
      prev.map(player => 
        player.id === id ? { ...player, handedness } : player
      )
    );
  };

  const handleSubmit = async () => {
    // Validate: all players must have descriptions
    const emptyDescriptions = players.filter(p => !p.name || p.name.trim() === '');
    if (emptyDescriptions.length > 0) {
      showToast('Please provide descriptions for all players', 'error');
      return;
    }
    
    // Validate: no duplicate descriptions
    const names = players.map(p => p.name.trim());
    const uniqueNames = new Set(names);
    if (uniqueNames.size !== names.length) {
      showToast('Each player must have a unique description', 'error');
      return;
    }
    
    try {
      setIsSaving(true);
      
      // We'll send the categories in COCO format with handedness
      const categories = players.map(player => ({
        id: player.id,
        name: player.name,
        supercategory: "person",
        handedness: player.handedness // Add handedness field
      }));
      
      const response = await fetch(`http://localhost:5000/api/annotation/save-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          video_id: videoId,
          categories: categories
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save player descriptions');
      }
      
      // Check if we actually made changes
      const madeChanges = players.some((player, idx) => 
        player.name !== originalPlayers[idx]?.name || 
        player.handedness !== originalPlayers[idx]?.handedness
      );
      
      const message = editMode 
        ? (madeChanges ? 'Player descriptions updated successfully' : 'No changes were made') 
        : 'Player descriptions saved successfully';
        
      showToast(message, 'success');
      onComplete();
    } catch (error) {
      console.error('Error saving player descriptions:', error);
      showToast('Failed to save player descriptions', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    // In edit mode, we can cancel and restore original values
    if (editMode) {
      setPlayers(JSON.parse(JSON.stringify(originalPlayers))); // Restore from deep copy
      onComplete();
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  return (
    <div className="card bg-base-100 shadow-lg p-6">
      <h3 className="card-title mb-4">
        {editMode ? 'Edit Player Descriptions' : 'Player Descriptions'}
      </h3>
      
      <p className="text-sm mb-4">
        {editMode 
          ? 'Update the descriptions and handedness for each player in the video. This will affect all annotations.' 
          : 'Provide a unique description and select handedness for each player in the video.'}
      </p>
      
      <div className="space-y-6">
        {players.map((player) => (
          <div key={player.id} className="border-b pb-4">
            <div className="form-control mb-2">
              <label className="label">
                <span className="label-text font-medium">Player {player.id}</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="e.g., Blue shirt red shoes"
                value={player.name}
                onChange={(e) => handleNameChange(player.id, e.target.value)}
              />
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Handedness</span>
              </label>
              <div className="flex gap-4">
                <label className="label cursor-pointer justify-start gap-2">
                  <input 
                    type="radio" 
                    name={`handedness-${player.id}`} 
                    className="radio radio-sm" 
                    checked={player.handedness === "right"}
                    onChange={() => handleHandednessChange(player.id, "right")}
                  />
                  <span className="label-text">Right-handed</span>
                </label>
                
                <label className="label cursor-pointer justify-start gap-2">
                  <input 
                    type="radio" 
                    name={`handedness-${player.id}`} 
                    className="radio radio-sm" 
                    checked={player.handedness === "left"}
                    onChange={() => handleHandednessChange(player.id, "left")}
                  />
                  <span className="label-text">Left-handed</span>
                </label>
                
                <label className="label cursor-pointer justify-start gap-2">
                  <input 
                    type="radio" 
                    name={`handedness-${player.id}`} 
                    className="radio radio-sm" 
                    checked={player.handedness === "unknown"}
                    onChange={() => handleHandednessChange(player.id, "unknown")}
                  />
                  <span className="label-text">Unknown</span>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="card-actions justify-end mt-6">
        {editMode && (
          <button 
            className="btn btn-outline"
            onClick={handleCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
        )}
        
        <button 
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Saving...
            </>
          ) : (editMode ? 'Update Players' : 'Save Player Descriptions')}
        </button>
      </div>
    </div>
  );
};

export default PlayerDescriptionForm;