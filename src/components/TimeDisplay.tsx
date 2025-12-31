
"use client";

import { useState, useEffect } from 'react';
import { Clock, Globe, Calendar, Search, Check } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { getGameTime } from '@/lib/time';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { TimeDisplayMode, TimeFormat } from '@/app/page';
import { cn } from '@/lib/utils';

interface TimeDisplayProps {
    timeMode: TimeDisplayMode;
    setTimeMode: (mode: TimeDisplayMode) => void;
    timeFormat: TimeFormat;
    setTimeFormat: (format: TimeFormat) => void;
}

const TimeDisplay = ({ timeMode, setTimeMode, timeFormat, setTimeFormat }: TimeDisplayProps) => {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [selectedTimezone, setSelectedTimezone] = useState<string>('');
  const [timezones, setTimezones] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');
  const [isTimezoneOpen, setIsTimezoneOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isClient) {
        setSelectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        try {
        if (typeof Intl.supportedValuesOf === 'function') {
            setTimezones(Intl.supportedValuesOf('timeZone'));
        }
        } catch (e) {
        console.error("Timezones not supported", e);
        }
    }
  }, [isClient]);

  const gameTime = currentTime ? getGameTime(currentTime) : null;

  const formatTime = (date: Date | null, timeZone: string | undefined) => {
    if (!date || !timeZone || !isClient) return '--:--:--';
    return date.toLocaleTimeString('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: timeFormat === '12h',
    });
  };
  
  const formatDate = (date: Date | null, timeZone: string | undefined) => {
    if (!date || !timeZone || !isClient) return 'Loading...';
    return date.toLocaleDateString(undefined, {
      timeZone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  const handleTimeModeSwitchChange = (checked: boolean) => {
    setTimeMode(checked ? 'local' : 'game');
  };

  const handleTimeFormatSwitchChange = (checked: boolean) => {
    setTimeFormat(checked ? '12h' : '24h');
  };

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm md:text-base">
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-secondary/50">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-accent flex-shrink-0" />
              <div className="flex flex-col text-right min-w-[140px] sm:min-w-[180px]">
                  <span className="font-semibold text-foreground">
                      {formatDate(currentTime, selectedTimezone)}
                  </span>
              </div>
          </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-secondary/50 cursor-help">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-accent flex-shrink-0" />
              <div className="flex flex-col text-right min-w-[70px] sm:min-w-[85px]">
                <span className="font-semibold text-foreground font-mono">
                  {formatTime(currentTime, selectedTimezone)}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Your Time</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-secondary/50 cursor-help">
              <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-accent flex-shrink-0" />
              <div className="flex flex-col text-right min-w-[70px] sm:min-w-[85px]">
                <span className="font-semibold text-foreground font-mono">
                  {gameTime ? gameTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: timeFormat === '12h' }) : '--:--:--'}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Game Time (UTC-2)</p>
          </TooltipContent>
        </Tooltip>
      <div className="flex items-center space-x-1 sm:space-x-2">
        <Label htmlFor="time-mode-switch" className="text-[10px] sm:text-xs text-muted-foreground">Game</Label>
        <Switch 
          id="time-mode-switch" 
          checked={timeMode === 'local'}
          onCheckedChange={handleTimeModeSwitchChange}
          aria-label="Toggle time display mode"
          className="scale-75 sm:scale-100"
        />
        <Label htmlFor="time-mode-switch" className="text-[10px] sm:text-xs">Local</Label>
      </div>
       <div className="flex items-center space-x-1 sm:space-x-2">
        <Label htmlFor="time-format-switch" className="text-[10px] sm:text-xs text-muted-foreground">24h</Label>
        <Switch 
          id="time-format-switch" 
          checked={timeFormat === '12h'}
          onCheckedChange={handleTimeFormatSwitchChange}
          aria-label="Toggle time format"
          className="scale-75 sm:scale-100"
        />
        <Label htmlFor="time-format-switch" className="text-[10px] sm:text-xs">AM/PM</Label>
      </div>
       {isClient && timezones.length > 0 && timeMode === 'local' ? (
        <Popover open={isTimezoneOpen} onOpenChange={setIsTimezoneOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-8 sm:h-10 text-xs sm:text-sm px-2 sm:px-3 max-w-[80px] sm:max-w-[120px] md:max-w-[150px] justify-between truncate"
            >
              <span className="truncate">{selectedTimezone || 'Timezone'}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] sm:w-[350px] p-0" align="start">
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder="Search timezone..."
                value={timezoneSearch}
                onChange={(e) => setTimezoneSearch(e.target.value)}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-9"
              />
            </div>
            <div className="max-h-[300px] overflow-auto">
              {timezones
                .filter((tz) =>
                  tz.toLowerCase().includes(timezoneSearch.toLowerCase())
                )
                .map((tz) => (
                  <button
                    key={tz}
                    onClick={() => {
                      setSelectedTimezone(tz);
                      setIsTimezoneOpen(false);
                      setTimezoneSearch('');
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      selectedTimezone === tz && "bg-accent text-accent-foreground"
                    )}
                  >
                    <span>{tz}</span>
                    {selectedTimezone === tz && (
                      <Check className="h-4 w-4" />
                    )}
                  </button>
                ))}
            </div>
          </PopoverContent>
        </Popover>
       ) : null}
      </div>
    </TooltipProvider>
  );
};

export default TimeDisplay;

    