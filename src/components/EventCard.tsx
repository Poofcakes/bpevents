
"use client";

import { GameEvent } from '@/lib/events';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Countdown from './Countdown';
import { Swords, Star, Timer } from 'lucide-react';
import { getGameTime } from '@/lib/time';

interface EventCardProps {
  event: GameEvent;
  nextOccurrence: Date | null;
  currentTime: Date;
}

const EventIcon = ({ type }: { type: GameEvent['type'] }) => {
  const commonClass = "h-5 w-5 mr-2";
  if (type === 'World Boss') {
    return <Swords className={`${commonClass} text-destructive`} />;
  }
  if (type === 'Special Event') {
    return <Star className={`${commonClass} text-yellow-400`} />;
  }
  return null;
};


export default function EventCard({ event, nextOccurrence, currentTime }: EventCardProps) {
  if (!nextOccurrence) return null;

  const timeDifference = nextOccurrence.getTime() - getGameTime(currentTime).getTime();
  
  let durationMinutes = 0;
  if (event.durationMinutes) {
    durationMinutes = event.durationMinutes;
  } else if (event.schedule.type === 'daily-intervals') {
    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
    const nextInterval = event.schedule.intervals.find(interval => {
        const start = new Date(nextOccurrence);
        start.setUTCHours(interval.start.hour + 2, interval.start.minute, 0, 0); // Convert UTC-2 to UTC
        return start.getTime() === nextOccurrence.getTime();
    });
    if (nextInterval) {
        const start = new Date();
        start.setUTCHours(nextInterval.start.hour + 2, nextInterval.start.minute, 0, 0); // Convert UTC-2 to UTC
        const end = new Date();
        end.setUTCHours(nextInterval.end.hour + 2, nextInterval.end.minute, 0, 0); // Convert UTC-2 to UTC
        if (end < start) { // interval crosses midnight
          end.setDate(end.getDate() + 1);
        }
        durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60);
    }
  }

  const isActive = timeDifference < 0 && durationMinutes > 0 && timeDifference > -durationMinutes * 60 * 1000;
  const isPast = timeDifference < 0 && !isActive;

  return (
    <Card className={`transition-all duration-300 ${isActive ? 'ring-2 ring-foreground/90 shadow-lg shadow-foreground/20' : ''} ${isPast ? 'opacity-50 bg-card/50' : ''}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium flex items-center">
          <EventIcon type={event.type} />
          {event.name}
        </CardTitle>
        <Badge variant={event.type === 'World Boss' ? 'destructive' : 'secondary'} className="capitalize">
          {event.type}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <p className="text-sm text-muted-foreground">{event.description}</p>
            <div className="flex items-center gap-2 text-lg md:text-xl font-mono font-bold p-2 rounded-md bg-secondary/50 min-w-[150px] justify-center">
                <Timer className="h-6 w-6 text-accent"/>
                <Countdown targetDate={nextOccurrence} durationMinutes={durationMinutes > 0 ? durationMinutes : undefined} />
            </div>
        </div>
      </CardContent>
    </Card>
  );
}

    