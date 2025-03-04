import React, { useState, useEffect } from 'react';
import { useToast } from '../../../hooks';

interface Player {
  id: number;
  name: string;
}

interface PlayerDescriptionFormProps {
  videoId: string;
  onComplete: () => void;
}

const PlayerDescriptionForm: React.FC<PlayerDescriptionFormProps> = ({ videoId, onComplete }) => {
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: "" },
    { id: 2, name: "" },
    { id: 3, name: "" },
    { id: 4, name: "" }
  ]);
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
              name: cat.name
            }));
            
            // Ensure we always have 4 players
            const updatedPlayers = [...loadedPlayers];
            while (updatedPlayers.length < 4) {
              updatedPlayers.push({ id: updatedPlayers.length + 1, name: "" });
            }
            
            setPlayers(updatedPlayers);
            
            // If all players have descriptions, we can consider setup complete
            if (updatedPlayers.every(p => p.name && p.name.trim() !== '')) {
              showToast('Player descriptions loaded', 'info');
              onComplete(); // Skip the form if we already have all descriptions
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
  }, [videoId]);

  const handleNameChange = (id: number, name: string) => {
    setPlayers(prev => 
      prev.map(player => 
        player.id === id ? { ...player, name } : player
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
      
      // We'll send the categories in COCO format
      const categories = players.map(player => ({
        id: player.id,
        name: player.name,
        supercategory: "person"
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
      
      showToast('Player descriptions saved successfully', 'success');
      onComplete();
    } catch (error) {
      console.error('Error saving player descriptions:', error);
      showToast('Failed to save player descriptions', 'error');
    } finally {
      setIsSaving(false);
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
      <h3 className="card-title mb-4">Player Descriptions</h3>
      <p className="text-sm mb-4">
        Provide a unique description for each player in the video. This will be used for all annotations.
      </p>
      
      <div className="space-y-4">
        {players.map((player) => (
          <div key={player.id} className="form-control">
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
        ))}
      </div>
      
      <div className="card-actions justify-end mt-6">
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
          ) : 'Save Player Descriptions'}
        </button>
      </div>
    </div>
  );
};

export default PlayerDescriptionForm;