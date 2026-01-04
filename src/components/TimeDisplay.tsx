
"use client";

import { useState, useEffect, useMemo } from 'react';
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
    selectedTimezone: string;
    setSelectedTimezone: (tz: string) => void;
}

const TimeDisplay = ({ timeMode, setTimeMode, timeFormat, setTimeFormat, selectedTimezone, setSelectedTimezone }: TimeDisplayProps) => {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
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
        // Only set default timezone if not already set
        if (!selectedTimezone) {
            setSelectedTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        }
        try {
        if (typeof Intl.supportedValuesOf === 'function') {
            const standardTimezones = Intl.supportedValuesOf('timeZone');
            // Add Etc/GMT timezones (UTC-12 to UTC+14)
            // Note: IANA uses inverted signs for Etc/GMT timezones:
            // Etc/GMT+2 means UTC-2 (2 hours behind UTC)
            // Etc/GMT-2 means UTC+2 (2 hours ahead of UTC)
            const etcTimezones: string[] = [];
            for (let i = -12; i <= 14; i++) {
                // For UTC offset i, IANA uses the opposite sign
                // UTC-2 -> Etc/GMT+2, UTC+2 -> Etc/GMT-2
                const sign = i >= 0 ? '+' : '';
                etcTimezones.push(`Etc/GMT${sign}${i}`);
            }
            // Combine and sort: Etc timezones first, then standard timezones
            const allTimezones = [...etcTimezones, ...standardTimezones].sort((a, b) => {
                // Sort Etc timezones first
                const aIsEtc = a.startsWith('Etc/');
                const bIsEtc = b.startsWith('Etc/');
                if (aIsEtc && !bIsEtc) return -1;
                if (!aIsEtc && bIsEtc) return 1;
                // Within each group, sort alphabetically
                return a.localeCompare(b);
            });
            setTimezones(allTimezones);
        }
        } catch (e) {
        console.error("Timezones not supported", e);
        }
    }
  }, [isClient, selectedTimezone, setSelectedTimezone]);

  const gameTime = currentTime ? getGameTime(currentTime) : null;

  // Check if game time and "your time" are on different dates
  const dateInfo = useMemo(() => {
    if (!currentTime || !isClient || !gameTime) return { gameDate: null, yourDate: null, areDifferent: false };
    
    // "Your time" timezone: system time when game mode, selectedTimezone when local mode
    const yourTz = timeMode === 'game' ? Intl.DateTimeFormat().resolvedOptions().timeZone : (selectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Get date strings for comparison
    const gameDateStr = gameTime.toLocaleDateString('en-US', { timeZone: 'Etc/GMT+2' });
    const yourDateStr = currentTime.toLocaleDateString('en-US', { timeZone: yourTz });
    
    // Get formatted dates for display
    const gameDateFormatted = gameTime.toLocaleDateString(undefined, {
      timeZone: 'Etc/GMT+2',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const yourDateFormatted = currentTime.toLocaleDateString(undefined, {
      timeZone: yourTz,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    return {
      gameDate: gameDateFormatted,
      yourDate: yourDateFormatted,
      areDifferent: gameDateStr !== yourDateStr
    };
  }, [currentTime, isClient, gameTime, timeMode, selectedTimezone]);

  const formatTime = (date: Date | null, timeZone: string | undefined, useSystemTime: boolean = false) => {
    if (!date || !isClient) return '--:--:--';
    const tz = useSystemTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone;
    if (!tz) return '--:--:--';
    return date.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: timeFormat === '12h',
    });
  };
  
  const formatDate = (date: Date | null, timeZone: string | undefined, useSystemTime: boolean = false) => {
    if (!date || !isClient) return 'Loading...';
    const tz = useSystemTime ? Intl.DateTimeFormat().resolvedOptions().timeZone : timeZone;
    if (!tz) return 'Loading...';
    return date.toLocaleDateString(undefined, {
      timeZone: tz,
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

  // Calculate time difference between selected timezone and game time (UTC-2)
  const getTimeDifference = useMemo(() => {
    if (!currentTime || !isClient) return null;
    
    // Get the timezone to compare (selected timezone if local mode, system timezone if game mode)
    const compareTz = timeMode === 'local' && selectedTimezone ? selectedTimezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Game time is UTC-2 (fixed offset)
    const gameTimeOffsetHours = -2;
    
    // Calculate the UTC offset of the compare timezone
    // Use the current UTC time and format it in the compare timezone
    const utcNow = new Date(currentTime.getTime());
    
    // Create a formatter that includes timeZoneName to get the offset
    // We'll calculate offset by comparing UTC time to local time in the timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: compareTz,
      timeZoneName: 'longOffset'
    });
    
    // Get the offset string (e.g., "GMT+14:00" or "GMT-09:00")
    const parts = formatter.formatToParts(utcNow);
    const offsetPart = parts.find(p => p.type === 'timeZoneName');
    
    if (offsetPart) {
      // Parse the offset (e.g., "GMT+14:00" -> 14, "GMT-09:00" -> -9)
      const offsetMatch = offsetPart.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
      if (offsetMatch) {
        const sign = offsetMatch[1] === '+' ? 1 : -1;
        const hours = parseInt(offsetMatch[2] || '0');
        const minutes = parseInt(offsetMatch[3] || '0');
        const compareOffsetHours = sign * (hours + minutes / 60);
        
        // Calculate the difference
        const diffHours = compareOffsetHours - gameTimeOffsetHours;
        
        if (Math.abs(diffHours) < 0.5) return null; // Less than 30 minutes difference
        
        return Math.round(diffHours);
      }
    }
    
    // Fallback: calculate offset by comparing formatted times
    // Format the same UTC moment in both timezones with full date/time
    const gameFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Etc/GMT+2',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const compareFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: compareTz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    
    const gameStr = gameFormatter.format(utcNow);
    const compareStr = compareFormatter.format(utcNow);
    
    // Parse the formatted strings (format: "MM/DD/YYYY, HH:mm")
    const gameMatch = gameStr.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/);
    const compareMatch = compareStr.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2})/);
    
    if (gameMatch && compareMatch) {
      const gameDate = new Date(Date.UTC(
        parseInt(gameMatch[3]),
        parseInt(gameMatch[1]) - 1,
        parseInt(gameMatch[2]),
        parseInt(gameMatch[4]),
        parseInt(gameMatch[5])
      ));
      const compareDate = new Date(Date.UTC(
        parseInt(compareMatch[3]),
        parseInt(compareMatch[1]) - 1,
        parseInt(compareMatch[2]),
        parseInt(compareMatch[4]),
        parseInt(compareMatch[5])
      ));
      
      // The difference in milliseconds represents the timezone offset difference
      const diffMs = compareDate.getTime() - gameDate.getTime();
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));
      
      if (Math.abs(diffHours) < 0.5) return null;
      
      return diffHours;
    }
    
    return null;
  }, [currentTime, isClient, timeMode, selectedTimezone]);

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm md:text-base">
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-secondary/50">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-accent flex-shrink-0" />
              <div className="flex flex-col text-right min-w-[140px] sm:min-w-[180px]">
                  {dateInfo.areDifferent ? (
                      <>
                          <span className="font-semibold text-foreground">
                              Your Time: {dateInfo.yourDate}
                          </span>
                          <span className="text-xs text-muted-foreground">
                              Game Time: {dateInfo.gameDate}
                          </span>
                      </>
                  ) : (
                      <span className="font-semibold text-foreground">
                          {formatDate(currentTime, selectedTimezone, timeMode === 'game')}
                      </span>
                  )}
              </div>
          </div>
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-lg bg-secondary/50 cursor-help">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-accent flex-shrink-0" />
              <div className="flex flex-col text-right min-w-[70px] sm:min-w-[85px]">
                <span className="font-semibold text-foreground font-mono">
                  {formatTime(currentTime, selectedTimezone, timeMode === 'game')}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Your Time</p>
            {getTimeDifference !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                {getTimeDifference > 0 
                  ? `${getTimeDifference} hour${getTimeDifference !== 1 ? 's' : ''} ahead of game time`
                  : `${Math.abs(getTimeDifference)} hour${Math.abs(getTimeDifference) !== 1 ? 's' : ''} behind game time`}
              </p>
            )}
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
              <span className="truncate">
                {selectedTimezone ? (
                  selectedTimezone.startsWith('Etc/GMT') ? (() => {
                    const match = selectedTimezone.match(/Etc\/GMT([+-])(\d+)/);
                    if (match) {
                      const sign = match[1];
                      const num = parseInt(match[2]);
                      const actualOffset = sign === '+' ? -num : num;
                      const offsetStr = actualOffset >= 0 ? `+${actualOffset}` : `${actualOffset}`;
                      return `UTC ${offsetStr}`;
                    }
                    return selectedTimezone;
                  })() : selectedTimezone.replace(/_/g, ' ')
                ) : 'Timezone'}
              </span>
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
                .filter((tz) => {
                  const searchLower = timezoneSearch.toLowerCase();
                  const tzLower = tz.toLowerCase();
                  // Search in both the original timezone ID and the display name (with spaces)
                  const displayName = tz.startsWith('Etc/GMT') 
                    ? (() => {
                        const match = tz.match(/Etc\/GMT([+-])(\d+)/);
                        if (match) {
                          const sign = match[1];
                          const num = parseInt(match[2]);
                          const actualOffset = sign === '+' ? -num : num;
                          const offsetStr = actualOffset >= 0 ? `+${actualOffset}` : `${actualOffset}`;
                          return `UTC ${offsetStr}`;
                        }
                        return tz;
                      })()
                    : tz.replace(/_/g, ' ');
                  return tzLower.includes(searchLower) || displayName.toLowerCase().includes(searchLower);
                })
                .map((tz) => {
                  // For Etc/GMT timezones, show as "UTC +X" or "UTC -X"
                  // IANA uses inverted signs: Etc/GMT+2 means UTC-2
                  let displayName = tz;
                  if (tz.startsWith('Etc/GMT')) {
                    const match = tz.match(/Etc\/GMT([+-])(\d+)/);
                    if (match) {
                      const sign = match[1];
                      const num = parseInt(match[2]);
                      // IANA uses inverted signs, so invert for display
                      const actualOffset = sign === '+' ? -num : num;
                      const offsetStr = actualOffset >= 0 ? `+${actualOffset}` : `${actualOffset}`;
                      displayName = `UTC ${offsetStr}`;
                    }
                  } else {
                    // Replace underscores with spaces for readability
                    displayName = tz.replace(/_/g, ' ');
                  }
                  return (
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
                      <span>{displayName}</span>
                      {selectedTimezone === tz && (
                        <Check className="h-4 w-4" />
                      )}
                    </button>
                  );
                })}
            </div>
          </PopoverContent>
        </Popover>
       ) : null}
      </div>
    </TooltipProvider>
  );
};

export default TimeDisplay;

    