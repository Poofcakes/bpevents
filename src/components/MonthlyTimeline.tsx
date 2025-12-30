

"use client";

import { useState, useMemo, useRef, useEffect, Fragment, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { getGameTime, toLocalTime, DAILY_RESET_HOUR_UTC, GAME_TIMEZONE_OFFSET } from '@/lib/time';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Star, Crown, Swords, Ghost, Gamepad2, Users, Footprints, Gift, UtensilsCrossed, HeartHandshake, ShieldCheck, KeySquare, CalendarHeart, BrainCircuit, ShieldAlert, RotateCcw, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';
import { Checkbox } from './ui/checkbox';
import { useMonthlyCompletions } from '@/hooks/useMonthlyCompletions';
import { TimeDisplayMode, TimeFormat } from '@/app/page';

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper to get exact start time for an event on a date (game time UTC)
const getEventStartTime = (event: GameEvent, dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    
    if (event.schedule.type === 'none') {
        // Events without specific times start at 5 AM game time (7 AM UTC)
        date.setUTCHours(7, 0, 0, 0);
        return date;
    }
    
    // For events with schedules, use the first occurrence time of the day
    // Default to 5 AM (7 AM UTC) if we can't determine
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        const intervals = event.schedule.intervals;
        if (intervals && intervals.length > 0) {
            date.setUTCHours(intervals[0].start.hour, intervals[0].start.minute, 0, 0);
            return date;
        }
    }
    if (event.schedule.type === 'daily-specific') {
        const times = event.schedule.times;
        if (times && times.length > 0) {
            date.setUTCHours(times[0].hour, times[0].minute, 0, 0);
            return date;
        }
    }
    
    // Default to 5 AM game time (7 AM UTC)
    date.setUTCHours(7, 0, 0, 0);
    return date;
};

// Helper to get exact end time for an event on a date (game time UTC)
const getEventEndTime = (event: GameEvent, dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    
    if (event.schedule.type === 'none') {
        // Events without specific times end at 5 AM game time (7 AM UTC) on the end date itself
        date.setUTCHours(7, 0, 0, 0);
        return date;
    }
    
    // For events with schedules, use the last occurrence end time of the day
    // Schedule hours are stored as UTC hours directly (matching DailyTimeline behavior)
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        const intervals = event.schedule.intervals;
        if (intervals && intervals.length > 0) {
            const lastInterval = intervals[intervals.length - 1];
            date.setUTCHours(lastInterval.end.hour, lastInterval.end.minute, 0, 0);
            // Only roll over to next day if end hour is before start hour (crosses midnight)
            // For normal intervals like 18:00-23:00, both are on the same date
            return date;
        }
    }
    if (event.schedule.type === 'daily-specific') {
        const times = event.schedule.times;
        if (times && times.length > 0 && event.durationMinutes) {
            const lastTime = times[times.length - 1];
            date.setUTCHours(lastTime.hour, lastTime.minute, 0, 0);
            date.setUTCMinutes(date.getUTCMinutes() + event.durationMinutes);
            return date;
        }
    }
    
    // Default to 5 AM game time (7 AM UTC) on the end date itself
    date.setUTCHours(7, 0, 0, 0);
    return date;
};

// Location mapping for Whimsical Winterfest
const winterfestLocations: Record<string, string> = {
  '2025-12-18': 'Pioneer Bureau',
  '2025-12-21': 'The Spinning Rudder',
  '2025-12-22': 'Artisan Guild',
  '2025-12-25': 'Fashion Store',
  '2025-12-28': 'Seaside Restaurant',
  '2025-12-29': 'Inn',
  '2026-01-01': 'Ocean Hill',
  '2026-01-04': 'Alchemy Workshop',
};

// Helper function to check if an event ends at 5 AM or earlier (game time) - before the daily reset
const eventEndsAt5AM = (event: GameEvent): boolean => {
    // Events with only date ranges (no specific time schedule) end at 5 AM
    if (event.schedule.type === 'none' && (event.dateRange || event.dateRanges)) {
        return true;
    }
    // Events with intervals ending at 5 AM or earlier
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        return event.schedule.intervals.some(interval => interval.end.hour <= 5 && interval.end.minute === 0);
    }
    return false;
};

