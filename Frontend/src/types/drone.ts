export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  trashScore: number; // 0-100
  imageUrl: string;
  timestamp: string;
}

export interface FlightPath {
  id: string;
  date: string;
  waypoints: Waypoint[];
}

export const getTrashColor = (score: number): string => {
  if (score < 25) return 'hsl(var(--heat-low))';
  if (score < 50) return 'hsl(var(--heat-medium))';
  if (score < 75) return 'hsl(var(--heat-high))';
  return 'hsl(var(--heat-critical))';
};

export const getTrashLabel = (score: number): string => {
  if (score < 25) return 'Low';
  if (score < 50) return 'Medium';
  if (score < 75) return 'High';
  return 'Critical';
};
