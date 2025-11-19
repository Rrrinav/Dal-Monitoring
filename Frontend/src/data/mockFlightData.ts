import { FlightPath } from "@/types/drone";

// Dal Lake coordinates: approximately 34.0911° N, 74.8697° E
const DAL_LAKE_CENTER = { lat: 34.0911, lng: 74.8697 };

// Generate mock flight paths around Dal Lake
export const mockFlightPaths: FlightPath[] = [
  {
    id: "flight-1",
    date: "2025-01-15",
    waypoints: [
      { id: "wp-1-1", lat: 34.0950, lng: 74.8650, trashScore: 15, imageUrl: "", timestamp: "09:00:00" },
      { id: "wp-1-2", lat: 34.0940, lng: 74.8680, trashScore: 35, imageUrl: "", timestamp: "09:15:00" },
      { id: "wp-1-3", lat: 34.0920, lng: 74.8710, trashScore: 65, imageUrl: "", timestamp: "09:30:00" },
      { id: "wp-1-4", lat: 34.0900, lng: 74.8730, trashScore: 45, imageUrl: "", timestamp: "09:45:00" },
      { id: "wp-1-5", lat: 34.0880, lng: 74.8700, trashScore: 80, imageUrl: "", timestamp: "10:00:00" },
      { id: "wp-1-6", lat: 34.0870, lng: 74.8670, trashScore: 55, imageUrl: "", timestamp: "10:15:00" },
    ]
  },
  {
    id: "flight-2",
    date: "2025-01-16",
    waypoints: [
      { id: "wp-2-1", lat: 34.0960, lng: 74.8640, trashScore: 20, imageUrl: "", timestamp: "09:00:00" },
      { id: "wp-2-2", lat: 34.0945, lng: 74.8670, trashScore: 42, imageUrl: "", timestamp: "09:15:00" },
      { id: "wp-2-3", lat: 34.0925, lng: 74.8700, trashScore: 72, imageUrl: "", timestamp: "09:30:00" },
      { id: "wp-2-4", lat: 34.0905, lng: 74.8720, trashScore: 38, imageUrl: "", timestamp: "09:45:00" },
      { id: "wp-2-5", lat: 34.0885, lng: 74.8690, trashScore: 88, imageUrl: "", timestamp: "10:00:00" },
      { id: "wp-2-6", lat: 34.0875, lng: 74.8660, trashScore: 50, imageUrl: "", timestamp: "10:15:00" },
    ]
  },
  {
    id: "flight-3",
    date: "2025-01-17",
    waypoints: [
      { id: "wp-3-1", lat: 34.0955, lng: 74.8655, trashScore: 12, imageUrl: "", timestamp: "09:00:00" },
      { id: "wp-3-2", lat: 34.0935, lng: 74.8685, trashScore: 28, imageUrl: "", timestamp: "09:15:00" },
      { id: "wp-3-3", lat: 34.0915, lng: 74.8715, trashScore: 58, imageUrl: "", timestamp: "09:30:00" },
      { id: "wp-3-4", lat: 34.0895, lng: 74.8735, trashScore: 40, imageUrl: "", timestamp: "09:45:00" },
      { id: "wp-3-5", lat: 34.0875, lng: 74.8705, trashScore: 75, imageUrl: "", timestamp: "10:00:00" },
      { id: "wp-3-6", lat: 34.0865, lng: 74.8675, trashScore: 48, imageUrl: "", timestamp: "10:15:00" },
    ]
  }
];