// Reusable tooltip content component for monthly timeline
const MonthlyTooltipContent = memo(({ event, exactStartTime, exactEndTime, timeMode, timeFormat }: { event: GameEvent; exactStartTime: Date; exactEndTime: Date | null; timeMode: TimeDisplayMode; timeFormat: TimeFormat }) => {
    const dateFormat = 'MMM d, yyyy';
    const timeFormatStr = timeFormat === '12h' ? 'hh:mm a' : 'HH:mm';
    const isWhimsicalWinterfest = event.name === 'Whimsical Winterfest';
    
    // Validate dates before formatting
    const isValidStart = exactStartTime && !isNaN(exactStartTime.getTime());
    const isValidEnd = exactEndTime && !isNaN(exactEndTime.getTime());
    
    // Convert to local time if needed, or format as UTC for game time
    let displayStartTime: Date | null = null;
    let displayEndTime: Date | null = null;
    
    if (isValidStart) {
        if (timeMode === 'local') {
            displayStartTime = toLocalTime(exactStartTime);
        } else {
            // For game time, use UTC directly
            displayStartTime = exactStartTime;
        }
    }
    
    if (isValidEnd) {
        if (timeMode === 'local') {
            displayEndTime = toLocalTime(exactEndTime!);
        } else {
            // For game time, use UTC directly
            displayEndTime = exactEndTime!;
        }
    }
    
    // Format dates and times
    // For game time (UTC), format with UTC timezone
    // For local time, format normally (date-fns uses local timezone by default)
    const startDateStr = displayStartTime 
        ? (timeMode === 'game'
            ? displayStartTime.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
            : format(displayStartTime, dateFormat))
        : 'Invalid date';
    const startTimeStr = displayStartTime 
        ? (timeMode === 'game' 
            ? displayStartTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: timeFormat === '12h', hour: '2-digit', minute: '2-digit' })
            : format(displayStartTime, timeFormatStr))
        : '--:--';
    const endDateStr = displayEndTime 
        ? (timeMode === 'game'
            ? displayEndTime.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })
            : format(displayEndTime, dateFormat))
        : null;
    const endTimeStr = displayEndTime 
        ? (timeMode === 'game'
            ? displayEndTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: timeFormat === '12h', hour: '2-digit', minute: '2-digit' })
            : format(displayEndTime, timeFormatStr))
        : null;
    
    return (
        <div className="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg max-w-xs">
            <p className="font-bold">{event.name}</p>
            <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2">
                {exactEndTime && isValidEnd ? (
                    <p>Runs from {startDateStr} {startTimeStr} until {endDateStr} {endTimeStr}</p>
                ) : (
                    <p>Became available on {startDateStr} {startTimeStr}</p>
                )}
            </div>
            {isWhimsicalWinterfest && (
                <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2 space-y-1">
                    <p className="font-semibold">Location Availability:</p>
                    {Object.entries(winterfestLocations)
                        .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
                        .map(([date, location]) => (
                            <p key={date}>
                                {format(new Date(date + 'T00:00:00Z'), dateFormat)}: {location}
                            </p>
                        ))}
                </div>
            )}
            <p className="text-xs italic text-muted-foreground max-w-xs mt-2">{event.description}</p>
        </div>
    );
});
MonthlyTooltipContent.displayName = 'MonthlyTooltipContent';

const SeasonalCategoryIcons: Record<NonNullable<GameEvent['seasonalCategory']>, React.ElementType> = {
    'Kanamia Harvest Festival': UtensilsCrossed,
    'Halloween': Ghost,
    'Winter Fest': Gift,
    'Silverstar Carnival': CalendarHeart,
};

const SeasonalCategoryColors: Record<NonNullable<GameEvent['seasonalCategory']>, {bg: string, border: string}> = {
    'Kanamia Harvest Festival': { bg: 'bg-orange-400/80', border: 'border-orange-400' },
    'Halloween': { bg: 'bg-orange-500/80', border: 'border-orange-500' },
    'Winter Fest': { bg: 'bg-red-500/80', border: 'border-red-500' },
    'Silverstar Carnival': { bg: 'bg-blue-400/80', border: 'border-blue-400' },
};

