

"use client";

import { useState, useEffect, useMemo, useRef, Fragment, memo } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { getGameTime, toLocalTime, formatDuration, getGameDate, DAILY_RESET_HOUR_UTC, getWeekPeriod } from '@/lib/time';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Star, Swords, Crown, Gamepad2, Users, Footprints, ShieldAlert, HeartHandshake, ShieldCheck, KeySquare, BrainCircuit, RotateCcw, PiggyBank, UtensilsCrossed, Gift, CalendarHeart, Ghost } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimeDisplayMode, TimeFormat } from '@/app/page';
import { format } from 'date-fns';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { useDailyCompletions } from '@/hooks/useDailyCompletions';
import { Checkbox } from './ui/checkbox';

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
    const checkSingleRange = (range: { start: string; end: string }) => {
        const startDate = new Date(range.start + 'T00:00:00Z');
        startDate.setUTCHours(0,0,0,0);
        
        if (date < startDate) return false;

        const endDate = new Date(range.end + 'T00:00:00Z');
        endDate.setUTCHours(23,59,59,999);
        return date <= endDate;
    }

    if (event.dateRanges) {
        return event.dateRanges.some(range => checkSingleRange(range));
    }
    if (event.dateRange) {
        return checkSingleRange(event.dateRange);
    }
    return true; // No date range or availability specified - assume always available
}


