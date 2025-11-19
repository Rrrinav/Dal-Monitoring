import { Waypoint, getTrashColor, getTrashLabel } from '@/types/drone';
import { Card } from '@/components/ui/card';
import { X, MapPin, Clock } from 'lucide-react';

interface WaypointDetailsProps {
  waypoint: Waypoint | null;
  onClose: () => void;
}

const WaypointDetails = ({ waypoint, onClose }: WaypointDetailsProps) => {
  if (!waypoint) return null;

  return (
    <Card className="p-6 backdrop-blur-sm bg-gradient-card border-border/50 animate-in slide-in-from-right">
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Waypoint Details</h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-muted rounded-lg transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="aspect-video rounded-lg bg-muted overflow-hidden">
          {waypoint.imageUrl ? (
            <img
              src={waypoint.imageUrl}
              alt="Waypoint"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              No image available
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-background/50 rounded-lg">
            <span className="text-sm text-muted-foreground">Trash Score</span>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: getTrashColor(waypoint.trashScore) }}
              />
              <span className="font-bold text-foreground">{waypoint.trashScore}</span>
              <span className="text-sm text-muted-foreground">
                ({getTrashLabel(waypoint.trashScore)})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-background/50 rounded-lg">
            <MapPin className="w-4 h-4 text-primary" />
            <div className="flex-1 text-sm">
              <div className="text-foreground font-medium">Coordinates</div>
              <div className="text-muted-foreground font-mono">
                {waypoint.lat.toFixed(6)}, {waypoint.lng.toFixed(6)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-background/50 rounded-lg">
            <Clock className="w-4 h-4 text-primary" />
            <div className="flex-1 text-sm">
              <div className="text-foreground font-medium">Timestamp</div>
              <div className="text-muted-foreground">{waypoint.timestamp}</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default WaypointDetails;
