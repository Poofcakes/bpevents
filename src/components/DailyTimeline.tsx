

"use client";

import { useState, useEffect, useMemo, useRef, Fragment, memo } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { getGameTime, toLocalTime, formatDuration, getGameDate, DAILY_RESET_HOUR_UTC, getWeekPeriod, GAME_TIMEZONE_OFFSET, BIWEEKLY_REFERENCE_RESET } from '@/lib/time';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Star, Swords, Crown, Gamepad2, Users, Footprints, ShieldAlert, HeartHandshake, ShieldCheck, KeySquare, BrainCircuit, RotateCcw, PiggyBank, UtensilsCrossed, Gift, CalendarHeart, Ghost, Target, RefreshCw, CalendarDays, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimeDisplayMode, TimeFormat } from '@/app/page';
import { format, differenceInDays } from 'date-fns';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { useDailyCompletions } from '@/hooks/useDailyCompletions';
import { Checkbox } from './ui/checkbox';
import { Switch } from './ui/switch';
import { Label } from './ui/label';

const checkDateInRange = (event: GameEvent, date: Date) => {
    // Check availability for permanent events
    if (event.availability) {
        const { added, removed } = event.availability;
        if (added) {
            const addedDate = new Date(added + 'T00:00:00Z');
            addedDate.setUTCHours(0, 0, 0, 0);
            if (date < addedDate) return false;
        }
        if (removed) {
            const removedDate = new Date(removed + 'T00:00:00Z');
            removedDate.setUTCHours(23, 59, 59, 999);
            if (date > removedDate) return false;
        }
        return true; // Permanent event is available if it passes added/removed checks
    }

    // Check dateRange/dateRanges for time-limited events
    // Events without specific times default to 5 AM game time (7 AM UTC) for start/end
    const checkSingleRange = (range: { start: string; end: string }) => {
        const startDate = new Date(range.start + 'T00:00:00Z');
        // Default to 5 AM game time (7 AM UTC) if event has no specific schedule
        if (event.schedule.type === 'none') {
            startDate.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC
        } else {
            startDate.setUTCHours(0, 0, 0, 0);
        }
        
        if (date < startDate) return false;

        const endDate = new Date(range.end + 'T00:00:00Z');
        // Events without specific times end at 5 AM game time (7 AM UTC) on the day after the end date
        if (event.schedule.type === 'none') {
            endDate.setUTCDate(endDate.getUTCDate() + 1);
            endDate.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC on the next day
        } else {
            endDate.setUTCHours(23, 59, 59, 999);
        }
        return date < endDate; // Use < instead of <= since end is exclusive at 5 AM
    }

    if (event.dateRanges) {
        return event.dateRanges.some(range => checkSingleRange(range));
    }
    if (event.dateRange) {
        return checkSingleRange(event.dateRange);
    }
    return true; // No date range or availability specified - assume always available
}


const getDayOccurrences = (event: GameEvent, dayDate: Date): {start: Date, end?: Date}[] => {
    const { schedule } = event;
    const occurrences: {start: Date, end?: Date}[] = [];
    
    // The dayDate parameter should already be set to the game day start (5 AM UTC-2 = 7 AM UTC)
    const dayStart = new Date(dayDate);
    // Don't adjust the hours - dayDate is already at the correct starting point
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    if (!checkDateInRange(event, dayStart)) return [];

    if (event.biWeeklyRotation) {
      const period = getWeekPeriod(dayStart);
      if (period !== event.biWeeklyRotation) {
        return [];
      }
    }

    // Check occurrences for the current calendar day and the next one, then filter by day range
    for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
        const currentCalendarDate = new Date(dayStart);
        currentCalendarDate.setUTCDate(currentCalendarDate.getUTCDate() + dayOffset);
        
        switch (schedule.type) {
            case 'hourly':
                for (let i = 0; i < 24; i++) {
                    const start = new Date(currentCalendarDate);
                    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                    start.setUTCHours(i + 2, schedule.minute);
                    const end = event.durationMinutes ? new Date(start.getTime() + event.durationMinutes * 60 * 1000) : undefined;
                    occurrences.push({ start, end });
                }
                break;
            case 'multi-hourly':
                for (let i = 0; i < 24; i += schedule.hours) {
                    const start = new Date(currentCalendarDate);
                    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                    start.setUTCHours(i + (schedule.offsetHours || 0) + 2, schedule.minute);
                    const end = event.durationMinutes ? new Date(start.getTime() + event.durationMinutes * 60 * 1000) : undefined;
                    occurrences.push({ start, end });
                }
                break;
            case 'daily-specific':
                if (schedule.days.includes(currentCalendarDate.getUTCDay())) {
                    schedule.times.forEach(time => {
                        const start = new Date(currentCalendarDate);
                        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                        start.setUTCHours(time.hour + 2, time.minute);
                        const end = event.durationMinutes ? new Date(start.getTime() + event.durationMinutes * 60 * 1000) : undefined;
                        occurrences.push({ start, end });
                    });
                }
                break;
            case 'daily-intervals':
                 schedule.intervals.forEach(interval => {
                    const start = new Date(currentCalendarDate);
                    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                    start.setUTCHours(interval.start.hour + 2, interval.start.minute);
                    
                    const end = new Date(currentCalendarDate);
                    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                    end.setUTCHours(interval.end.hour + 2, interval.end.minute);
                    
                    if (end < start) { // interval crosses midnight
                         end.setUTCDate(end.getUTCDate() + 1);
                    }
                    occurrences.push({ start, end });
                });
                break;
            case 'daily-intervals-specific':
                if (schedule.days.includes(currentCalendarDate.getUTCDay())) {
                    schedule.intervals.forEach(interval => {
                        const start = new Date(currentCalendarDate);
                        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                        start.setUTCHours(interval.start.hour + 2, interval.start.minute);
                        
                        const end = new Date(currentCalendarDate);
                        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
                        end.setUTCHours(interval.end.hour + 2, interval.end.minute);
                        
                        if (end < start) { // interval crosses midnight
                            end.setUTCDate(end.getUTCDate() + 1);
                        }
                        occurrences.push({ start, end });
                    });
                }
                break;
            case 'none':
                break;
        }
    }
    
    // Filter occurrences to be within the day window
    const uniqueOccurrences = occurrences.filter((occ, index, self) => 
        occ.start >= dayStart && occ.start < dayEnd &&
        index === self.findIndex(o => o.start.getTime() === occ.start.getTime())
    );

    return uniqueOccurrences;
}

