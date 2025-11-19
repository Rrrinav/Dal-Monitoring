import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { FlightPath, Waypoint, getTrashColor } from '@/types/drone';
import { toast } from 'sonner';

// Fix for default marker icons in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface MapVisualizationProps {
  flightPath: FlightPath;
  onWaypointClick: (waypoint: Waypoint) => void;
}

const MapVisualization = ({ flightPath, onWaypointClick }: MapVisualizationProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const heatLayerRef = useRef<any>(null);
  const isInitialized = useRef(false);

  // Initialize map once
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Create map
    map.current = L.map(mapContainer.current).setView([34.0911, 74.8697], 14);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map.current);

    isInitialized.current = true;
    toast.success('Map loaded successfully!');

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        isInitialized.current = false;
      }
    };
  }, []);

  // Update map content when flight path changes
  useEffect(() => {
    if (!map.current || !isInitialized.current) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Remove existing polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Remove existing heat layer
    if (heatLayerRef.current) {
      map.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    // Add waypoint markers
    flightPath.waypoints.forEach((waypoint, index) => {
      const color = getTrashColor(waypoint.trashScore);
      
      // Create custom divIcon
      const icon = L.divIcon({
        className: 'custom-waypoint-marker',
        html: `
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background-color: ${color};
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 12px;
            color: white;
            cursor: pointer;
            transition: transform 0.2s;
          ">${index + 1}</div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([waypoint.lat, waypoint.lng], { icon })
        .addTo(map.current!)
        .on('click', () => {
          onWaypointClick(waypoint);
        })
        .on('mouseover', function(this: L.Marker) {
          const el = this.getElement();
          if (el) {
            const div = el.querySelector('div');
            if (div) div.style.transform = 'scale(1.2)';
          }
        })
        .on('mouseout', function(this: L.Marker) {
          const el = this.getElement();
          if (el) {
            const div = el.querySelector('div');
            if (div) div.style.transform = 'scale(1)';
          }
        });

      markersRef.current.push(marker);
    });

    // Add flight path polyline
    const pathCoordinates = flightPath.waypoints.map(
      wp => [wp.lat, wp.lng] as [number, number]
    );
    
    polylineRef.current = L.polyline(pathCoordinates, {
      color: 'hsl(188, 94%, 45%)',
      weight: 3,
      opacity: 0.8,
    }).addTo(map.current);

    // Add heatmap layer
    const heatData = flightPath.waypoints.map(wp => [
      wp.lat,
      wp.lng,
      wp.trashScore / 100, // Normalize to 0-1
    ]);

    // @ts-ignore - leaflet.heat types
    heatLayerRef.current = L.heatLayer(heatData, {
      radius: 40,
      blur: 30,
      maxZoom: 17,
      max: 1.0,
      gradient: {
        0.0: '#21669C',
        0.2: '#67A9CF',
        0.4: '#D1E5F0',
        0.6: '#FDDBC7',
        0.8: '#EF8A62',
        1.0: '#B2182B',
      },
    }).addTo(map.current);

    // Fit bounds to show all waypoints
    if (flightPath.waypoints.length > 0) {
      const bounds = L.latLngBounds(
        flightPath.waypoints.map(wp => [wp.lat, wp.lng] as [number, number])
      );
      map.current.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [flightPath, onWaypointClick]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-glow">
      <div ref={mapContainer} className="absolute inset-0" />
    </div>
  );
};

export default MapVisualization;
