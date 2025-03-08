import React, { useState, useEffect } from 'react';

interface ShotLabel {
  player: string;
  frame: number;
  label: string;
  outcome: string;
  handedness?: string;
}

interface LabelEditorProps {
  frameUrl: string;
  label: ShotLabel;
  players: any;
  onUpdateLabel: (updatedLabel: ShotLabel) => void;
}

// Court Position options
const courtPositions = ["near_deuce", "near_ad", "far_deuce", "far_ad"];

// Side options
const sides = ["forehand", "backhand"];

// Shot Type options
const shotTypes = ["serve", "second-serve", "return", "volley", "lob", "smash", "swing"];

// Direction options - serve
const serveDirections = ["T", "B", "W"];

// Direction options - other shots
const shotDirections = ["CC", "DL", "IO", "II"];

// Formation options
const serveFormations = ["conventional", "i-formation", "australian"];
const nonServeFormation = ["non-serve"];

// Outcome options
const outcomes = ["in", "win", "err"];

const LabelEditor: React.FC<LabelEditorProps> = ({ 
  frameUrl, 
  label, 
  players, 
  onUpdateLabel 
}) => {
  const [parsedLabel, setParsedLabel] = useState<{
    courtPosition: string;
    side: string;
    shotType: string;
    direction: string;
    formation: string;
    outcome: string;
  }>({
    courtPosition: "near_deuce",
    side: "forehand",
    shotType: "serve",
    direction: "T",
    formation: "conventional",
    outcome: "in"
  });
  
  const [isEditing, setIsEditing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  
  // Parse the label into components when it changes
  useEffect(() => {
    if (!label || !label.label) return;
    
    try {
      // Assuming label format: courtPosition_side_shotType_direction_formation_outcome
      const parts = label.label.split('_');
      
      // Handle court position (first two parts)
      let courtPosition = parts[0];
      if (parts.length > 1 && parts[1] === "ad" || parts[1] === "deuce") {
        courtPosition = `${parts[0]}_${parts[1]}`;
      }
      
      // Find indices for remaining components
      const remainingParts = parts.slice(courtPosition.includes('_') ? 2 : 1);
      
      setParsedLabel({
        courtPosition: courtPositions.includes(courtPosition) ? courtPosition : "near_deuce",
        side: sides.includes(remainingParts[0]) ? remainingParts[0] : "forehand",
        shotType: shotTypes.includes(remainingParts[1]) ? remainingParts[1] : "serve",
        direction: [...serveDirections, ...shotDirections].includes(remainingParts[2]) ? remainingParts[2] : "T",
        formation: [...serveFormations, ...nonServeFormation].includes(remainingParts[3]) ? remainingParts[3] : "conventional",
        outcome: outcomes.includes(remainingParts[4]) ? remainingParts[4] : "in"
      });
    } catch (error) {
      console.error("Error parsing label:", error);
      // Set defaults if parsing fails
      setParsedLabel({
        courtPosition: "near_deuce",
        side: "forehand",
        shotType: "serve",
        direction: "T",
        formation: "conventional",
        outcome: "in"
      });
    }
  }, [label]);
  
  // Update a specific component of the label
  const handleComponentChange = (component: string, value: string) => {
    setParsedLabel(prev => {
      const newValues = {
        ...prev,
        [component]: value
      };
      
      // Handle interdependencies between components
      
      // If shot type is serve or second-serve, adjust direction and formation options
      if (component === 'shotType') {
        if (value === 'serve' || value === 'second-serve') {
          // For serves, direction can only be T, B, W
          if (!serveDirections.includes(newValues.direction)) {
            newValues.direction = 'T';
          }
          // Formation can only be conventional, i-formation, australian
          if (!serveFormations.includes(newValues.formation)) {
            newValues.formation = 'conventional';
          }
        } else {
          // For non-serves, formation is always non-serve
          newValues.formation = 'non-serve';
          
          // If direction was a serve direction, reset it to appropriate default
          if (serveDirections.includes(newValues.direction)) {
            newValues.direction = 'CC';
          }
        }
      }
      
      validateLabelCombination(newValues);
      return newValues;
    });
  };
  
  // Validate court-side-direction combinations
  const validateLabelCombination = (values: typeof parsedLabel) => {
    const errors: string[] = [];
    
    // Skip validation for serves
    if (values.shotType === 'serve' || values.shotType === 'second-serve') {
      setValidationErrors([]);
      return;
    }
    
    // Get player handedness
    const playerHandedness = getPlayerHandedness(label.player);
    const isRightHanded = playerHandedness === 'right';
    
    // Check court-side-direction combinations based on handedness
    const courtPart = values.courtPosition.split('_')[1]; // ad or deuce
    
    if (isRightHanded) {
      // Right-handed validations
      if (courtPart === 'ad') {
        // Ad court for right-handed
        if (values.side === 'backhand' && !['CC', 'DL'].includes(values.direction)) {
          errors.push("Right-handed players in Ad court using backhand should hit CC or DL");
        }
        if (values.side === 'forehand' && !['II', 'IO'].includes(values.direction)) {
          errors.push("Right-handed players in Ad court using forehand should hit II or IO");
        }
      } else if (courtPart === 'deuce') {
        // Deuce court for right-handed
        if (values.side === 'forehand' && !['CC', 'DL'].includes(values.direction)) {
          errors.push("Right-handed players in Deuce court using forehand should hit CC or DL");
        }
        if (values.side === 'backhand' && !['II', 'IO'].includes(values.direction)) {
          errors.push("Right-handed players in Deuce court using backhand should hit II or IO");
        }
      }
    } else {
      // Left-handed validations
      if (courtPart === 'ad') {
        // Ad court for left-handed
        if (values.side === 'forehand' && !['CC', 'DL'].includes(values.direction)) {
          errors.push("Left-handed players in Ad court using forehand should hit CC or DL");
        }
        if (values.side === 'backhand' && !['II', 'IO'].includes(values.direction)) {
          errors.push("Left-handed players in Ad court using backhand should hit II or IO");
        }
      } else if (courtPart === 'deuce') {
        // Deuce court for left-handed
        if (values.side === 'backhand' && !['CC', 'DL'].includes(values.direction)) {
          errors.push("Left-handed players in Deuce court using backhand should hit CC or DL");
        }
        if (values.side === 'forehand' && !['II', 'IO'].includes(values.direction)) {
          errors.push("Left-handed players in Deuce court using forehand should hit II or IO");
        }
      }
    }
    
    setValidationErrors(errors);
  };
  
  // Generate full label string from components
  const generateLabelString = () => {
    return `${parsedLabel.courtPosition}_${parsedLabel.side}_${parsedLabel.shotType}_${parsedLabel.direction}_${parsedLabel.formation}_${parsedLabel.outcome}`;
  };
  
  // Save changes
  const handleSaveChanges = () => {
    // Don't save if there are validation errors
    if (validationErrors.length > 0) {
      return;
    }
    
    const newLabelString = generateLabelString();
    const updatedLabel = {
      ...label,
      label: newLabelString,
      outcome: parsedLabel.outcome
    };
    onUpdateLabel(updatedLabel);
    setIsEditing(false);
  };
  
  // Get player name from player ID
  const getPlayerName = (playerId: string) => {
    if (players && players.descriptions && players.descriptions[playerId]) {
      return players.descriptions[playerId];
    }
    return playerId;
  };
  
  // Get player handedness
  const getPlayerHandedness = (playerId: string) => {
    if (players && players.handedness && players.handedness[playerId]) {
      return players.handedness[playerId];
    }
    return "unknown";
  };
  
  // Helper function to get handedness icon
  const getHandednessIcon = (handedness: string) => {
    switch(handedness) {
      case 'right': return '👉';
      case 'left': return '👈';
      default: return '❓';
    }
  };
  
  // Get available directions based on shot type
  const getAvailableDirections = () => {
    const isServe = parsedLabel.shotType === 'serve' || parsedLabel.shotType === 'second-serve';
    return isServe ? serveDirections : shotDirections;
  };
  
  // Get available formations based on shot type
  const getAvailableFormations = () => {
    const isServe = parsedLabel.shotType === 'serve' || parsedLabel.shotType === 'second-serve';
    return isServe ? serveFormations : nonServeFormation;
  };
  
  if (!frameUrl) {
    return (
      <div className="alert alert-warning">
        <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>No frame found for this shot. Please select another shot.</span>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col space-y-4">
      {/* Top section: Frame image */}
      <div className="card bg-base-200 p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="badge badge-primary">Frame {label.frame}</div>
            <div className="badge badge-secondary">
              Player {label.player} 
              {label.handedness && (
                <span className="ml-1" title={label.handedness}>
                  {getHandednessIcon(label.handedness)}
                </span>
              )}
            </div>
            <div className={`badge ${
              label.outcome === 'in' ? 'badge-success' : 
              label.outcome === 'err' ? 'badge-error' : 'badge-accent'
            }`}>
              {label.outcome === 'in' ? 'In' : 
               label.outcome === 'err' ? 'Error' : 'Winner'}
            </div>
          </div>
          
          <button
            className={`btn ${isEditing ? 'btn-error' : 'btn-primary'}`}
            onClick={() => setIsEditing(!isEditing)}
          >
            {isEditing ? 'Cancel Editing' : 'Edit Label'}
          </button>
        </div>
        
        <div className="flex justify-center">
          <div className="relative max-w-full">
            <img 
              src={frameUrl} 
              alt="Shot Frame" 
              className="rounded-lg shadow-md max-w-full max-h-[50vh] mx-auto"
              onLoad={() => setImageLoaded(true)}
            />
            
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="loading loading-spinner loading-lg"></span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Bottom section: Label editor */}
      <div className="card bg-base-200 p-4">
        {/* Display validation errors */}
        {validationErrors.length > 0 && isEditing && (
          <div className="alert alert-warning mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="font-bold">Validation Errors</h4>
              <ul className="list-disc list-inside text-sm">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
        
        {isEditing ? (
          // Editing form - grid layout for controls
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Court Position</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={parsedLabel.courtPosition}
                onChange={(e) => handleComponentChange('courtPosition', e.target.value)}
              >
                {courtPositions.map(position => (
                  <option key={position} value={position}>
                    {position.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Side</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={parsedLabel.side}
                onChange={(e) => handleComponentChange('side', e.target.value)}
              >
                {sides.map(side => (
                  <option key={side} value={side}>
                    {side.charAt(0).toUpperCase() + side.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Shot Type</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={parsedLabel.shotType}
                onChange={(e) => handleComponentChange('shotType', e.target.value)}
              >
                {shotTypes.map(type => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Direction</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={parsedLabel.direction}
                onChange={(e) => handleComponentChange('direction', e.target.value)}
              >
                {getAvailableDirections().map(dir => (
                  <option key={dir} value={dir}>
                    {dir === "T" ? "Down the T (T)" : 
                     dir === "B" ? "Body (B)" :
                     dir === "W" ? "Wide (W)" :
                     dir === "CC" ? "Cross-court (CC)" : 
                     dir === "DL" ? "Down the Line (DL)" : 
                     dir === "IO" ? "Inside Out (IO)" : 
                     dir === "II" ? "Inside In (II)" : dir}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Formation</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={parsedLabel.formation}
                onChange={(e) => handleComponentChange('formation', e.target.value)}
              >
                {getAvailableFormations().map(formation => (
                  <option key={formation} value={formation}>
                    {formation.charAt(0).toUpperCase() + formation.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-control">
              <label className="label">
                <span className="label-text">Outcome</span>
              </label>
              <select
                className="select select-bordered w-full"
                value={parsedLabel.outcome}
                onChange={(e) => handleComponentChange('outcome', e.target.value)}
              >
                {outcomes.map(outcome => (
                  <option key={outcome} value={outcome}>
                    {outcome === "in" ? "In play (in)" : 
                     outcome === "err" ? "Error (err)" : 
                     "Winner (win)"}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-control md:col-span-2 lg:col-span-3">
              <button
                className="btn btn-success w-full mt-4"
                onClick={handleSaveChanges}
                disabled={validationErrors.length > 0}
              >
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          // Display parsed label components in a more compact format
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2">
            <div className="flex justify-between border-b pb-1">
              <span className="font-medium">Court Position:</span>
              <span>{parsedLabel.courtPosition.replace('_', ' ')}</span>
            </div>
            
            <div className="flex justify-between border-b pb-1">
              <span className="font-medium">Side:</span>
              <span>{parsedLabel.side.charAt(0).toUpperCase() + parsedLabel.side.slice(1)}</span>
            </div>
            
            <div className="flex justify-between border-b pb-1">
              <span className="font-medium">Shot Type:</span>
              <span>{parsedLabel.shotType.charAt(0).toUpperCase() + parsedLabel.shotType.slice(1)}</span>
            </div>
            
            <div className="flex justify-between border-b pb-1">
              <span className="font-medium">Direction:</span>
              <span>
                {parsedLabel.direction === "T" ? "Down the T" : 
                 parsedLabel.direction === "B" ? "Body" :
                 parsedLabel.direction === "W" ? "Wide" :
                 parsedLabel.direction === "CC" ? "Cross-court" : 
                 parsedLabel.direction === "DL" ? "Down the Line" : 
                 parsedLabel.direction === "IO" ? "Inside Out" : 
                 parsedLabel.direction === "II" ? "Inside In" : 
                 parsedLabel.direction}
              </span>
            </div>
            
            <div className="flex justify-between border-b pb-1">
              <span className="font-medium">Formation:</span>
              <span>{parsedLabel.formation.charAt(0).toUpperCase() + parsedLabel.formation.slice(1)}</span>
            </div>
            
            <div className="flex justify-between border-b pb-1">
              <span className="font-medium">Outcome:</span>
              <span className={
                parsedLabel.outcome === "in" ? "text-success" :
                parsedLabel.outcome === "err" ? "text-error" :
                "text-accent"
              }>
                {parsedLabel.outcome === "in" ? "In play" : 
                 parsedLabel.outcome === "err" ? "Error" : 
                 "Winner"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LabelEditor;