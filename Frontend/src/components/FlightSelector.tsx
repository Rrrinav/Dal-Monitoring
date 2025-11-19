import { FlightPath } from '@/types/drone';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface FlightSelectorProps {
  flightPaths: FlightPath[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

const FlightSelector = ({ flightPaths, currentIndex, onSelect }: FlightSelectorProps) => {
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < flightPaths.length - 1;

  return (
    <div className="flex items-center gap-3 p-4 backdrop-blur-sm bg-gradient-card rounded-xl border border-border/50">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onSelect(currentIndex - 1)}
        disabled={!canGoPrevious}
        className="h-10 w-10"
      >
        <ChevronLeft className="w-5 h-5" />
      </Button>

      <div className="flex items-center gap-2 px-4">
        <Calendar className="w-5 h-5 text-primary" />
        <div className="text-center">
          <div className="text-sm font-medium text-foreground">
            {new Date(flightPaths[currentIndex].date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            Flight {currentIndex + 1} of {flightPaths.length}
          </div>
        </div>
      </div>

      <Button
        variant="outline"
        size="icon"
        onClick={() => onSelect(currentIndex + 1)}
        disabled={!canGoNext}
        className="h-10 w-10"
      >
        <ChevronRight className="w-5 h-5" />
      </Button>
    </div>
  );
};

export default FlightSelector;