const PIXELS_PER_MINUTE = 2;
const PIXELS_PER_HOUR = PIXELS_PER_MINUTE * 60;
const TOTAL_WIDTH = PIXELS_PER_HOUR * 24;

const minutesToPixels = (minutes: number) => minutes * PIXELS_PER_MINUTE;


export const CategoryIcons: Record<GameEvent['category'], React.ElementType> = {
    'Boss': Swords,
    'World Boss Crusade': Crown,
    'Event': Star,
    'Hunting': Target,
    'Social': HeartHandshake,
    'Mini-game': Gamepad2,
    'Patrol': Footprints,
    'Guild': Users,
    'Buff': ShieldCheck,
    'Dungeon Unlock': KeySquare,
    'Raid Unlock': ShieldAlert,
    'Roguelike': BrainCircuit,
};

const CategoryColors: Record<GameEvent['category'], string> = {
    'Boss': 'border-destructive bg-destructive/20 text-destructive-foreground',
    'World Boss Crusade': 'border-amber-400 bg-amber-400/20 text-amber-500',
    'Event': 'border-purple-400 bg-purple-400/20 text-purple-500',
    'Hunting': 'border-red-500 bg-red-500/20 text-red-500',
    'Social': 'border-sky-400 bg-sky-400/20 text-sky-500',
    'Mini-game': 'border-lime-400 bg-lime-400/20 text-lime-500',
    'Patrol': 'border-neutral-400 bg-neutral-400/20 text-neutral-400',
    'Guild': 'border-purple-400 bg-purple-400/20 text-purple-500',
    'Buff': 'border-emerald-400 bg-emerald-400/20 text-emerald-500',
    'Dungeon Unlock': 'border-cyan-400 bg-cyan-400/20 text-cyan-500',
    'Raid Unlock': 'border-teal-400 bg-teal-400/20 text-teal-500',
    'Roguelike': 'border-yellow-400 bg-yellow-400/20 text-yellow-500',
};

const SeasonalCategoryIcons: Record<NonNullable<GameEvent['seasonalCategory']>, React.ElementType> = {
    'Kanamia Harvest Festival': UtensilsCrossed,
    'Halloween': Ghost,
    'Winter Fest': Gift,
    'Silverstar Carnival': CalendarHeart,
};


// Memoized tooltip content to avoid rerenders - but includes live time info
const EventTooltipContent = memo(({ event, occurrence, timeMode, timeFormat, isToday, effectiveEndDate }: { 
    event: GameEvent; 
    occurrence: {start: Date, end?: Date}; 
    timeMode: TimeDisplayMode; 
    timeFormat: TimeFormat;
    isToday: boolean;
    effectiveEndDate: Date;
}) => {
    const [now, setNow] = useState<Date | null>(null);
    
    useEffect(() => {
        if (!isToday) {
            setNow(null);
            return;
        }
        setNow(new Date());
        const timerId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timerId);
    }, [isToday]);
    
    const dateFormat = 'MMM d, yyyy';
    
    // For game time mode: display in UTC-2 (subtract 2 hours from UTC)
    // For local time mode: display in user's local timezone
    let displayStart: Date;
    let displayEnd: Date | null;
    let displayEffectiveEnd: Date;
    
    if (timeMode === 'game') {
        // Convert UTC to UTC-2 by subtracting 2 hours
        displayStart = new Date(occurrence.start.getTime() - (2 * 60 * 60 * 1000));
        displayEnd = occurrence.end ? new Date(occurrence.end.getTime() - (2 * 60 * 60 * 1000)) : null;
        displayEffectiveEnd = new Date(effectiveEndDate.getTime() - (2 * 60 * 60 * 1000));
    } else {
        // Local time mode: occurrence.start is stored in UTC, browser will display in local timezone
        displayStart = new Date(occurrence.start);
        displayEnd = occurrence.end ? new Date(occurrence.end) : null;
        displayEffectiveEnd = new Date(effectiveEndDate);
    }
    
    const timeOptions: Intl.DateTimeFormatOptions = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: timeFormat === '12h',
        timeZone: timeMode === 'game' ? 'UTC' : undefined
    };
    
    // For game time mode, we need to display the UTC hours directly (since we've already subtracted 2 hours)
    // For local time mode, browser handles the conversion
    let startTimeStr: string;
    let endTimeStr: string | null = null;
    
    if (timeMode === 'game') {
        // displayStart already has 2 hours subtracted, so we format it as UTC to show the UTC hours directly
        startTimeStr = displayStart.toLocaleTimeString('en-US', timeOptions);
        endTimeStr = displayEnd ? displayEnd.toLocaleTimeString('en-US', timeOptions) : null;
    } else {
        startTimeStr = displayStart.toLocaleTimeString([], timeOptions);
        endTimeStr = displayEnd ? displayEnd.toLocaleTimeString([], timeOptions) : null;
    }
    
    // Check if this is an instant event (like boarlets - no duration)
    const isInstantEvent = !event.durationMinutes && (!occurrence.end || occurrence.end.getTime() === occurrence.start.getTime());
    
    // Calculate time until/remaining
    let timeInfo: string | null = null;
    if (isToday && now) {
        // occurrence.start and effectiveEndDate are stored in UTC
        // Compare UTC timestamps directly
        const nowTime = now.getTime();
        const startTime = occurrence.start.getTime();
        const endTime = effectiveEndDate.getTime();
        const timeUntilStart = startTime - nowTime;
        const timeUntilEnd = endTime - nowTime;
        
        if (isInstantEvent) {
            // Instant events (like boarlets)
            if (timeUntilStart > 0) {
                timeInfo = `Spawns in ${formatDuration(timeUntilStart)}`;
            } else {
                const timeAgo = nowTime - startTime;
                timeInfo = `Spawned ${formatDuration(timeAgo)} ago`;
            }
        } else {
            // Regular events with duration
            if (timeUntilStart > 0) {
                // Event hasn't started yet
                timeInfo = `Starts in ${formatDuration(timeUntilStart)}`;
            } else if (timeUntilEnd > 0) {
                // Event is active
                timeInfo = `Active! ${formatDuration(timeUntilEnd)} left`;
            } else {
                // Event has ended
                const timeAgo = nowTime - endTime;
                timeInfo = `Ended ${formatDuration(timeAgo)} ago`;
            }
        }
    }
    
    return (
        <div className="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg max-w-xs">
            <p className="font-bold">{event.name}</p>
            <p className="text-sm text-muted-foreground">
                {startTimeStr}{endTimeStr ? ` - ${endTimeStr}` : ''}
            </p>
            {timeInfo && (
                <p className={cn(
                    "text-sm font-medium mt-1",
                    timeInfo.includes('Active!') ? "text-green-400" : 
                    timeInfo.includes('ago') ? "text-muted-foreground" : 
                    "text-accent"
                )}>
                    {timeInfo}
                </p>
            )}
            {event.dateRange && (
                <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2">
                    <p>Runs from {format(new Date(event.dateRange.start + 'T00:00:00Z'), dateFormat)} until {format(new Date(event.dateRange.end + 'T00:00:00Z'), dateFormat)}</p>
                </div>
            )}
            {event.availability && (
                <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2">
                    {event.availability.added && !event.availability.removed && (
                        <p>Added to game on {format(new Date(event.availability.added + 'T00:00:00Z'), dateFormat)}</p>
                    )}
                    {event.availability.added && event.availability.removed && (
                        <p>Available from {format(new Date(event.availability.added + 'T00:00:00Z'), dateFormat)} until {format(new Date(event.availability.removed + 'T00:00:00Z'), dateFormat)}</p>
                    )}
                    {!event.availability.added && event.availability.removed && (
                        <p>Removed from game on {format(new Date(event.availability.removed + 'T00:00:00Z'), dateFormat)}</p>
                    )}
                </div>
            )}
            {event.dateRanges && (
                <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2 space-y-1">
                    <p>Active during these periods:</p>
                    {event.dateRanges.map((range, i) => (
                       <p key={i}>
                         {format(new Date(range.start + 'T00:00:00Z'), dateFormat)} - {format(new Date(range.end + 'T00:00:00Z'), dateFormat)}
                       </p>
                    ))}
                </div>
            )}
            <p className="text-xs italic text-muted-foreground max-w-xs">{event.description}</p>
        </div>
    );
});
EventTooltipContent.displayName = 'EventTooltipContent';

