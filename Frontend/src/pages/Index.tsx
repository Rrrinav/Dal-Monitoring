import { useState, useEffect, useCallback } from 'react';
import MapVisualization from '@/components/MapVisualization';
import StatsPanel from '@/components/StatsPanel';
import WaypointDetails from '@/components/WaypointDetails';
import FlightSelector from '@/components/FlightSelector';
// REMOVED: import { mockFlightPaths } from '@/data/mockFlightData'; // No longer using mock data file
import { Waypoint } from '@/types/drone';
import { Waves } from 'lucide-react';

// Define the Flight Path type for the fetched data
interface FlightPath {
  id: string;
  date: string;
  waypoints: Waypoint[];
}

const API_BASE_URL = 'http://127.0.0.1:1234'; // Flask API URL

const Index = () => {
  const [flightPaths, setFlightPaths] = useState<FlightPath[]>([]); // New state for all flight paths
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentFlightIndex, setCurrentFlightIndex] = useState(0);
  const [selectedWaypoint, setSelectedWaypoint] = useState<Waypoint | null>(null);
  
  // Custom hook/function to fetch data
  const fetchFlightData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_BASE_URL}/flights`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: FlightPath[] = await response.json();
      setFlightPaths(data);
      setLoading(false);
    } catch (e) {
      console.error("Failed to fetch flight data:", e);
      setError("Failed to load flight data from API.");
      setLoading(false);
    }
  }, []); // Empty dependency array means this function is created once

  useEffect(() => {
    fetchFlightData();
  }, [fetchFlightData]); // Run once on component mount

  // Use the fetched data
  const currentFlight = flightPaths[currentFlightIndex];

  // --- Conditional Rendering for Loading/Error States ---
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-xl text-foreground">Loading flight data... 🛰️</p>
      </div>
    );
  }

  if (error || flightPaths.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <p className="text-xl text-red-500 mb-4">Error: {error || "No flights found."}</p>
        <button 
          onClick={fetchFlightData} 
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Try Reloading Data
        </button>
      </div>
    );
  }
  // --- End Conditional Rendering ---


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-primary rounded-lg">
                <Waves className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Dal Lake Monitor</h1>
                <p className="text-sm text-muted-foreground">Drone Surveillance & Trash Analysis</p>
              </div>
            </div>
            <FlightSelector
              flightPaths={flightPaths} // Use state data
              currentIndex={currentFlightIndex}
              onSelect={setCurrentFlightIndex}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-[1fr_350px] gap-6 h-[calc(100vh-180px)]">
          {/* Map Section */}
          <div className="h-full">
            <MapVisualization
              flightPath={currentFlight}
              onWaypointClick={setSelectedWaypoint}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6 overflow-auto">
            <StatsPanel flightPath={currentFlight} />
            <WaypointDetails
              waypoint={selectedWaypoint}
              onClose={() => setSelectedWaypoint(null)}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Index;