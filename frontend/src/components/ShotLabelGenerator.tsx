import { useState } from 'react';

interface ShotLabelGeneratorProps {
    imageUrl: string;
}

export const ShotLabelGenerator = ({ imageUrl }: ShotLabelGeneratorProps) => {
    const [loading, setLoading] = useState(false);
    const [output, setOutput] = useState<any>(null);    

    const handleGenerateShotLabels = async () => {
        setLoading(true);        
        setOutput(null);

        try {
            const response = await fetch("http://localhost:5000/api/inference/predict", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_url: imageUrl }),
            });
            const data = await response.json();
            if (!response.ok) {
            throw new Error(`Shot Labels Generation Failed: ${data.error}`);
            }
            setOutput(data['rallies']);
        } catch (error) {
            console.error("Failed to fetch predicted shot labels:", error);
        } finally {
            setLoading(false);
        }        
    };
    return (
        <div className="justify-center mt-4">
        <button className="btn btn-primary" onClick={handleGenerateShotLabels} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Shot Labels'}
        </button>        
        {output && (
            <div className="mt-2 p-2 border rounded bg-gray-100">
            <pre>{JSON.stringify(output, null, 2)}</pre>
            </div>
        )}
        </div>
    );
};