const getDayOccurrences = (event: GameEvent, gameDay: Date): {start: Date, end?: Date}[] => {
    const { schedule } = event;
    const occurrences: {start: Date, end?: Date}[] = [];
    
    // We do all calculations in game time first
    const gameDayStart = new Date(gameDay);
    gameDayStart.setUTCHours(5, 0, 0, 0);

    const gameDayEnd = new Date(gameDayStart);
    gameDayEnd.setUTCDate(gameDayEnd.getUTCDate() + 1);

    if (!checkDateInRange(event, gameDay)) return [];

    if (event.biWeeklyRotation) {
      const period = getWeekPeriod(gameDay);
      if (period !== event.biWeeklyRotation) {
        return [];
      }
    }

    // Check occurrences for the current calendar day and the next one, then filter by game day range
    for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
        const currentCalendarDate = new Date(gameDay);
        currentCalendarDate.setUTCDate(currentCalendarDate.getUTCDate() + dayOffset);
        
        switch (schedule.type) {
            case 'hourly':
                for (let i = 0; i < 24; i++) {
                    const start = new Date(currentCalendarDate);
                    start.setUTCHours(i, schedule.minute);
                    const end = event.durationMinutes ? new Date(start.getTime() + event.durationMinutes * 60 * 1000) : undefined;
                    occurrences.push({ start, end });
                }
                break;
            case 'multi-hourly':
                for (let i = 0; i < 24; i += schedule.hours) {
                    const start = new Date(currentCalendarDate);
                    start.setUTCHours(i + (schedule.offsetHours || 0), schedule.minute);
                    const end = event.durationMinutes ? new Date(start.getTime() + event.durationMinutes * 60 * 1000) : undefined;
                    occurrences.push({ start, end });
                }
                break;
            case 'daily-specific':
                if (schedule.days.includes(currentCalendarDate.getUTCDay())) {
                    schedule.times.forEach(time => {
                        const start = new Date(currentCalendarDate);
                        start.setUTCHours(time.hour, time.minute);
                        const end = event.durationMinutes ? new Date(start.getTime() + event.durationMinutes * 60 * 1000) : undefined;
                        occurrences.push({ start, end });
                    });
                }
                break;
            case 'daily-intervals':
                 schedule.intervals.forEach(interval => {
                    const start = new Date(currentCalendarDate);
                    start.setUTCHours(interval.start.hour, interval.start.minute);
                    
                    const end = new Date(currentCalendarDate);
                    end.setUTCHours(interval.end.hour, interval.end.minute);
                    
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
                        start.setUTCHours(interval.start.hour, interval.start.minute);
                        
                        const end = new Date(currentCalendarDate);
                        end.setUTCHours(interval.end.hour, interval.end.minute);
                        
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
    
    // Filter occurrences to be within the game day window (5am to 5am)
    const uniqueOccurrences = occurrences.filter((occ, index, self) => 
        occ.start >= gameDayStart && occ.start < gameDayEnd &&
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
    const timeZone = timeMode === 'game' ? 'UTC' : undefined;
    
    const timeOptions: Intl.DateTimeFormatOptions = {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: timeFormat === '12h'
    };
    
    const displayStart = timeMode === 'local' ? toLocalTime(occurrence.start) : occurrence.start;
    const displayEnd = occurrence.end ? (timeMode === 'local' ? toLocalTime(occurrence.end) : occurrence.end) : null;
    const displayEffectiveEnd = timeMode === 'local' ? toLocalTime(effectiveEndDate) : effectiveEndDate;
    
    const startTimeStr = displayStart.toLocaleTimeString([], timeOptions);
    const endTimeStr = displayEnd ? displayEnd.toLocaleTimeString([], timeOptions) : null;
    
    // Check if this is an instant event (like boarlets - no duration)
    const isInstantEvent = !event.durationMinutes && (!occurrence.end || occurrence.end.getTime() === occurrence.start.getTime());
    
    // Calculate time until/remaining
    let timeInfo: string | null = null;
    if (isToday && now) {
        const realNow = now;
        const start = toLocalTime(occurrence.start);
        const end = toLocalTime(effectiveEndDate);
        const timeUntilStart = start.getTime() - realNow.getTime();
        const timeUntilEnd = end.getTime() - realNow.getTime();
        
        if (isInstantEvent) {
            // Instant events (like boarlets)
            if (timeUntilStart > 0) {
                timeInfo = `Happens in ${formatDuration(timeUntilStart)}`;
            } else {
                const timeAgo = realNow.getTime() - start.getTime();
                timeInfo = `Happened ${formatDuration(timeAgo)} ago`;
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
                const timeAgo = realNow.getTime() - end.getTime();
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
    // Use piggy-bank icon for boarlets
    if (event.name === 'Lovely Boarlet' || event.name === 'Breezy Boarlet') {
        Icon = PiggyBank;
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
            setIsPast(new Date() > toLocalTime(effectiveEndDate));
            setIsActive(false);
            return;
        }

        const checkStatus = () => {
            const realNow = new Date();
            const start = toLocalTime(occurrence.start);
            const end = toLocalTime(effectiveEndDate);
            setIsActive(realNow >= start && realNow < end);
            setIsPast(realNow > end);
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
        const BoarletIcon = (event.name === 'Lovely Boarlet' || event.name === 'Breezy Boarlet') ? PiggyBank : (CategoryIcons[event.category] || Star);
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
                    <div className={cn("text-xs font-bold whitespace-nowrap px-2 py-0.5 rounded-full border", colorClass, isPast ? 'opacity-50' : '', isCompleted && 'opacity-30 grayscale')}>
                  {event.name}
                    </div>
                    <div className="flex items-center gap-0.5">
                        {event.seasonalCategory && (() => {
                            const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                            return SeasonalIcon ? (
                                <SeasonalIcon className={cn("h-2.5 w-2.5 flex-shrink-0 opacity-70", isCompleted && 'opacity-30 grayscale')} />
                            ) : null;
                        })()}
                        <BoarletIcon className={cn("h-3 w-3 flex-shrink-0", isCompleted && 'opacity-30 grayscale')} />
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
                        isActive && "ring-2 ring-white shadow-lg shadow-white/20",
                        isCompleted && "opacity-30 grayscale"
                    )}
                    style={{ width: `${Math.max(width, 0)}px` }}
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
                            <SeasonalIcon className={cn("h-2.5 w-2.5 flex-shrink-0 opacity-70", isCompleted && "opacity-30 grayscale")} />
                        ) : null;
                    })()}
                    <Icon className={cn("h-3 w-3 flex-shrink-0", isCompleted && "opacity-30 grayscale")} />
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
        const start = new Date(selectedGameDate);
        start.setUTCHours(5, 0, 0, 0); 
        return start;
    }, [selectedGameDate]);
    
    const localDayStart = useMemo(() => toLocalTime(gameDayStart), [gameDayStart]);

    const displayDate = timeMode === 'game' ? selectedGameDate : localDayStart;
    
    const isToday = useMemo(() => {
        const todayGameDate = getGameDate(new Date());
        return selectedGameDate.getUTCFullYear() === todayGameDate.getUTCFullYear() &&
               selectedGameDate.getUTCMonth() === todayGameDate.getUTCMonth() &&
               selectedGameDate.getUTCDate() === todayGameDate.getUTCDate();
    }, [selectedGameDate]);
    
    const currentTimePosition = useMemo(() => {
        if (!isToday || !now) return -1;
        const gameNow = getGameTime(now);
        
        let minutesSinceGameDayStart = (gameNow.getTime() - gameDayStart.getTime()) / (1000 * 60);
        if (minutesSinceGameDayStart < 0 || minutesSinceGameDayStart > 24 * 60) {
            return -1;
        }
        
        return minutesToPixels(minutesSinceGameDayStart);
    }, [isToday, gameDayStart, now]);

    
    useEffect(() => {
        if (isToday && timelineContainerRef.current && !hasScrolledRef.current && currentTimePosition > 0) {
            const scrollPosition = currentTimePosition - timelineContainerRef.current.offsetWidth / 2;
            timelineContainerRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
            hasScrolledRef.current = true;
        }
    }, [currentTimePosition, isToday]);
    
    const { boarletEvents, otherEvents } = useMemo(() => {
        const filteredEvents = filterEventsByPreferences(events, isCategoryEnabled);
        const allEvents = filteredEvents
            .filter(event => event.schedule.type !== 'none')
            .map(event => ({
                event,
                occurrences: getDayOccurrences(event, selectedGameDate)
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
            newDate.setUTCDate(newDate.getUTCDate() + amount);
            return getGameDate(newDate);
        });
    };
    
    const timeMarkers = useMemo(() => {
        const markers = [];
        const timeZone = timeMode === 'game' ? 'UTC' : undefined;
        
        const hourFormat: Intl.DateTimeFormatOptions = { hour: 'numeric', hour12: timeFormat === '12h', timeZone };
        const minuteFormat: Intl.DateTimeFormatOptions = { minute: '2-digit', timeZone };

        // Start from 5 AM game time
        const baseTime = new Date(gameDayStart);

        for (let i = 0; i < 96; i++) { // 96 intervals of 15 minutes in 24 hours
            const intervalType = i % 4; // 0 for hour, 1 for :15, 2 for :30, 3 for :45
            const currentTime = new Date(baseTime.getTime() + i * 15 * 60 * 1000);
            
            let displayTime = currentTime;
            if (timeMode === 'local') {
                displayTime = toLocalTime(currentTime);
            }

            let label = '';
            let height = 'h-1';
            let labelClass = 'text-[9px]';

            if (intervalType === 0) { // Hour
                label = displayTime.toLocaleTimeString([], hourFormat);
                height = 'h-3';
                labelClass = 'text-xs';
            } else if (intervalType === 2) { // Half-hour
                label = `:${displayTime.toLocaleTimeString([], minuteFormat)}`;
                height = 'h-2';
                labelClass = 'text-[10px]';
            } else { // 15 and 45 minute marks
                label = `:${displayTime.toLocaleTimeString([], minuteFormat)}`;
            }

            markers.push({
                intervalType,
                label,
                height,
                labelClass,
                left: i * 15 * PIXELS_PER_MINUTE,
            });
        }
        return markers;
    }, [timeMode, timeFormat, gameDayStart]);

    const legendItems = useMemo(() => {
        const items = new Map<string, { icon: React.ElementType, color: string }>();
        const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Dungeon Unlock', 'Raid Unlock', 'Event', 'Guild', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike'];
        
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
                    <h3 className="text-lg font-semibold text-center flex-1">
                        Game Day: {displayDate.toLocaleDateString(timeMode === 'game' ? 'en-CA' : undefined, { 
                            weekday: 'long',
                            timeZone: timeMode === 'game' ? 'UTC' : undefined,
                            year: 'numeric', month: 'long', day: 'numeric' 
                        })} ({timeMode === 'game' ? 'Game Time' : 'Your Time'})
                    </h3>
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
                            {timeMarkers.map(({intervalType, label, left, height, labelClass}, index) => (
                                <div
                                    key={index}
                                    className="absolute top-0 -translate-x-1/2 h-full"
                                    style={{ left: `${left}px` }}
                                >
                                    <div className={cn("w-0.5 bg-border", height, intervalType > 0 && "opacity-50")} />
                                     <span className={cn("absolute top-2 text-muted-foreground whitespace-nowrap", labelClass)}>
                                        {label}
                                    </span>
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

    

    

    