const CategoryIcons: Record<GameEvent['category'], React.ElementType> = {
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

const CategoryColors: Record<GameEvent['category'], {bg: string, border: string, text?: string}> = {
    'Boss': { bg: 'bg-destructive/80', border: 'border-destructive', text: 'text-destructive-foreground' },
    'World Boss Crusade': { bg: 'bg-amber-400/80', border: 'border-amber-400', text: 'text-amber-500' },
    'Event': { bg: 'bg-yellow-400/80', border: 'border-yellow-400', text: 'text-yellow-500' },
    'Hunting': { bg: 'bg-red-500/80', border: 'border-red-500', text: 'text-red-500' },
    'Social': { bg: 'bg-sky-400/80', border: 'border-sky-400', text: 'text-sky-500' },
    'Mini-game': { bg: 'bg-lime-400/80', border: 'border-lime-400', text: 'text-lime-500' },
    'Patrol': { bg: 'bg-neutral-400/80', border: 'border-neutral-400', text: 'text-neutral-400' },
    'Guild': { bg: 'bg-purple-400/80', border: 'border-purple-400', text: 'text-purple-500' },
    'Buff': { bg: 'bg-emerald-400/80', border: 'border-emerald-400', text: 'text-emerald-500' },
    'Dungeon Unlock': { bg: 'bg-cyan-400/80', border: 'border-cyan-400', text: 'text-cyan-500' },
    'Raid Unlock': { bg: 'bg-teal-400/80', border: 'border-teal-400', text: 'text-teal-300' },
    'Roguelike': { bg: 'bg-purple-500/80', border: 'border-purple-500', text: 'text-purple-300' },
};


const MonthlyEventBar = ({ event, range, monthStart, daysInMonth, isCompleted, onToggleCompletion, currentTime, timeMode, timeFormat }: { event: GameEvent; range: { start: string; end?: string }; monthStart: Date; daysInMonth: number; isCompleted: boolean; onToggleCompletion: () => void; currentTime: Date; timeMode: TimeDisplayMode; timeFormat: TimeFormat }) => {

    // Calculate exact start and end times based on event schedule (in UTC/game time)
    const exactStartTimeUTC = getEventStartTime(event, range.start);
    const exactEndTimeUTC = range.end ? getEventEndTime(event, range.end) : null;

    // Validate dates - if invalid, don't render
    if (!exactStartTimeUTC || isNaN(exactStartTimeUTC.getTime())) {
        return null;
    }
    if (exactEndTimeUTC && isNaN(exactEndTimeUTC.getTime())) {
        return null;
    }

    // Convert to display time (local or game time) based on timeMode
    const exactStartTime = timeMode === 'local' ? toLocalTime(exactStartTimeUTC) : exactStartTimeUTC;
    const exactEndTime = exactEndTimeUTC ? (timeMode === 'local' ? toLocalTime(exactEndTimeUTC) : exactEndTimeUTC) : null;

    // Calculate month boundaries in the display timezone
    let viewMonthStart: Date;
    let viewMonthEnd: Date;
    
    if (timeMode === 'local') {
        // For local time, use local month boundaries (midnight local time)
        const year = monthStart.getUTCFullYear();
        const month = monthStart.getUTCMonth();
        viewMonthStart = new Date(year, month, 1, 0, 0, 0);
        const lastDay = new Date(year, month + 1, 0); // Last day of the month
        viewMonthEnd = new Date(year, month, lastDay.getDate(), 23, 59, 59, 999);
    } else {
        // For game time, use UTC month boundaries
        viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 0, 0, 0));
        viewMonthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    }

    // Clamp to month boundaries for display
    const displayStartTime = exactStartTime < viewMonthStart ? viewMonthStart : exactStartTime;
    const displayEndTime = exactEndTime && exactEndTime > viewMonthEnd ? viewMonthEnd : (exactEndTime || displayStartTime);

    // If the event is not in this month, don't render it
    if (displayEndTime < viewMonthStart || displayStartTime > viewMonthEnd) return null;

    // Calculate position based on hour precision: position as fraction of month duration
    const monthStartTimestamp = viewMonthStart.getTime();
    const monthDurationMs = viewMonthEnd.getTime() - monthStartTimestamp;
    const startOffsetMs = displayStartTime.getTime() - monthStartTimestamp;
    const durationMs = displayEndTime.getTime() - displayStartTime.getTime();

    const leftPercent = (startOffsetMs / monthDurationMs) * 100;
    const widthPercent = (durationMs / monthDurationMs) * 100;

    // Check if event is currently active (always use game time for this check)
    const gameNow = getGameTime(currentTime);
    const isActive = exactEndTimeUTC 
        ? (gameNow >= exactStartTimeUTC && gameNow < exactEndTimeUTC)
        : false;

    // Check if event spans across months (for visual indicators) - use display times
    const startedInPreviousMonth = exactStartTime < viewMonthStart;
    const continuesToNextMonth = exactEndTime && exactEndTime > viewMonthEnd;


    let Icon: React.ElementType = Star;
    let colorClasses: {bg: string, border: string} = { bg: 'bg-secondary/80', border: 'border-secondary' };

    if (event.seasonalCategory && SeasonalCategoryColors[event.seasonalCategory]) {
        Icon = SeasonalCategoryIcons[event.seasonalCategory];
        colorClasses = SeasonalCategoryColors[event.seasonalCategory];
    } else if (CategoryIcons[event.category] && CategoryColors[event.category]) {
        Icon = CategoryIcons[event.category];
        colorClasses = CategoryColors[event.category];
    }


    const eventTypeMatch = event.description.match(/^(\w+\s*Event)/);
    const eventType = eventTypeMatch ? `(${eventTypeMatch[1]})` : '';

    const [mounted, setMounted] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    useEffect(() => {
        if (!isHovered) return;
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [isHovered]);
    
    const [tooltipDimensions, setTooltipDimensions] = useState<{ width: number; height: number }>({ width: 280, height: 150 });
    
    useEffect(() => {
        if (!tooltipRef.current || !isHovered) return;
        const updateDimensions = () => {
            if (tooltipRef.current) {
                const rect = tooltipRef.current.getBoundingClientRect();
                setTooltipDimensions({ width: rect.width, height: rect.height });
            }
        };
        const timeoutId = setTimeout(updateDimensions, 0);
        updateDimensions();
        return () => clearTimeout(timeoutId);
    }, [isHovered, mousePos]);
    
    const tooltipStyle = useMemo(() => {
        if (!mousePos || !isHovered || typeof window === 'undefined') return {};
        const offset = 12;
        const tooltipWidth = tooltipDimensions.width || 280;
        const tooltipHeight = tooltipDimensions.height || 150;
        
        const anchorX = mousePos.x;
        const anchorY = mousePos.y;
        
        const spaceRight = window.innerWidth - anchorX;
        const spaceLeft = anchorX;
        const spaceBottom = window.innerHeight - anchorY;
        const spaceTop = anchorY;
        
        let leftPos: number;
        if (spaceRight >= tooltipWidth + offset) {
            leftPos = anchorX + offset;
        } else if (spaceLeft >= tooltipWidth + offset) {
            leftPos = anchorX - tooltipWidth - offset;
        } else {
            leftPos = Math.max(offset, Math.min(anchorX - tooltipWidth / 2, window.innerWidth - tooltipWidth - offset));
        }
        
        let topPos: number;
        if (spaceBottom >= tooltipHeight + offset) {
            topPos = anchorY + offset;
        } else if (spaceTop >= tooltipHeight + offset) {
            topPos = anchorY - tooltipHeight - offset;
        } else {
            topPos = Math.max(offset, Math.min(anchorY - tooltipHeight / 2, window.innerHeight - tooltipHeight - offset));
        }
        
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

    return (
        <>
            <div
                className={cn(
                    "absolute px-2 py-1 flex items-center gap-2 text-xs font-bold z-10 h-8 cursor-default border transition-all duration-200",
                    colorClasses.bg,
                    colorClasses.border,
                    startedInPreviousMonth ? "rounded-r-lg" : "rounded-l-lg",
                    continuesToNextMonth && !startedInPreviousMonth ? "rounded-r-none rounded-l-lg" : "",
                    startedInPreviousMonth && !continuesToNextMonth ? "rounded-l-none rounded-r-lg" : "",
                    startedInPreviousMonth && continuesToNextMonth ? "rounded-none" : "",
                    !startedInPreviousMonth && !continuesToNextMonth ? "rounded-lg" : "",
                    isActive && "ring-2 ring-white shadow-lg shadow-white/20"
                )}
                style={{
                    left: `${leftPercent}%`,
                    width: `max(calc(${widthPercent}% - 2px), 24px)`,
                    ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 })
                }}
                onMouseEnter={(e) => {
                    setIsHovered(true);
                    setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                    setMousePos(null);
                }}
            >
                {startedInPreviousMonth && (
                    <ChevronLeft className="h-3 w-3 flex-shrink-0 opacity-60" />
                )}
                <Checkbox
                    checked={isCompleted}
                    onCheckedChange={(checked) => {
                        if (checked !== 'indeterminate') {
                            onToggleCompletion();
                        }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-3 w-3 flex-shrink-0 mr-1"
                />
                <Icon className="h-4 w-4 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                <span className="truncate">{event.name}</span>
                {continuesToNextMonth && (
                    <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60 ml-auto" />
                )}
            </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <MonthlyTooltipContent event={event} exactStartTime={exactStartTimeUTC} exactEndTime={exactEndTimeUTC} timeMode={timeMode} timeFormat={timeFormat} />
                </div>,
                document.body
            )}
        </>
    );
};