const TimelineEvent = memo(({ event, occurrence, timeMode, timeFormat, isToday, gameDayStart, isCompleted, onToggleCompletion }: { event: GameEvent, occurrence: {start: Date, end?: Date}, timeMode: TimeDisplayMode, timeFormat: TimeFormat, isToday: boolean, gameDayStart: Date, isCompleted: boolean, onToggleCompletion: () => void }) => {
    const [mounted, setMounted] = useState(false);
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    const localOccurrence = useMemo(() => ({
        start: toLocalTime(occurrence.start),
        end: occurrence.end ? toLocalTime(occurrence.end) : undefined
    }), [occurrence]);

    const displayOccurrence = timeMode === 'local' ? localOccurrence : occurrence;
    
    const startMinutesSinceGameDayStart = (occurrence.start.getTime() - gameDayStart.getTime()) / (1000 * 60);

    const left = minutesToPixels(startMinutesSinceGameDayStart);
    
    let width = 0;
    
    if (occurrence.end) {
        let durationMinutes = (occurrence.end.getTime() - occurrence.start.getTime()) / (1000 * 60);
        width = minutesToPixels(durationMinutes);
    } else if (event.durationMinutes) {
        width = minutesToPixels(event.durationMinutes);
    }

    let Icon = CategoryIcons[event.category] || Star;
    // Use specific icons for special events
    if (event.name === 'Lovely Boarlet' || event.name === 'Breezy Boarlet') {
        Icon = PiggyBank;
    } else if (event.name === 'Daily Reset') {
        Icon = RefreshCw;
    } else if (event.name === 'Weekly Reset') {
        Icon = CalendarDays;
    } else if (event.name === 'Stimens Reset') {
        Icon = Lock;
    }
    const timeZone = timeMode === 'game' ? 'UTC' : undefined;

    const effectiveEndDate = useMemo(() => {
        if (occurrence.end) return occurrence.end;
        if (event.durationMinutes) return new Date(occurrence.start.getTime() + event.durationMinutes * 60 * 1000);
        return occurrence.start;
    }, [occurrence, event.durationMinutes]);
    
    const displayEffectiveEndDate = timeMode === 'local' ? toLocalTime(effectiveEndDate) : effectiveEndDate;
    
    const [isPast, setIsPast] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        if (!isToday) {
            // For past days, compare UTC times directly
            const nowUTC = new Date();
            setIsPast(nowUTC.getTime() > effectiveEndDate.getTime());
            setIsActive(false);
            return;
        }

        const checkStatus = () => {
            const realNow = new Date();
            // occurrence.start and occurrence.end are stored in UTC
            // Compare UTC timestamps directly
            const nowTime = realNow.getTime();
            const startTime = occurrence.start.getTime();
            const endTime = effectiveEndDate.getTime();
            setIsActive(nowTime >= startTime && nowTime < endTime);
            setIsPast(nowTime > endTime);
        };

        checkStatus();
        const timerId = setInterval(checkStatus, 10000); // Only check every 10s is fine
        return () => clearInterval(timerId);

    }, [isToday, occurrence.start, effectiveEndDate]);

    useEffect(() => {
        if (!isHovered) return;

        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isHovered]);

    const timeOptions: Intl.DateTimeFormatOptions = {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: timeFormat === '12h'
    };

    const dateFormat = 'MMM d, yyyy';
    
    let colorClass = CategoryColors[event.category] || 'bg-secondary';
    let lineColor = 'bg-destructive';

    if (event.name === 'Lovely Boarlet') {
        colorClass = 'border-pink-400 bg-pink-400/20 text-pink-300';
        lineColor = 'bg-pink-400';
    } else if (event.name === 'Breezy Boarlet') {
        colorClass = 'border-green-400 bg-green-400/20 text-green-300';
        lineColor = 'bg-green-400';
    }

    // Calculate tooltip position relative to mouse - smart positioning for short events
    const [tooltipDimensions, setTooltipDimensions] = useState<{ width: number; height: number }>({ width: 280, height: 150 });
    
    useEffect(() => {
        if (!tooltipRef.current || !isHovered) return;
        const updateDimensions = () => {
            if (tooltipRef.current) {
                const rect = tooltipRef.current.getBoundingClientRect();
                setTooltipDimensions({ width: rect.width, height: rect.height });
            }
        };
        // Measure after a brief delay to ensure tooltip is rendered
        const timeoutId = setTimeout(updateDimensions, 0);
        updateDimensions(); // Also measure immediately
        return () => clearTimeout(timeoutId);
    }, [isHovered, mousePos]);
    
    const tooltipStyle = useMemo(() => {
        if (!mousePos || !isHovered || typeof window === 'undefined') return {};
        const offset = 12;
        const tooltipWidth = tooltipDimensions.width || 280;
        const tooltipHeight = tooltipDimensions.height || 150;
        
        // For very short events, we use the mouse position with smart bounds checking
        const anchorX = mousePos.x;
        const anchorY = mousePos.y;
        
        // Calculate available space in each direction
        const spaceRight = window.innerWidth - anchorX;
        const spaceLeft = anchorX;
        const spaceBottom = window.innerHeight - anchorY;
        const spaceTop = anchorY;
        
        // Determine horizontal position: prefer right, but use left if needed
        let leftPos: number;
        if (spaceRight >= tooltipWidth + offset) {
            // Enough space to the right
            leftPos = anchorX + offset;
        } else if (spaceLeft >= tooltipWidth + offset) {
            // Not enough space to the right, but enough to the left
            leftPos = anchorX - tooltipWidth - offset;
        } else {
            // Not enough space on either side - center it, but keep it in bounds
            leftPos = Math.max(offset, Math.min(anchorX - tooltipWidth / 2, window.innerWidth - tooltipWidth - offset));
        }
        
        // Determine vertical position: prefer below, but use above if needed
        let topPos: number;
        if (spaceBottom >= tooltipHeight + offset) {
            // Enough space below
            topPos = anchorY + offset;
        } else if (spaceTop >= tooltipHeight + offset) {
            // Not enough space below, but enough above
            topPos = anchorY - tooltipHeight - offset;
        } else {
            // Not enough space above or below - center it vertically, but keep it in bounds
            topPos = Math.max(offset, Math.min(anchorY - tooltipHeight / 2, window.innerHeight - tooltipHeight - offset));
        }
        
        // Final bounds check to ensure it never goes out of viewport
        leftPos = Math.max(offset, Math.min(leftPos, window.innerWidth - tooltipWidth - offset));
        topPos = Math.max(offset, Math.min(topPos, window.innerHeight - tooltipHeight - offset));
        
        return {
            position: 'fixed' as const,
            left: `${leftPos}px`,
            top: `${topPos}px`,
            zIndex: 999999,
            pointerEvents: 'none' as const,
        };
    }, [mousePos, isHovered, tooltipDimensions]);

    if (width === 0) {
        // Determine the correct icon based on event name
        let EventIcon = Icon;
        if (event.name === 'Lovely Boarlet' || event.name === 'Breezy Boarlet') {
            EventIcon = PiggyBank;
        } else if (event.name === 'Daily Reset') {
            EventIcon = RefreshCw;
        } else if (event.name === 'Weekly Reset') {
            EventIcon = CalendarDays;
        } else if (event.name === 'Stimens Reset') {
            EventIcon = Lock;
        }
        
        return (
            <>
            <div
                    className="absolute flex flex-col items-center -top-4 h-10 cursor-default"
                style={{ left: `${left}px`, transform: 'translateX(-50%)' }}
                    onMouseEnter={(e) => {
                        setIsHovered(true);
                        setMousePos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => {
                        setIsHovered(false);
                        setMousePos(null);
                    }}
            >
                <div className="flex items-center gap-2">
                    <div className={cn("text-xs font-bold whitespace-nowrap px-2 py-0.5 rounded-full border", colorClass, isPast ? 'opacity-50' : '')} style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined}>
                  {event.name}
                    </div>
                    <div className="flex items-center gap-0.5">
                        {event.seasonalCategory && (() => {
                            const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                            return SeasonalIcon ? (
                                <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                            ) : null;
                        })()}
                        <EventIcon className="h-3 w-3 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                    </div>
                </div>
                <div className={cn("w-0.5 grow", isPast ? "bg-muted" : lineColor)} />
            </div>
                {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                    <div ref={tooltipRef} style={tooltipStyle}>
                        <EventTooltipContent event={event} occurrence={occurrence} timeMode={timeMode} timeFormat={timeFormat} isToday={isToday} effectiveEndDate={effectiveEndDate} />
                    </div>,
                    document.body
                )}
            </>
        );
    }
    
    return (
        <>
        <div 
            className="absolute z-10"
            style={{ left: `${left}px` }}
            onMouseEnter={(e) => {
                setIsHovered(true);
                setMousePos({ x: e.clientX, y: e.clientY });
            }}
            onMouseLeave={() => {
                setIsHovered(false);
                setMousePos(null);
            }}
        >
            <div className="flex items-center gap-2">
        <div
            className={cn(
                        "rounded-md px-2 py-0.5 flex items-center gap-1.5 text-xs font-semibold h-6 border transition-all duration-200 cursor-default", 
                colorClass,
                isPast && "opacity-50 bg-card/50",
                isActive && "ring-2 ring-white shadow-lg shadow-white/20"
            )}
                    style={{ width: `${Math.max(width, 0)}px`, ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 }) }}
                >
                    <Checkbox
                        checked={isCompleted}
                        onCheckedChange={(checked) => {
                            if (checked !== 'indeterminate') {
                                onToggleCompletion();
                            }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-3 w-3 flex-shrink-0"
                    />
                    <span className="truncate whitespace-nowrap">{event.name}</span>
        </div>
                <div className="flex items-center gap-1">
                    {event.seasonalCategory && (() => {
                        const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                        return SeasonalIcon ? (
                        <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                    ) : null;
                })()}
                    <Icon className="h-3 w-3 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                </div>
            </div>
        </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <EventTooltipContent event={event} occurrence={occurrence} timeMode={timeMode} timeFormat={timeFormat} isToday={isToday} effectiveEndDate={effectiveEndDate} />
                </div>,
                document.body
            )}
        </>
    );
});
TimelineEvent.displayName = 'TimelineEvent';


