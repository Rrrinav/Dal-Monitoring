import { FlightPath } from '@/types/drone';
import { Card } from '@/components/ui/card';
import { TrendingUp, MapPin, AlertTriangle, Calendar } from 'lucide-react';

interface StatsPanelProps {
  flightPath: FlightPath;
}

const StatsPanel = ({ flightPath }: StatsPanelProps) => {
  const avgScore = Math.round(
    flightPath.waypoints.reduce((sum, wp) => sum + wp.trashScore, 0) / flightPath.waypoints.length
  );
  
  const maxScore = Math.max(...flightPath.waypoints.map(wp => wp.trashScore));
  const criticalPoints = flightPath.waypoints.filter(wp => wp.trashScore >= 75).length;

  const stats = [
    {
      label: 'Waypoints',
      value: flightPath.waypoints.length,
      icon: MapPin,
      color: 'text-secondary',
    },
    {
      label: 'Avg. Trash Score',
      value: avgScore,
      icon: TrendingUp,
      color: 'text-heat-medium',
    },
    {
      label: 'Max Score',
      value: maxScore,
      icon: AlertTriangle,
      color: 'text-heat-critical',
    },
    {
      label: 'Critical Areas',
      value: criticalPoints,
      icon: AlertTriangle,
      color: 'text-heat-high',
    },
  ];

  return (
    <Card className="p-6 backdrop-blur-sm bg-gradient-card border-border/50">
      <div className="flex items-center gap-2 mb-6">
        <Calendar className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">
          Flight Statistics
        </h2>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Icon className={`w-4 h-4 ${stat.color}`} />
                <span>{stat.label}</span>
              </div>
              <div className={`text-3xl font-bold ${stat.color}`}>
                {stat.value}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-6 border-t border-border">
        <h3 className="text-sm font-medium text-foreground mb-3">Heat Scale</h3>
        <div className="space-y-2">
          {[
            { label: 'Low', color: 'bg-heat-low', range: '0-25' },
            { label: 'Medium', color: 'bg-heat-medium', range: '25-50' },
            { label: 'High', color: 'bg-heat-high', range: '50-75' },
            { label: 'Critical', color: 'bg-heat-critical', range: '75-100' },
          ].map((level) => (
            <div key={level.label} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded ${level.color}`} />
                <span className="text-foreground">{level.label}</span>
              </div>
              <span className="text-muted-foreground">{level.range}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

export default StatsPanel;
