import React, { useState, useEffect } from 'react';

interface Category {
  id: number;
  name: string;
  supercategory?: string;
}

interface PlayerDescriptionDisplayProps {
  videoId: string;
}

const PlayerDescriptionDisplay: React.FC<PlayerDescriptionDisplayProps> = ({ videoId }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Colors for different players
  const colors = ["#FF5555", "#55FF55", "#5555FF", "#FFAA00"];

  useEffect(() => {
    if (!videoId) return;
    
    const fetchCategories = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`http://localhost:5000/api/annotation/get/${videoId}`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.categories && data.categories.length > 0) {
            setCategories(data.categories);
          }
        }
      } catch (error) {
        console.error('Error fetching player categories:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchCategories();
  }, [videoId]);

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <div className="loading loading-spinner loading-sm"></div>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="text-center text-gray-500 py-2">
        No player descriptions found
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {categories.map((category, index) => (
        <li key={category.id} className="flex items-center p-2 bg-base-100 rounded-md shadow-sm">
          <div 
            className="w-4 h-4 rounded-full mr-3" 
            style={{ backgroundColor: colors[(category.id - 1) % colors.length] }}
          ></div>
          <span className="font-medium">{category.name}</span>
        </li>
      ))}
    </ul>
  );
};

export default PlayerDescriptionDisplay;