const GAME_LAUNCH_DATE = new Date('2025-10-09T05:00:00Z'); // Game launches at reset time on Thursday Oct 9th.

export default function DailyTimeline({ timeMode, timeFormat }: { timeMode: TimeDisplayMode, timeFormat: TimeFormat }) {
    const { isCategoryEnabled } = useEventPreferences();
    const { isEventCompleted, toggleEventCompletion, resetDay, mounted: completionsMounted } = useDailyCompletions();
    const [selectedGameDate, setSelectedGameDate] = useState(() => getGameDate(new Date()));
    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);
    const [now, setNow] = useState<Date | null>(null);
    
     useEffect(() => {
        setNow(new Date());
        const timerId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    const gameDayStart = useMemo(() => {
        // Game day mode: starts at 5 AM game time (UTC-2)
        // To represent 5 AM UTC-2 in a UTC Date object, we add 2 hours
        // So 5 AM UTC-2 = 7 AM UTC
        const year = selectedGameDate.getUTCFullYear();
        const month = selectedGameDate.getUTCMonth();
        const day = selectedGameDate.getUTCDate();
        const start = new Date(Date.UTC(year, month, day, 7, 0, 0, 0));
        return start;
    }, [selectedGameDate]);
    
    const gameDayEnd = useMemo(() => {
        const end = new Date(gameDayStart);
        end.setUTCDate(end.getUTCDate() + 1);
        return end;
    }, [gameDayStart]);

    // Calculate game day number for display
    const gameDayNumbers = useMemo(() => {
        const launchDate = new Date(GAME_LAUNCH_DATE);
        launchDate.setUTCHours(0, 0, 0, 0);
        
        const selectedDate = new Date(selectedGameDate);
        selectedDate.setUTCHours(0, 0, 0, 0);
        const dayNumber = differenceInDays(selectedDate, launchDate) + 1;
        return [dayNumber];
    }, [selectedGameDate]);

    // For display purposes, convert to the selected time mode
    // gameDayStart is stored in UTC (representing game time)
    const displayDayStart = useMemo(() => {
        if (timeMode === 'game') {
            // Game time mode: display in UTC-2 (subtract 2 hours from UTC)
            return new Date(gameDayStart.getTime() - (2 * 60 * 60 * 1000));
        } else {
            // Local time mode: convert UTC to local timezone (browser handles conversion)
            return new Date(gameDayStart);
        }
    }, [gameDayStart, timeMode]);
    
    const displayDayEnd = useMemo(() => {
        if (timeMode === 'game') {
            // Game time mode: display in UTC-2 (subtract 2 hours from UTC)
            return new Date(gameDayEnd.getTime() - (2 * 60 * 60 * 1000));
        } else {
            // Local time mode: convert UTC to local timezone
            return new Date(gameDayEnd);
        }
    }, [gameDayEnd, timeMode]);

    const displayDate = timeMode === 'game' ? selectedGameDate : displayDayStart;
    
    // Get the calendar dates that a game day spans (might span two calendar days)
    const gameDayCalendarDates = useMemo(() => {
        // For game time mode, use UTC date components; for local time, use local date components
        const startDate = timeMode === 'game' 
            ? new Date(Date.UTC(displayDayStart.getUTCFullYear(), displayDayStart.getUTCMonth(), displayDayStart.getUTCDate()))
            : new Date(displayDayStart.getFullYear(), displayDayStart.getMonth(), displayDayStart.getDate());
        const endDate = timeMode === 'game'
            ? new Date(Date.UTC(displayDayEnd.getUTCFullYear(), displayDayEnd.getUTCMonth(), displayDayEnd.getUTCDate()))
            : new Date(displayDayEnd.getFullYear(), displayDayEnd.getMonth(), displayDayEnd.getDate());
        
        // Check if it spans two different calendar days
        if (startDate.getTime() !== endDate.getTime()) {
            return { start: startDate, end: endDate, spansTwoDays: true };
        }
        return { start: startDate, end: null, spansTwoDays: false };
    }, [displayDayStart, displayDayEnd, timeMode]);
    
    const isToday = useMemo(() => {
        const todayGameDate = getGameDate(new Date());
        return selectedGameDate.getUTCFullYear() === todayGameDate.getUTCFullYear() &&
               selectedGameDate.getUTCMonth() === todayGameDate.getUTCMonth() &&
               selectedGameDate.getUTCDate() === todayGameDate.getUTCDate();
    }, [selectedGameDate]);
    
    const currentTimePosition = useMemo(() => {
        if (!isToday || !now) return -1;
        
        let minutesSinceDayStart: number;
        if (timeMode === 'game') {            
            minutesSinceDayStart = (now.getTime() - gameDayStart.getTime()) / (1000 * 60);
        } else {
            // For local time, use local time directly and compare with displayDayStart (which is in local time)
            minutesSinceDayStart = (now.getTime() - displayDayStart.getTime()) / (1000 * 60);
        }
        
        if (minutesSinceDayStart < 0 || minutesSinceDayStart > 24 * 60) {
            return -1;
        }
        
        return minutesToPixels(minutesSinceDayStart);
    }, [isToday, now, timeMode, gameDayStart, displayDayStart]);

    
    useEffect(() => {
        if (isToday && timelineContainerRef.current && !hasScrolledRef.current && currentTimePosition > 0) {
            const scrollPosition = currentTimePosition - timelineContainerRef.current.offsetWidth / 2;
            timelineContainerRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
            hasScrolledRef.current = true;
        }
    }, [currentTimePosition, isToday]);
    
    // Calculate reset occurrences for the selected day
    const resetEvents = useMemo(() => {
        const resetOccurrences: Array<{ name: string; icon: React.ElementType; colorClass: string; lineColor: string; occurrence: { start: Date; end?: Date } }> = [];
        
        // Daily reset is at 5 AM game time (7 AM UTC) every day
        const dateForReset = selectedGameDate;
        const dailyResetTime = new Date(Date.UTC(dateForReset.getUTCFullYear(), dateForReset.getUTCMonth(), dateForReset.getUTCDate(), 7, 0, 0, 0)); // 5 AM game time = 7 AM UTC
        resetOccurrences.push({
            name: 'Daily Reset',
            icon: RefreshCw,
            colorClass: 'border-cyan-400 bg-cyan-400/20 text-cyan-300',
            lineColor: 'bg-cyan-400',
            occurrence: { start: dailyResetTime }
        });
        
        // Weekly reset is on Monday at 5 AM game time (when transitioning from Sunday to Monday)
        const gameDayDayOfWeek = dateForReset.getUTCDay(); // 0 = Sunday, 1 = Monday
        if (gameDayDayOfWeek === 1) { // Monday
            resetOccurrences.push({
                name: 'Weekly Reset',
                icon: CalendarDays,
                colorClass: 'border-purple-400 bg-purple-400/20 text-purple-300',
                lineColor: 'bg-purple-400',
                occurrence: { start: dailyResetTime }
            });
        }
        
        // Stimens reset is bi-weekly - check if this day is a stimens reset day
        // A stimens reset occurs every 14 days starting from BIWEEKLY_REFERENCE_RESET
        const stimensResetTime = new Date(dailyResetTime);
        const fourteenDaysInMillis = 14 * 24 * 60 * 60 * 1000;
        const timeDiff = stimensResetTime.getTime() - BIWEEKLY_REFERENCE_RESET.getTime();
        
        // Check if the time difference is a multiple of 14 days (within 1 minute tolerance)
        if (timeDiff >= 0 && Math.abs(timeDiff % fourteenDaysInMillis) < 60000) {
            resetOccurrences.push({
                name: 'Stimens Reset',
                icon: Lock,
                colorClass: 'border-amber-400 bg-amber-400/20 text-amber-300',
                lineColor: 'bg-amber-400',
                occurrence: { start: dailyResetTime }
            });
        }
        
        return resetOccurrences;
    }, [selectedGameDate]);
    
    const { boarletEvents, otherEvents } = useMemo(() => {
        // selectedGameDate is a game date, set it to the game day start (5 AM UTC-2 = 7 AM UTC)
        const dateForOccurrences = new Date(Date.UTC(selectedGameDate.getUTCFullYear(), selectedGameDate.getUTCMonth(), selectedGameDate.getUTCDate(), 7, 0, 0, 0));
        
        const filteredEvents = filterEventsByPreferences(events, isCategoryEnabled);
        const allEvents = filteredEvents
            .filter(event => event.schedule.type !== 'none')
            .map(event => ({
                event,
                occurrences: getDayOccurrences(event, dateForOccurrences)
            }))
            .filter(item => item.occurrences.length > 0);

        const boarlets = allEvents.filter(({ event }) => event.name.includes('Boarlet'));
        const others = allEvents
            .filter(({ event }) => !event.name.includes('Boarlet'))
            .sort((a, b) => {
                const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Dungeon Unlock', 'Raid Unlock', 'Event', 'Guild', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike'];
                const indexA = categoryOrder.indexOf(a.event.category);
                const indexB = categoryOrder.indexOf(b.event.category);
                if (indexA !== indexB) {
                    if (indexA === -1) return 1;
                    if (indexB === -1) return -1;
                    return indexA - indexB;
                }
                return a.event.name.localeCompare(b.event.name);
            });
        
        return { boarletEvents: boarlets, otherEvents: others };
    }, [selectedGameDate, isCategoryEnabled, isToday, isEventCompleted, completionsMounted]);

    const changeDay = (amount: number) => {
        hasScrolledRef.current = false; // Allow scrolling on day change
        setSelectedGameDate(prev => {
            const newDate = new Date(prev);
            // Add/subtract days and convert to game date
            newDate.setUTCDate(newDate.getUTCDate() + amount);
            return getGameDate(newDate);
        });
    };
    
    const timeMarkers = useMemo(() => {
        const markers = [];
        
        // For game time mode, format as UTC to show UTC hours directly (after subtracting 2 hours)
        // For local time mode, use browser's local timezone
        const hourFormat: Intl.DateTimeFormatOptions = { 
            hour: 'numeric', 
            hour12: timeFormat === '12h',
            timeZone: timeMode === 'game' ? 'UTC' : undefined
        };
        const minuteFormat: Intl.DateTimeFormatOptions = { 
            minute: '2-digit',
            timeZone: timeMode === 'game' ? 'UTC' : undefined
        };
        const dateFormat: Intl.DateTimeFormatOptions = {
            month: 'short',
            day: 'numeric',
            timeZone: timeMode === 'game' ? 'UTC' : undefined
        };

        // displayDayStart is already converted to the correct timezone (UTC-2 for game time, local for local time)
        const baseTime = new Date(displayDayStart);
        // Get initial date in the correct timezone
        let previousDate = timeMode === 'game' 
            ? baseTime.getUTCDate() 
            : baseTime.getDate();

        for (let i = 0; i < 96; i++) { // 96 intervals of 15 minutes in 24 hours
            const intervalType = i % 4; // 0 for hour, 1 for :15, 2 for :30, 3 for :45
            const displayTime = new Date(baseTime.getTime() + i * 15 * 60 * 1000);
            // Get current date in the correct timezone
            const currentDate = timeMode === 'game' 
                ? displayTime.getUTCDate() 
                : displayTime.getDate();
            const isMidnight = intervalType === 0 && currentDate !== previousDate;
            previousDate = currentDate;

            let label = '';
            let labelSuffix = ''; // For AM/PM in 12h format
            let height = 'h-1';
            let labelClass = 'text-[9px]';
            let isMidnightMarker = false;
            let dateLabel = '';

            if (intervalType === 0) { // Hour
                const fullLabel = displayTime.toLocaleTimeString('en-US', hourFormat);
                if (timeFormat === '12h') {
                    // Split time and AM/PM (format is typically "3:00 PM" or "12:00 AM")
                    const match = fullLabel.match(/^(.+?)(\s+[AP]M)$/i);
                    if (match) {
                        label = match[1]; // The time part
                        labelSuffix = match[2]; // The AM/PM part with space
                    } else {
                        label = fullLabel;
                    }
                } else {
                    label = fullLabel;
                }
                height = isMidnight ? 'h-4' : 'h-3';
                labelClass = isMidnight ? 'text-sm font-semibold' : 'text-xs';
                isMidnightMarker = isMidnight;
                if (isMidnight) {
                    dateLabel = displayTime.toLocaleDateString('en-US', dateFormat);
                }
            } else if (intervalType === 2) { // Half-hour
                label = `:${displayTime.toLocaleTimeString('en-US', minuteFormat)}`;
                height = 'h-2';
                labelClass = 'text-[10px]';
            } else { // 15 and 45 minute marks
                label = `:${displayTime.toLocaleTimeString('en-US', minuteFormat)}`;
            }

            markers.push({
                intervalType,
                label,
                labelSuffix,
                height,
                labelClass,
                left: i * 15 * PIXELS_PER_MINUTE,
                isMidnight: isMidnightMarker,
                dateLabel,
            });
        }
        return markers;
    }, [timeMode, timeFormat, displayDayStart]);

    const legendItems = useMemo(() => {
        const items = new Map<string, { icon: React.ElementType, color: string }>();
        const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Dungeon Unlock', 'Raid Unlock', 'Event', 'Hunting', 'Guild', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike'];
        
        // Collect categories from events actually shown in the current view
        const shownCategories = new Set<GameEvent['category']>();
        boarletEvents.forEach(({ event }) => shownCategories.add(event.category));
        otherEvents.forEach(({ event }) => shownCategories.add(event.category));
        
        // Only add legend items for categories that are present
        for (const category of categoryOrder) {
            if (shownCategories.has(category) && CategoryIcons[category] && CategoryColors[category]) {
                items.set(category, {
                    icon: CategoryIcons[category],
                    color: CategoryColors[category],
                });
            }
        }
        
        return Array.from(items.entries());
    }, [boarletEvents, otherEvents]);


    return (
            <Card className="p-3 space-y-3 w-full">
                 <div className="flex justify-between items-center gap-2">
                    <Button variant="outline" size="icon" onClick={() => changeDay(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex-1 flex flex-col items-center gap-2">
                    <h3 className="text-lg font-semibold text-center">
                        <div className="flex flex-col items-center">
                            <div>
                                Game Day #{gameDayNumbers[0]}: {gameDayCalendarDates.start.toLocaleDateString('en-US', { 
                            weekday: 'long',
                            timeZone: timeMode === 'game' ? 'UTC' : undefined,
                            year: 'numeric', month: 'long', day: 'numeric' 
                                })}
                            </div>
                            {gameDayCalendarDates.spansTwoDays && gameDayCalendarDates.end && (
                                <div className="text-sm text-muted-foreground font-normal">
                                    and {gameDayCalendarDates.end.toLocaleDateString('en-US', { 
                                        weekday: 'long',
                                        timeZone: timeMode === 'game' ? 'UTC' : undefined,
                                        year: 'numeric', month: 'long', day: 'numeric' 
                                    })} 
                                    ({timeMode === 'game' ? ' Game Time' : ' Your Time'})
                                </div>
                            )}
                        </div>
                    </h3>
                    </div>
                    {completionsMounted && (
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => resetDay(selectedGameDate)}
                            className="flex items-center gap-1.5"
                        >
                            <RotateCcw className="h-3 w-3" />
                            <span className="text-xs">Reset</span>
                        </Button>
                    )}
                    <Button variant="outline" size="icon" onClick={() => changeDay(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>

                <div ref={timelineContainerRef} className="w-full overflow-x-auto pb-3 relative">
                    <div className="flex sticky top-0 bg-card z-30 pt-5">
                        <div className="relative flex-1" style={{ minWidth: `${TOTAL_WIDTH}px` }}>
                            {timeMarkers.map(({intervalType, label, labelSuffix, left, height, labelClass, isMidnight, dateLabel}, index) => (
                                <div
                                    key={index}
                                    className="absolute top-0 -translate-x-1/2 h-full"
                                    style={{ left: `${left}px` }}
                                >
                                    <div className={cn(
                                        "w-0.5 bg-border", 
                                        height, 
                                        intervalType > 0 && !isMidnight && "opacity-50",
                                        isMidnight && "bg-accent w-0.5"
                                    )} />
                                    <div className={cn("absolute top-2 whitespace-nowrap flex flex-col items-center", isMidnight ? "text-accent font-semibold" : "text-muted-foreground")}>
                                        {isMidnight && dateLabel && (
                                            <span className={cn("text-xs font-bold mb-0.5", labelClass)}>{dateLabel}</span>
                                        )}
                                        <span className={cn(labelClass)}>
                                        {label}
                                            {labelSuffix && <span className="text-[8px]">{labelSuffix}</span>}
                                    </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="relative">
                         <div className="space-y-1 pt-12" style={{ minWidth: `${TOTAL_WIDTH}px` }}>
                            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(24, ${PIXELS_PER_HOUR}px)`}}>
                                {Array.from({ length: 24 }).map((_, i) => (
                                    <div key={i} className="h-full border-r border-border/50" />
                                ))}
                            </div>

                            {/* Reset Events Rows - Each reset type gets its own row */}
                            {resetEvents.map((resetEvent) => {
                                // Create a dummy event for the tooltip
                                const dummyEvent: GameEvent = {
                                    name: resetEvent.name,
                                    type: 'Special Event',
                                    category: 'Event',
                                    description: resetEvent.name === 'Daily Reset' ? 'Daily reset occurs at 5 AM game time' : 
                                                 resetEvent.name === 'Weekly Reset' ? 'Weekly reset occurs on Monday at 5 AM game time' :
                                                 'Stimens vaults reset bi-weekly at 5 AM game time',
                                    schedule: { type: 'none' }
                                };
                                
                                return (
                                    <div key={resetEvent.name} className="relative h-10" style={{ zIndex: 25 }}>
                                        <div className="absolute top-1/2 -translate-y-1/2 w-full h-0.5 bg-muted/20 rounded-full" />
                                        <TimelineEvent 
                                            event={dummyEvent}
                                            occurrence={resetEvent.occurrence}
                                            timeMode={timeMode}
                                            timeFormat={timeFormat}
                                            isToday={isToday}
                                            gameDayStart={gameDayStart}
                                            isCompleted={false}
                                            onToggleCompletion={() => {}}
                                        />
                                    </div>
                                );
                            })}

                            {/* Boarlets Row */}
                            {boarletEvents.length > 0 && (
                                <div className="relative h-10" style={{ zIndex: 20 }}>
                                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-0.5 bg-muted/20 rounded-full" />
                                    {boarletEvents.map(({ event, occurrences }) => (
                                        <Fragment key={event.name}>
                                            {occurrences.map((occurrence) => (
                                                <TimelineEvent 
                                                    key={event.name + occurrence.start.toISOString()} 
                                                    event={event} 
                                                    occurrence={occurrence} 
                                                    timeMode={timeMode} 
                                                    timeFormat={timeFormat} 
                                                    isToday={isToday} 
                                                    gameDayStart={gameDayStart}
                                                    isCompleted={completionsMounted && (() => {
                                                        // For non-buff events, check if ANY occurrence is completed for the day
                                                        // For buff events, check the specific occurrence
                                                        if (event.category === 'Buff') {
                                                            const occurrenceKey = `${occurrence.start.getUTCHours()}-${occurrence.start.getUTCMinutes()}`;
                                                            return isEventCompleted(event.name, selectedGameDate, occurrenceKey);
                                                        } else {
                                                            // For non-buff events, just check the event name (no occurrenceKey)
                                                            return isEventCompleted(event.name, selectedGameDate);
                                                        }
                                                    })()}
                                                    onToggleCompletion={() => {
                                                        // For non-buff events, mark all occurrences as complete (no occurrenceKey)
                                                        // For buff events, mark only this specific occurrence
                                                        const occurrenceKey = event.category === 'Buff' 
                                                            ? `${occurrence.start.getUTCHours()}-${occurrence.start.getUTCMinutes()}`
                                                            : undefined;
                                                        toggleEventCompletion(event.name, selectedGameDate, occurrenceKey);
                                                    }}
                                                />
                                            ))}
                                        </Fragment>
                                    ))}
                                </div>
                            )}

                            {/* Other Event Rows */}
                            {otherEvents.map(({ event, occurrences }, i) => (
                                <div key={event.name} className="relative h-10" style={{ zIndex: 10 + i}}>
                                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-0.5 bg-muted/20 rounded-full" />
                                    {occurrences.map((occurrence) => (
                                        <TimelineEvent 
                                            key={event.name + occurrence.start.toISOString()} 
                                            event={event} 
                                            occurrence={occurrence} 
                                            timeMode={timeMode} 
                                            timeFormat={timeFormat} 
                                            isToday={isToday} 
                                            gameDayStart={gameDayStart}
                                            isCompleted={completionsMounted && (() => {
                                                // For non-buff events, check if ANY occurrence is completed for the day
                                                // For buff events, check the specific occurrence
                                                if (event.category === 'Buff') {
                                                    const occurrenceKey = `${occurrence.start.getUTCHours()}-${occurrence.start.getUTCMinutes()}`;
                                                    return isEventCompleted(event.name, selectedGameDate, occurrenceKey);
                                                } else {
                                                    // For non-buff events, just check the event name (no occurrenceKey)
                                                    return isEventCompleted(event.name, selectedGameDate);
                                                }
                                            })()}
                                            onToggleCompletion={() => {
                                                // For non-buff events, mark all occurrences as complete (no occurrenceKey)
                                                // For buff events, mark only this specific occurrence
                                                const occurrenceKey = event.category === 'Buff' 
                                                    ? `${occurrence.start.getUTCHours()}-${occurrence.start.getUTCMinutes()}`
                                                    : undefined;
                                                toggleEventCompletion(event.name, selectedGameDate, occurrenceKey);
                                            }}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>

                        {isToday && currentTimePosition >= 0 && (
                            <div 
                                className="absolute top-0 h-full w-0.5 bg-accent z-50"
                                style={{ left: `${currentTimePosition}px` }}
                            >
                                <div className="absolute -top-4 -translate-x-1/2 text-xs font-bold text-accent bg-background px-1 rounded">NOW</div>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-2">Legend</h4>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-3 gap-y-2">
                        {legendItems.map(([name, { icon: Icon, color }]) => (
                            <div key={name} className="flex items-center gap-1.5 text-xs">
                                <div className={cn("h-4 w-4 rounded-sm border flex items-center justify-center flex-shrink-0", color.replace(/bg-\w+\/\d+/, ''))}>
                                     <Icon className={cn("h-2.5 w-2.5", color.replace(/border-\w+/, '').replace(/bg-\w+\/\d+/, ''))} />
                                </div>
                                <span className="font-semibold whitespace-nowrap">{name.replace(/([A-Z])/g, ' $1').trim()}</span>
                            </div>
                        ))}
                    </div>
                </div>


                 {!isToday && (
                    <Button onClick={() => {
                        hasScrolledRef.current = false;
                        setSelectedGameDate(getGameDate(new Date()));
                    }} className="w-full">
                        Jump to Today
                    </Button>
                 )}
            </Card>
    );
}

    

    

    