export default function MonthlyTimeline({ timeMode = 'game', timeFormat = '24h' }: { timeMode?: TimeDisplayMode; timeFormat?: TimeFormat }) {
    const { isCategoryEnabled } = useEventPreferences();
    const { isEventCompleted: isMonthlyEventCompletedBase, toggleEventCompletion: toggleMonthlyEventCompletion, resetMonth, mounted: monthlyCompletionsMounted } = useMonthlyCompletions();
    const [now, setNow] = useState<Date | null>(null);
    
    // Wrap isEventCompleted to respect timezone - only show as completed if event has ended in the selected timezone
    const isMonthlyEventCompleted = useCallback((eventName: string, range: { start: string; end?: string }, event?: GameEvent) => {
        // Check if it's marked as completed
        if (!isMonthlyEventCompletedBase(eventName, range)) {
            return false;
        }
        
        // If marked as completed, verify the event has ended in the selected timezone
        if (range.end && now && event) {
            // Get the event's actual end time
            const exactEndTimeUTC = getEventEndTime(event, range.end);
            
            // Get current time in the display timezone
            const currentTimeInDisplayTimezone = timeMode === 'local' ? now : getGameTime(now);
            
            // Get event end time in the display timezone
            const endTimeInDisplayTimezone = timeMode === 'local' ? toLocalTime(exactEndTimeUTC) : exactEndTimeUTC;
            
            // Only show as completed if the event has actually ended in the display timezone
            return currentTimeInDisplayTimezone >= endTimeInDisplayTimezone;
        }
        
        // If no end date or no current time, just use the stored completion status
        return true;
    }, [isMonthlyEventCompletedBase, timeMode, now]);

    const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);

    useEffect(() => {
        setNow(new Date());
    }, []);

    const gameNow = useMemo(() => now ? getGameTime(now) : new Date(), [now]);
    // Calculate display time based on timeMode
    const displayNow = useMemo(() => {
        if (!now) return new Date();
        return timeMode === 'local' ? now : gameNow;
    }, [now, timeMode, gameNow]);

    const monthStart = useMemo(() => {
        const d = new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth(), 1));
        return d;
    }, [currentMonthDate]);
    
    const daysInMonth = useMemo(() => getDaysInMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth()), [monthStart]);

    // Calculate isCurrentMonth and todayIndex using display timezone
    const isCurrentMonth = useMemo(() => {
        if (timeMode === 'local') {
            const localNow = now || new Date();
            return monthStart.getUTCFullYear() === localNow.getFullYear() &&
                   monthStart.getUTCMonth() === localNow.getMonth();
        } else {
            return monthStart.getUTCFullYear() === gameNow.getUTCFullYear() &&
                   monthStart.getUTCMonth() === gameNow.getUTCMonth();
        }
    }, [monthStart, timeMode, now, gameNow]);
    
    const todayIndex = useMemo(() => {
        if (!isCurrentMonth) return -1;
        if (timeMode === 'local' && now) {
            // Get the day of month in local time
            const localDate = now.getDate();
            // Month start is always in UTC, so we need to compare properly
            const localMonth = now.getMonth();
            const localYear = now.getFullYear();
            if (monthStart.getUTCFullYear() === localYear && monthStart.getUTCMonth() === localMonth) {
                return localDate - 1;
            }
            return -1;
        } else {
            return gameNow.getUTCDate() - 1;
        }
    }, [isCurrentMonth, timeMode, now, gameNow, monthStart]);

    const { dungeonUnlockEvents, raidUnlockEvents, roguelikeEvents, otherEvents } = useMemo(() => {
        const viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 5,0,0));
        const viewMonthEnd = new Date(viewMonthStart);
        viewMonthEnd.setUTCMonth(viewMonthEnd.getUTCMonth() + 1);
        
        // Filter out deprecated patrols from monthly view
        const deprecatedPatrols = ['Ancient City Patrol', 'Brigand Camp Patrol'];

        const checkRange = (range: {start?: string, end?: string}, event?: GameEvent) => {
            if (!range.start) return false; // Must have start date for monthly
            const eventStart = new Date(range.start + 'T00:00:00Z');
            // Default to 5 AM game time (7 AM UTC) if event has no specific schedule
            if (event && event.schedule.type === 'none') {
                eventStart.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC
            }
            const eventEnd = range.end ? new Date(range.end + 'T00:00:00Z') : null;
            if (eventEnd) {
                // Events without specific times end at 5 AM game time (7 AM UTC) on the day after the end date
                if (event && event.schedule.type === 'none') {
                    eventEnd.setUTCDate(eventEnd.getUTCDate() + 1);
                    eventEnd.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC on the next day
                }
                if(eventStart >= viewMonthEnd || eventEnd <= viewMonthStart) return false;
             } else { // Only has a start date (permanent content)
                if (eventStart >= viewMonthEnd) return false;
             }
             return true;
        }

        const prefilteredEvents = filterEventsByPreferences(events, isCategoryEnabled);
        const allEvents = prefilteredEvents
            .filter(e => {
                if (deprecatedPatrols.includes(e.name)) return false;
                if (!e.dateRange && !e.dateRanges) return false;

                if (e.dateRanges) {
                    return e.dateRanges.some(range => checkRange(range, e));
                }
                if (e.dateRange) {
                    return checkRange(e.dateRange, e);
                }
                return false;
            })
            .sort((a,b) => {
                const getFirstDate = (event: GameEvent) => {
                    const dateStr = event.dateRanges ? event.dateRanges[0].start : event.dateRange!.start;
                    return new Date(dateStr!).getTime();
                }

                const startTimeA = getFirstDate(a);
                const startTimeB = getFirstDate(b);

                if (startTimeA !== startTimeB) {
                    return startTimeA - startTimeB;
                }

                // If start times are the same, sort by end time
                const getEndDate = (event: GameEvent) => {
                    if (event.dateRanges) {
                        const lastRange = event.dateRanges[event.dateRanges.length - 1];
                        return lastRange.end ? new Date(lastRange.end).getTime() : Infinity;
                    }
                    return event.dateRange?.end ? new Date(event.dateRange.end).getTime() : Infinity;
                }

                const endTimeA = getEndDate(a);
                const endTimeB = getEndDate(b);

                return endTimeA - endTimeB;
            });
        
        return {
            dungeonUnlockEvents: allEvents.filter(e => e.category === 'Dungeon Unlock'),
            raidUnlockEvents: allEvents.filter(e => e.category === 'Raid Unlock'),
            roguelikeEvents: allEvents.filter(e => e.category === 'Roguelike'),
            otherEvents: allEvents.filter(e => e.category !== 'Dungeon Unlock' && e.category !== 'Raid Unlock' && e.category !== 'Roguelike'),
        }
    }, [monthStart, isCategoryEnabled]);

    const releaseDate = new Date('2025-10-09T00:00:00Z');
    const canGoBack = useMemo(() => {
        const firstDayOfCurrentMonth = new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth(), 1));
        const firstDayOfReleaseMonth = new Date(Date.UTC(releaseDate.getUTCFullYear(), releaseDate.getUTCMonth(), 1));
        return firstDayOfCurrentMonth > firstDayOfReleaseMonth;
    }, [currentMonthDate, releaseDate]);


    const changeMonth = (amount: number) => {
        if (amount < 0 && !canGoBack) return;
        hasScrolledRef.current = false;
        setCurrentMonthDate(prev => {
            const newDate = new Date(prev);
            newDate.setUTCMonth(newDate.getUTCMonth() + amount, 1);
            return newDate;
        });
    };

    useEffect(() => {
        if (isCurrentMonth && timelineContainerRef.current && !hasScrolledRef.current) {
            const container = timelineContainerRef.current;
            const containerWidth = container.scrollWidth;
            const dayWidth = containerWidth / daysInMonth;
            
            // Calculate the position of the middle of the current day
            const scrollPosition = (todayIndex + 0.5) * dayWidth - container.offsetWidth / 2;

            container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
            hasScrolledRef.current = true;
        }
    }, [isCurrentMonth, todayIndex, daysInMonth]);
    
    const legendItems = useMemo(() => {
        const items = new Map<string, { icon: React.ElementType, colors: {bg: string, border: string} }>();
        const allEvents = [...dungeonUnlockEvents, ...raidUnlockEvents, ...roguelikeEvents, ...otherEvents];
        allEvents.forEach(event => {
            let legendName = '';
            let icon : React.ElementType | undefined;
            let colors: {bg: string, border: string} | undefined;

            if (event.seasonalCategory && SeasonalCategoryIcons[event.seasonalCategory]) {
                legendName = event.seasonalCategory;
                icon = SeasonalCategoryIcons[event.seasonalCategory];
                colors = SeasonalCategoryColors[event.seasonalCategory];
            } else if (CategoryIcons[event.category]) {
                legendName = event.category.replace(/([A-Z])/g, ' $1').trim();
                icon = CategoryIcons[event.category];
                colors = CategoryColors[event.category];
            }

            if (legendName && icon && colors && !items.has(legendName)) {
                items.set(legendName, {
                    icon: icon,
                    colors: colors,
                });
            }
        });
        
        return Array.from(items.entries());
    }, [dungeonUnlockEvents, raidUnlockEvents, roguelikeEvents, otherEvents]);

    if (!now) {
      return (
        <Card className="p-4 space-y-4 w-full min-h-[400px] flex items-center justify-center">
          <p>Loading monthly calendar...</p>
        </Card>
      );
    }
    
    return (
            <Card className="p-4 space-y-4 w-full">
                <div className="flex justify-between items-center">
                    <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} disabled={!canGoBack}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="text-lg font-semibold text-center">
                        {format(monthStart, 'MMMM yyyy')}
                    </h3>
                    <div className="flex items-center gap-2">
                        {monthlyCompletionsMounted && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => resetMonth(monthStart)}
                                className="h-7 px-2 gap-1.5"
                            >
                                <RotateCcw className="h-3 w-3" />
                                <span className="text-xs">Reset</span>
                            </Button>
                        )}
                        <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div ref={timelineContainerRef} className="w-full overflow-x-auto pb-4 relative">
                    <div className="relative w-full min-w-[1200px]">
                        {/* Day Markers Header */}
                        <div className="sticky top-0 bg-card z-20">
                            <div className="relative h-14 grid" style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))`}}>
                                {Array.from({ length: daysInMonth }).map((_, day) => {
                                    const dayNumber = day + 1;
                                    const date = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), dayNumber));
                                    const dayOfWeek = date.getUTCDay();
                                    const isWeekStart = dayOfWeek === 1; // Monday

                                    return (
                                        <div
                                            key={day}
                                            className={cn(
                                                "flex flex-col items-center justify-start text-center border-r border-border/50",
                                                day === todayIndex && "bg-accent/10"
                                            )}
                                        >
                                            <span className={cn("text-xs font-semibold pt-1", isWeekStart ? "text-foreground" : "text-muted-foreground")}>
                                                {DAY_NAMES[dayOfWeek]}
                                            </span>
                                            <span className="text-sm font-bold">
                                                {dayNumber}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Event Rows */}
                        <div className="relative space-y-1 py-2">
                             {dungeonUnlockEvents.length > 0 && (
                               <div className="relative h-9">
                                  {dungeonUnlockEvents.map((event, index) => (
                                      <MonthlyEventBar 
                                          key={`dungeon-${event.name}-${index}`} 
                                          event={event} 
                                          range={event.dateRange!} 
                                          monthStart={monthStart} 
                                          daysInMonth={daysInMonth}
                                          isCompleted={monthlyCompletionsMounted && isMonthlyEventCompleted(event.name, event.dateRange!, event)}
                                          onToggleCompletion={() => toggleMonthlyEventCompletion(event.name, event.dateRange!)}
                                          currentTime={now!}
                                          timeMode={timeMode}
                                          timeFormat={timeFormat}
                                      />
                                  ))}
                               </div>
                             )}
                             {raidUnlockEvents.length > 0 && (
                              <div className="relative h-9">
                                  {raidUnlockEvents.map((event, index) => (
                                      <MonthlyEventBar 
                                          key={`raid-${event.name}-${index}`} 
                                          event={event} 
                                          range={event.dateRange!} 
                                          monthStart={monthStart} 
                                          daysInMonth={daysInMonth}
                                          isCompleted={monthlyCompletionsMounted && isMonthlyEventCompleted(event.name, event.dateRange!, event)}
                                          onToggleCompletion={() => toggleMonthlyEventCompletion(event.name, event.dateRange!)}
                                          currentTime={now!}
                                          timeMode={timeMode}
                                          timeFormat={timeFormat}
                                      />
                                  ))}
                               </div>
                             )}
                             {roguelikeEvents.length > 0 && (
                              <div className="relative h-9">
                                  {roguelikeEvents.map((event, index) => (
                                      <MonthlyEventBar 
                                          key={`roguelike-${event.name}-${index}`} 
                                          event={event} 
                                          range={event.dateRange!} 
                                          monthStart={monthStart} 
                                          daysInMonth={daysInMonth}
                                          isCompleted={monthlyCompletionsMounted && isMonthlyEventCompleted(event.name, event.dateRange!, event)}
                                          onToggleCompletion={() => toggleMonthlyEventCompletion(event.name, event.dateRange!)}
                                          currentTime={now!}
                                          timeMode={timeMode}
                                          timeFormat={timeFormat}
                                      />
                                  ))}
                               </div>
                             )}
                             {otherEvents.map((event, index) => (
                                <div key={`${event.name}-${index}`} className="relative h-9">
                                    {event.dateRanges ? (
                                      <Fragment>
                                        {event.dateRanges.map((range, rangeIndex) => (
                                          <MonthlyEventBar 
                                            key={`${event.name}-${index}-range-${rangeIndex}`}
                                            event={event} 
                                            range={range}
                                            monthStart={monthStart} 
                                            daysInMonth={daysInMonth}
                                            isCompleted={monthlyCompletionsMounted && isMonthlyEventCompleted(event.name, range, event)}
                                            onToggleCompletion={() => toggleMonthlyEventCompletion(event.name, range)}
                                            currentTime={now!}
                                            timeMode={timeMode}
                                            timeFormat={timeFormat}
                                          />
                                        ))}
                                      </Fragment>
                                    ) : event.dateRange ? (
                                      <MonthlyEventBar 
                                        key={`${event.name}-${index}`}
                                        event={event} 
                                        range={event.dateRange}
                                        monthStart={monthStart} 
                                        daysInMonth={daysInMonth}
                                        isCompleted={monthlyCompletionsMounted && event.dateRange && isMonthlyEventCompleted(event.name, event.dateRange, event)}
                                        onToggleCompletion={() => event.dateRange && toggleMonthlyEventCompletion(event.name, event.dateRange)}
                                        currentTime={now!}
                                        timeMode={timeMode}
                                        timeFormat={timeFormat}
                                      />
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        
                        {/* Current Time Indicator */}
                        {isCurrentMonth && now && (() => {
                            // Calculate month boundaries in display timezone
                            let viewMonthStart: Date;
                            let viewMonthEnd: Date;
                            
                            if (timeMode === 'local') {
                                const localMonthStart = new Date(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 0, 0, 0);
                                viewMonthStart = new Date(localMonthStart.getTime());
                                const lastDay = new Date(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0);
                                viewMonthEnd = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59);
                            } else {
                                viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 0, 0, 0));
                                viewMonthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59));
                            }
                            
                            // Calculate position of current time within the month
                            const monthStartTimestamp = viewMonthStart.getTime();
                            const monthDurationMs = viewMonthEnd.getTime() - monthStartTimestamp;
                            const currentOffsetMs = displayNow.getTime() - monthStartTimestamp;
                            const currentTimePercent = (currentOffsetMs / monthDurationMs) * 100;
                            
                            // Only show if current time is within this month
                            if (currentTimePercent >= 0 && currentTimePercent <= 100) {
                                const timeFormatStr = timeFormat === '12h' ? 'hh:mm a' : 'HH:mm';
                                const timeStr = timeMode === 'game'
                                    ? displayNow.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: timeFormat === '12h', hour: '2-digit', minute: '2-digit' })
                                    : format(displayNow, timeFormatStr);
                                
                                return (
                                    <div
                                        className="absolute top-0 h-full w-0.5 bg-accent z-30 pointer-events-none"
                                        style={{ left: `${currentTimePercent}%` }}
                                    >
                                        <div className="absolute -top-5 -translate-x-1/2 text-xs font-bold text-accent bg-background px-1 rounded whitespace-nowrap">
                                            {timeStr}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>

                <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-2">Legend</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {legendItems.map(([name, { icon: Icon, colors }]) => {
                             return (
                                <div key={name} className="flex items-center gap-2 text-xs">
                                    <div className={cn("h-4 w-4 rounded-sm", colors.bg, colors.border)} />
                                    <span className="font-semibold">{name}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                 {!isCurrentMonth && (
                    <Button onClick={() => setCurrentMonthDate(new Date())} className="w-full">
                        Jump to Current Month
                    </Button>
                 )}
            </Card>
    );
}
