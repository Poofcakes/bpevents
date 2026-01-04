

"use client";

import { useMemo, Fragment, useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Star, Swords, Zap, Crown, Gamepad2, Footprints, Users, Gift, UtensilsCrossed, HeartHandshake, ShieldCheck, Clock, KeySquare, Trophy, ChevronLeft, ChevronRight, BrainCircuit, ShieldAlert, RotateCcw, Ghost, CalendarHeart, Target } from 'lucide-react';
import { getGameTime, getWeekPeriod, getGameDate, toLocalTime, DAILY_RESET_HOUR_UTC, GAME_TIMEZONE_OFFSET } from '@/lib/time';
import { format, getWeek, isSameDay, startOfDay, differenceInCalendarWeeks, addDays, differenceInDays } from 'date-fns';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { useWeeklyCompletions } from '@/hooks/useWeeklyCompletions';
import { useDailyCompletions } from '@/hooks/useDailyCompletions';
import { TimeDisplayMode, TimeFormat } from '@/app/page';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GAME_LAUNCH_DATE = new Date('2025-10-09T05:00:00Z'); // Game launches at reset time on Thursday Oct 9th.
// The ISO week for Oct 9, 2025 starts on Monday, Oct 6, 2025
const GAME_LAUNCH_WEEK_START = new Date('2025-10-06T00:00:00Z');

// Constants for hour-based positioning
const HOURS_IN_WEEK = 7 * 24; // 168 hours
// Use percentage-based positioning for weekly timeline instead of pixels

// Helper to get exact start time for an event on a date (UTC, after converting from UTC-2)
const getEventStartTime = (event: GameEvent, dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    
    if (event.schedule.type === 'none') {
        // Events without specific times start at 5 AM game time (7 AM UTC)
        date.setUTCHours(7, 0, 0, 0);
        return date;
    }
    
    // For events with schedules, use the first occurrence time of the day
    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        const intervals = event.schedule.intervals;
        if (intervals && intervals.length > 0) {
            date.setUTCHours(intervals[0].start.hour + 2, intervals[0].start.minute, 0, 0);
            return date;
        }
    }
    if (event.schedule.type === 'daily-specific') {
        const times = event.schedule.times;
        if (times && times.length > 0) {
            date.setUTCHours(times[0].hour + 2, times[0].minute, 0, 0);
            return date;
        }
    }
    
    // Default to 5 AM game time (7 AM UTC)
    date.setUTCHours(7, 0, 0, 0);
    return date;
};

// Helper to get exact end time for an event on a date (UTC, after converting from UTC-2)
const getEventEndTime = (event: GameEvent, dateString: string): Date => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    
    if (event.schedule.type === 'none') {
        // Events without specific times end at 5 AM game time (7 AM UTC) on the end date itself
        date.setUTCHours(7, 0, 0, 0);
        return date;
    }
    
    // For events with schedules, use the last occurrence end time of the day
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        const intervals = event.schedule.intervals;
        if (intervals && intervals.length > 0) {
            const lastInterval = intervals[intervals.length - 1];
            const endHourUTC = lastInterval.end.hour + 2;
            date.setUTCHours(endHourUTC, lastInterval.end.minute, 0, 0);
            // Handle midnight crossover (hour >= 24)
            if (endHourUTC >= 24) {
                date.setUTCDate(date.getUTCDate() + 1);
                date.setUTCHours(endHourUTC - 24, lastInterval.end.minute, 0, 0);
            }
            return date;
        }
    }
    if (event.schedule.type === 'daily-specific') {
        const times = event.schedule.times;
        if (times && times.length > 0 && event.durationMinutes) {
            const lastTime = times[times.length - 1];
            date.setUTCHours(lastTime.hour + 2, lastTime.minute, 0, 0);
            date.setUTCMinutes(date.getUTCMinutes() + event.durationMinutes);
            return date;
        }
    }
    
    // Default to 5 AM game time (7 AM UTC) on the end date itself
    date.setUTCHours(7, 0, 0, 0);
    return date;
};

// Weekly hour-based event bar component (similar to MonthlyEventBar)
const WeeklyHourEventBar = memo(({ 
    event, 
    occurrence, 
    range,
    weekStart, 
    weekEnd,
    isCompleted,
    onToggleCompletion,
    currentTime,
    timeMode,
    timeFormat,
    selectedTimezone
}: {
    event: GameEvent;
    occurrence: { start: Date; end?: Date };
    range: { start: string; end?: string };
    weekStart: Date;
    weekEnd: Date;
    isCompleted: boolean;
    onToggleCompletion: () => void;
    currentTime: Date;
    timeMode: TimeDisplayMode;
    timeFormat: TimeFormat;
    selectedTimezone?: string;
}) => {
    const [mounted, setMounted] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const [tooltipDimensions, setTooltipDimensions] = useState({ width: 0, height: 0 });
    
    useEffect(() => {
        setMounted(true);
    }, []);
    
    useEffect(() => {
        if (tooltipRef.current && isHovered) {
            const updateDimensions = () => {
                if (tooltipRef.current) {
                    const rect = tooltipRef.current.getBoundingClientRect();
                    setTooltipDimensions({ width: rect.width, height: rect.height });
                }
            };
            const timeoutId = setTimeout(updateDimensions, 0);
            return () => clearTimeout(timeoutId);
        }
    }, [isHovered]);
    
    // Convert to display time (local or game time) based on timeMode
    const exactStartTimeUTC = occurrence.start;
    const exactEndTimeUTC = occurrence.end || null;
    const exactStartTime = timeMode === 'local' ? toLocalTime(exactStartTimeUTC) : exactStartTimeUTC;
    const exactEndTime = exactEndTimeUTC ? (timeMode === 'local' ? toLocalTime(exactEndTimeUTC) : exactEndTimeUTC) : null;
    
    // Calculate week boundaries in the display timezone
    let viewWeekStart: Date;
    let viewWeekEnd: Date;
    
    if (timeMode === 'local') {
        // For local time, convert week boundaries
        viewWeekStart = toLocalTime(weekStart);
        viewWeekEnd = toLocalTime(weekEnd);
    } else {
        // For game time, use UTC week boundaries directly
        viewWeekStart = new Date(weekStart);
        viewWeekEnd = new Date(weekEnd);
    }
    
    // Clamp to week boundaries for display
    const displayStartTime = exactStartTime < viewWeekStart ? viewWeekStart : exactStartTime;
    const displayEndTime = exactEndTime && exactEndTime > viewWeekEnd ? viewWeekEnd : (exactEndTime || viewWeekEnd);
    
    // If the event is not in this week, don't render it
    if (displayEndTime < viewWeekStart || displayStartTime > viewWeekEnd) return null;
    
    // Calculate position based on hour precision: position as fraction of week duration
    const weekStartTimestamp = viewWeekStart.getTime();
    const weekDurationMs = viewWeekEnd.getTime() - weekStartTimestamp;
    const startOffsetMs = displayStartTime.getTime() - weekStartTimestamp;
    const durationMs = displayEndTime.getTime() - displayStartTime.getTime();
    
    const leftPercent = (startOffsetMs / weekDurationMs) * 100;
    const widthPercent = (durationMs / weekDurationMs) * 100;
    
    // For point events (like boarlets), adjust left position to account for icon width
    // Icon is positioned at -1.25rem (-20px) relative to badge, so we shift badge slightly right
    // to align the icon center with the timeline marker
    const isPointEvent = !occurrence.end || durationMs < 60000; // Less than 1 minute
    // Approximate icon width as a small percentage of week (20px / ~1000px container ≈ 0.02%)
    // But we'll use a more conservative shift to align icon center with marker
    const iconOffsetPercent = isPointEvent ? 0.015 : 0; // ~1.5% shift for point events
    
    // Don't show active state for weekly timeline - events show time ranges, not continuous active state
    // Events may have multiple intervals, so showing "active" would be misleading
    const isActive = false;
    
    // Check if event spans across week boundaries
    const startedInPreviousWeek = exactStartTime < viewWeekStart;
    const continuesToNextWeek = exactEndTime && exactEndTime > viewWeekEnd;
    
    let Icon: React.ElementType = Star;
    let colorClass = 'bg-secondary';
    
    // Use category colors first, then seasonal if no category icon
    if (CategoryIcons[event.category]) {
        Icon = CategoryIcons[event.category];
        colorClass = CategoryColors[event.category] || 'bg-secondary';
    } else if (event.seasonalCategory && SeasonalCategoryIcons[event.seasonalCategory]) {
        Icon = SeasonalCategoryIcons[event.seasonalCategory];
        const seasonalColors = SeasonalCategoryColors[event.seasonalCategory];
        colorClass = `${seasonalColors.bg} ${seasonalColors.border}`;
    }
    
    const tooltipStyle = useMemo(() => {
        if (!mousePos) return { position: 'fixed' as const, left: '-9999px', top: '-9999px' };
        
        const offset = 10;
        let leftPos = mousePos.x + offset;
        let topPos = mousePos.y + offset;
        
        if (tooltipDimensions.width > 0) {
            if (leftPos + tooltipDimensions.width > window.innerWidth) {
                leftPos = mousePos.x - tooltipDimensions.width - offset;
            }
            if (topPos + tooltipDimensions.height > window.innerHeight) {
                topPos = mousePos.y - tooltipDimensions.height - offset;
            }
        }
        
        leftPos = Math.max(offset, Math.min(leftPos, window.innerWidth - (tooltipDimensions.width || 200) - offset));
        topPos = Math.max(offset, Math.min(topPos, window.innerHeight - (tooltipDimensions.height || 100) - offset));
        
        return {
            position: 'fixed' as const,
            left: `${leftPos}px`,
            top: `${topPos}px`,
            zIndex: 999999,
            pointerEvents: 'none' as const,
        };
    }, [mousePos, tooltipDimensions]);
    
    return (
        <>
            <div
                className="absolute"
                style={{
                    left: `${leftPercent + iconOffsetPercent}%`,
                    width: `${widthPercent}%`,
                }}
                onMouseEnter={(e) => {
                    setIsHovered(true);
                    setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => {
                    setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                    setMousePos(null);
                }}
                onClick={(e) => {
                    // Prevent clicks on the bar itself from doing anything
                    // Only allow clicks on the checkbox to work
                    const target = e.target as HTMLElement;
                    if (!target.closest('[role="checkbox"]') && !target.closest('button')) {
                        e.stopPropagation();
                    }
                }}
            >
                <Icon className="h-4 w-4 flex-shrink-0 absolute" style={{ left: '-1.25rem', top: '50%', transform: 'translateY(-50%)', ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 }) }} />
                <div
                    className={cn(
                        "h-7 rounded-md px-2 py-0.5 flex items-center gap-1.5 text-xs font-semibold cursor-default border transition-all duration-200",
                        colorClass,
                        startedInPreviousWeek && continuesToNextWeek ? "rounded-none" : "",
                        !startedInPreviousWeek && !continuesToNextWeek ? "rounded-lg" : "",
                        isActive && "ring-2 ring-white shadow-lg shadow-white/20"
                    )}
                    style={{
                        width: '100%',
                        minWidth: '24px',
                        ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 }),
                        pointerEvents: 'auto'
                    }}
                >
                    {startedInPreviousWeek && (
                        <ChevronLeft className="h-3 w-3 flex-shrink-0 opacity-60" />
                    )}
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="flex items-center"
                        style={{ pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                    >
                        <Checkbox
                            checked={isCompleted}
                            onCheckedChange={(checked) => {
                                if (checked !== 'indeterminate') {
                                    onToggleCompletion();
                                }
                            }}
                            className="h-3 w-3 flex-shrink-0 mr-1"
                        />
                    </div>
                    <span className="truncate">{event.name}</span>
                    {event.seasonalCategory && (() => {
                        const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                        return SeasonalIcon ? (
                            <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70 ml-auto" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                        ) : null;
                    })()}
                    {continuesToNextWeek && (
                        <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60 ml-auto" />
                    )}
                </div>
            </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <WeeklyHourTooltipContent 
                        event={event} 
                        exactStartTime={exactStartTimeUTC} 
                        exactEndTime={exactEndTimeUTC} 
                        timeMode={timeMode} 
                        timeFormat={timeFormat}
                        selectedTimezone={selectedTimezone}
                    />
                </div>,
                document.body
            )}
        </>
    );
});
WeeklyHourEventBar.displayName = 'WeeklyHourEventBar';

// Tooltip content for weekly hour-based events
const WeeklyHourTooltipContent = memo(({ event, exactStartTime, exactEndTime, timeMode, timeFormat, selectedTimezone }: { event: GameEvent; exactStartTime: Date; exactEndTime: Date | null; timeMode: TimeDisplayMode; timeFormat: TimeFormat; selectedTimezone?: string }) => {
    const [now, setNow] = useState<Date | null>(null);
    
    useEffect(() => {
        setNow(new Date());
        const timerId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);
    
    const dateFormat = 'MMM d, yyyy';
    const timeFormatStr = timeFormat === '12h' ? 'hh:mm a' : 'HH:mm';
    
    // Validate dates before formatting
    const isValidStart = exactStartTime && !isNaN(exactStartTime.getTime());
    const isValidEnd = exactEndTime && !isNaN(exactEndTime.getTime());
    
    // exactStartTime and exactEndTime are stored in UTC (after adding 2 hours from UTC-2)
    // Always use selectedTimezone for formatting
    // When game time is on, selectedTimezone is 'Etc/GMT+2' (UTC-2)
    // When local time is on, selectedTimezone is the user's selected timezone
    // If selectedTimezone is not provided, fall back to system timezone
    const tz = selectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    const dateOptions: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: tz
    };
    
    const timeOptions: Intl.DateTimeFormatOptions = {
        hour12: timeFormat === '12h',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz
    };
    
    // Format dates and times directly using the UTC dates with the selected timezone
    // The timezone conversion is handled by toLocaleDateString/toLocaleTimeString
    const startDateStr = isValidStart 
        ? exactStartTime.toLocaleDateString('en-US', dateOptions)
        : 'Invalid date';
    const startTimeStr = isValidStart 
        ? exactStartTime.toLocaleTimeString('en-US', timeOptions)
        : '--:--';
    const endDateStr = isValidEnd 
        ? exactEndTime!.toLocaleDateString('en-US', dateOptions)
        : null;
    const endTimeStr = isValidEnd 
        ? exactEndTime!.toLocaleTimeString('en-US', timeOptions)
        : null;
    
    // Don't show timer information for weekly timeline - events show time ranges
    // Events may have multiple intervals, so showing "active" or timers would be misleading
    
    // Count how many intervals/times this event has within the timeframe
    let intervalCount: number | null = null;
    if (event.schedule) {
        if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
            intervalCount = 'intervals' in event.schedule ? event.schedule.intervals?.length || 0 : 0;
        } else if (event.schedule.type === 'daily-specific') {
            intervalCount = 'times' in event.schedule ? event.schedule.times?.length || 0 : 0;
        } else if (event.schedule.type === 'hourly' || event.schedule.type === 'multi-hourly') {
            // For hourly events, calculate how many times it occurs in the timeframe
            // This is approximate - we'll just indicate it happens multiple times
            intervalCount = 2; // Indicates multiple occurrences
        }
    }
    
    return (
        <div className="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg max-w-xs">
            <p className="font-bold">{event.name}</p>
            <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2">
                {exactEndTime && isValidEnd ? (
                    <p>
                        {intervalCount && intervalCount > 1 
                            ? `Happens ${intervalCount} times between ${startDateStr} ${startTimeStr} and ${endDateStr} ${endTimeStr}`
                            : `Occurs between ${startDateStr} ${startTimeStr} and ${endDateStr} ${endTimeStr}`
                        }
                    </p>
                ) : (
                    <p>Became available on {startDateStr} {startTimeStr}</p>
                )}
            </div>
            <p className="text-xs italic text-muted-foreground max-w-xs mt-2">{event.description}</p>
        </div>
    );
});
WeeklyHourTooltipContent.displayName = 'WeeklyHourTooltipContent';

// Reusable tooltip content component
const WeeklyTooltipContent = memo(({ event, timeSummary }: { event: GameEvent; timeSummary: string }) => {
    const dateFormat = 'MMM d, yyyy';
    
    return (
        <div className="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg max-w-xs">
            <p className="font-bold">{event.name}</p>
            {timeSummary && <p className="text-sm text-muted-foreground">{timeSummary}</p>}
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
WeeklyTooltipContent.displayName = 'WeeklyTooltipContent';

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
    'Season 2 Warmup': Star,
    'Season 1': Star,
    'Season 2': Star,
};

const SeasonalCategoryColors: Record<NonNullable<GameEvent['seasonalCategory']>, {bg: string, border: string}> = {
    'Kanamia Harvest Festival': { bg: 'bg-orange-400/80', border: 'border-orange-400' },
    'Halloween': { bg: 'bg-orange-500/80', border: 'border-orange-500' },
    'Winter Fest': { bg: 'bg-red-500/80', border: 'border-red-500' },
    'Silverstar Carnival': { bg: 'bg-blue-400/80', border: 'border-blue-400' },
    'Season 2 Warmup': { bg: 'bg-purple-400/80', border: 'border-purple-400' },
    'Season 1': { bg: 'bg-blue-500/80', border: 'border-blue-500' },
    'Season 2': { bg: 'bg-purple-500/80', border: 'border-purple-500' },
};


const isDailyEvent = (event: GameEvent) => {
    // Events with multiple date ranges (dateRanges) are specific date events, not "all week" events
    // e.g., Snow Nappo happens on Dec 24-27 and Dec 31-Jan 3, not every day of every week
    if (event.dateRanges) {
        return false;
    }
    
    const { schedule } = event;
    
    // Events that occur every day (hourly, multi-hourly, or daily-intervals)
    // These happen every day during their active period (if they have a single dateRange)
    // or all the time (if they have no dateRange)
    if (schedule.type === 'hourly' || schedule.type === 'multi-hourly' || schedule.type === 'daily-intervals') {
        return true;
    }
    
    // Events that occur on all 7 days of the week
    // Check if days array includes all 7 days (0-6)
    if (schedule.type === 'daily-specific' || schedule.type === 'daily-intervals-specific') {
        const days = schedule.days || [];
        // Check if all 7 days (0-6) are present
        const allDays = [0, 1, 2, 3, 4, 5, 6];
        const hasAllDays = allDays.every(day => days.includes(day));
        if (hasAllDays && days.length === 7) {
        return true;
    }
    }
    
    return false;
}

const WeeklyEvent = ({ event, isCompleted, onToggleCompletion, isCurrentWeek, timeFormat }: { event: GameEvent, isCompleted: boolean | undefined, onToggleCompletion: () => void, isCurrentWeek: boolean, timeFormat: TimeFormat }) => {
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
    
    const Icon = CategoryIcons[event.category] || Star;
    const colorClass = CategoryColors[event.category] || 'bg-secondary';
    const timeZone = 'UTC'; // Weekly is always game time

    let timeSummary = '';
    const schedule = event.schedule;
    const dateFormat = 'MMM d, yyyy';
    
    if (schedule.type === 'daily-specific') {
        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
        // Then format as UTC to display game time (since Weekly is always game time)
        const uniqueTimes = [...new Set(schedule.times.map(t => {
            const d = new Date();
            d.setUTCHours(t.hour + 2, t.minute); // Convert UTC-2 to UTC
            // Format as UTC to show game time (subtract 2 hours by formatting the UTC-2 equivalent)
            const gameTime = new Date(d.getTime() - (2 * 60 * 60 * 1000)); // Subtract 2 hours to show UTC-2
            return gameTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
        }))];
        timeSummary = uniqueTimes.slice(0, 2).join(', ') + (uniqueTimes.length > 2 ? '...' : '');
    } else if (schedule.type === 'multi-hourly') {
        timeSummary = `Every ${schedule.hours}h`;
    } else if (schedule.type === 'hourly') {
        timeSummary = `Every hour at :${String(schedule.minute).padStart(2, '0')}`;
    } else if (schedule.type === 'daily-intervals' || schedule.type === 'daily-intervals-specific') {
        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
        // Then format as UTC to display game time (since Weekly is always game time)
         const uniqueTimes = [...new Set(schedule.intervals.map(t => {
            const d = new Date();
            d.setUTCHours(t.start.hour + 2, t.start.minute); // Convert UTC-2 to UTC
            // Format as UTC to show game time (subtract 2 hours by formatting the UTC-2 equivalent)
            const gameTime = new Date(d.getTime() - (2 * 60 * 60 * 1000)); // Subtract 2 hours to show UTC-2
            return gameTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
        }))];
        timeSummary = uniqueTimes.slice(0, 2).join(', ') + (uniqueTimes.length > 2 ? '...' : '');
    }

    return (
        <>
            <div 
                className={cn(
                    "rounded-md px-2 py-1 flex items-center gap-2 text-xs font-semibold cursor-default h-7", 
                    colorClass
                )}
                style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined}
                onMouseEnter={(e) => {
                    setIsHovered(true);
                    setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                    setMousePos(null);
                }}
            >
                <div className="w-3 flex-shrink-0 flex items-center">
                    {isCurrentWeek && (
                        <Checkbox
                            checked={isCompleted}
                            onCheckedChange={(checked) => {
                                if (checked !== 'indeterminate') {
                                    onToggleCompletion();
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3 w-3"
                        />
                    )}
                </div>
                <Icon className="h-3 w-3 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                <div className="flex items-center gap-2">
                    <div className={cn("text-xs font-bold whitespace-nowrap px-2 py-0.5 rounded-full border", colorClass)} style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined}>
                        {event.name}
                    </div>
                    </div>
                {event.seasonalCategory && (() => {
                    const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                    return SeasonalIcon ? (
                        <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                    ) : null;
                })()}
                {(event.dateRange || event.dateRanges) && (
                    <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        )}
                    </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <WeeklyTooltipContent event={event} timeSummary={timeSummary} />
                </div>,
                document.body
            )}
        </>
    );
};

const WeeklyEventBar = ({ event, daySpans, weekDates, calendarWeekStart, isCompleted, onToggleCompletion, isCurrentWeek, timeFormat }: { event: GameEvent; daySpans: number[]; weekDates: Date[]; calendarWeekStart: Date; isCompleted: boolean | undefined; onToggleCompletion: () => void; isCurrentWeek: boolean; timeFormat: TimeFormat }) => {
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
    
    const Icon = CategoryIcons[event.category] || Star;
    const colorClass = CategoryColors[event.category] || 'bg-secondary';
    const timeZone = 'UTC';

    // Calculate actual start and end times for the event
    const firstDayDate = weekDates[daySpans[0]];
    const lastDayDate = weekDates[daySpans[daySpans.length - 1]];
    
    // Get the date strings for calculating event times
    const firstDayDateStr = `${firstDayDate.getUTCFullYear()}-${String(firstDayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(firstDayDate.getUTCDate()).padStart(2, '0')}`;
    const lastDayDateStr = `${lastDayDate.getUTCFullYear()}-${String(lastDayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(lastDayDate.getUTCDate()).padStart(2, '0')}`;
    
    // Calculate actual event start time on first day
    const eventStartTime = getEventStartTime(event, firstDayDateStr);
    
    // Calculate actual event end time on last day
    // For events with dateRange, use the range end date; otherwise use last day
    const endDateStr = event.dateRange?.end || lastDayDateStr;
    const eventEndTime = getEventEndTime(event, endDateStr);
    
    // Calculate week boundaries (Monday 00:00 to next Monday 00:00 for calendar week)
    const weekStartDate = new Date(weekDates[0]);
    weekStartDate.setUTCHours(0, 0, 0, 0);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
    
    // Calculate position and width based on actual event times
    const weekDurationMs = weekEndDate.getTime() - weekStartDate.getTime();
    const startOffsetMs = eventStartTime.getTime() - weekStartDate.getTime();
    const endOffsetMs = eventEndTime.getTime() - weekStartDate.getTime();
    
    // Clamp to week boundaries
    const clampedStartMs = Math.max(0, Math.min(startOffsetMs, weekDurationMs));
    const clampedEndMs = Math.max(0, Math.min(endOffsetMs, weekDurationMs));
    
    const left = `${(clampedStartMs / weekDurationMs) * 100}%`;
    const width = `${((clampedEndMs - clampedStartMs) / weekDurationMs) * 100}%`;

    let timeSummary = '';
    const schedule = event.schedule;
    const dateFormat = 'MMM d, yyyy';

    if (schedule.type === 'daily-intervals' || schedule.type === 'daily-intervals-specific') {
        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
        // Then format as UTC to display game time (since Weekly is always game time)
        timeSummary = schedule.intervals.map(iv => {
            const startUTC = new Date(0);
            startUTC.setUTCHours(iv.start.hour + 2, iv.start.minute); // Convert UTC-2 to UTC
            const endUTC = new Date(0);
            endUTC.setUTCHours(iv.end.hour + 2, iv.end.minute); // Convert UTC-2 to UTC
            // Format as UTC to show game time (subtract 2 hours by formatting the UTC-2 equivalent)
            const startGameTime = new Date(startUTC.getTime() - (2 * 60 * 60 * 1000));
            const endGameTime = new Date(endUTC.getTime() - (2 * 60 * 60 * 1000));
            const formatOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: timeFormat === '12h' };
            return `${startGameTime.toLocaleTimeString('en-US', formatOptions)} - ${endGameTime.toLocaleTimeString('en-US', formatOptions)}`;
        }).join(', ');
    } else if (schedule.type === 'daily-specific') {
        // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
        // Then format as UTC to display game time (since Weekly is always game time)
         const uniqueTimes = [...new Set(schedule.times.map(t => {
            const d = new Date();
            d.setUTCHours(t.hour + 2, t.minute); // Convert UTC-2 to UTC
            // Format as UTC to show game time (subtract 2 hours by formatting the UTC-2 equivalent)
            const gameTime = new Date(d.getTime() - (2 * 60 * 60 * 1000)); // Subtract 2 hours to show UTC-2
            return gameTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
        }))];
        timeSummary = uniqueTimes.join(', ');
    } else if (isDailyEvent(event)) {
        timeSummary = 'Resets daily';
    }

    return (
        <div className="px-px relative" style={{ paddingTop: '2px', paddingBottom: '2px'}}>
            <Icon className="h-4 w-4 flex-shrink-0 absolute" style={{ left: `calc(${left} - 1.25rem)`, top: '50%', transform: 'translateY(-50%)', ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 }) }} />
            <div
                className={cn("rounded-md px-2 py-1 flex items-center gap-2 text-xs font-semibold cursor-default h-7 absolute overflow-hidden", colorClass)}
                style={{ left, width, ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 }) }}
                onMouseEnter={(e) => {
                    setIsHovered(true);
                    setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                    setIsHovered(false);
                    setMousePos(null);
                }}
            >
                <div className="w-3 h-3 flex-shrink-0 flex items-center justify-center">
                    {(isCurrentWeek || isCompleted !== undefined) && (
                        <Checkbox
                            checked={isCompleted}
                            onCheckedChange={(checked) => {
                                if (checked !== 'indeterminate') {
                                    onToggleCompletion();
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3 w-3"
                        />
                        )}
                    </div>
                <span className="truncate min-w-0">{event.name}</span>
                {event.seasonalCategory && (() => {
                    const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                    return SeasonalIcon ? (
                        <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                    ) : null;
                })()}
                        {(event.dateRange || event.dateRanges) && (
                    <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                        </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <WeeklyTooltipContent event={event} timeSummary={timeSummary} />
                </div>,
                document.body
            )}
        </div>
    );
};


export default function WeeklyTimeline({ timeMode = 'game', timeFormat = '24h', selectedTimezone }: { timeMode?: TimeDisplayMode; timeFormat?: TimeFormat; selectedTimezone?: string }) {
    const { isCategoryEnabled } = useEventPreferences();
    const { isEventCompleted: isWeeklyEventCompleted, toggleEventCompletion: toggleWeeklyEventCompletion, resetWeek, mounted: weeklyCompletionsMounted } = useWeeklyCompletions();
    const { isEventCompleted: isDailyEventCompleted, toggleEventCompletion: toggleDailyEventCompletion, resetDay, mounted: dailyCompletionsMounted } = useDailyCompletions();
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [hideDaily, setHideDaily] = useState(false);
    const [hidePermanent, setHidePermanent] = useState(false);
    const [now, setNow] = useState<Date | null>(null);
    // Use selectedTimezone if provided, otherwise fall back to browser timezone
    const timezone = selectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Capture selectedTimezone in a const to ensure it's available in closures
    const tz = selectedTimezone;
    
    // This state is just to force a re-render when the user navigates,
    // ensuring the memoized calculations run again.
    const [_, setForceUpdate] = useState(0);

    useEffect(() => {
        setCurrentDate(getGameTime(new Date()));
        setNow(new Date());
        const timerId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    const changeWeek = (amount: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setUTCDate(newDate.getUTCDate() + (amount * 7));
            return newDate;
        });
        setForceUpdate(val => val + 1);
    };

    // Calculate game week start (Monday 5 AM UTC-2 = Monday 7 AM UTC)
    const gameWeekStart = useMemo(() => {
        // For game week: Monday 5 AM UTC-2 = Monday 7 AM UTC
        const gameNow = getGameTime(currentDate);
        // Get the Monday of the current week
        const monday = new Date(gameNow);
        monday.setUTCHours(0, 0, 0, 0);
        const dayOfWeek = (monday.getUTCDay() + 6) % 7; // Monday is 0
        monday.setUTCDate(monday.getUTCDate() - dayOfWeek);
        // Set to 5 AM game time (7 AM UTC)
        monday.setUTCHours(7, 0, 0, 0);
        
        // If current time is before Monday 5 AM, go back to previous Monday
        if (gameNow.getTime() < monday.getTime()) {
            monday.setUTCDate(monday.getUTCDate() - 7);
        }
        return monday;
    }, [currentDate]);

    const gameWeekEnd = useMemo(() => {
        // Game week ends at Monday 5 AM UTC-2 (7 AM UTC) of next week
        const end = new Date(gameWeekStart);
        end.setUTCDate(end.getUTCDate() + 7);
        return end;
    }, [gameWeekStart]);

    const { weekDates, weekRangeFormatted, gameWeekNumber, calendarWeekNumber, todayIndex, isCurrentWeek, biWeeklyPeriod } = useMemo(() => {
            // For game week mode, calculate dates based on actual calendar dates
            // The game week starts on Monday, but we need to show the actual calendar dates
            // regardless of timezone. The game day reset time only affects game day numbers, not calendar dates.
            const dates: Date[] = [];
            // gameWeekStart is Monday 7 AM UTC (5 AM game time)
            // Get the calendar date at midnight UTC for Monday (the day that contains 7 AM UTC)
            const mondayCalendarDate = new Date(Date.UTC(
                gameWeekStart.getUTCFullYear(),
                gameWeekStart.getUTCMonth(),
                gameWeekStart.getUTCDate(),
                0, 0, 0, 0
            ));
            
            for (let i = 0; i < 7; i++) {
                // Add i days to Monday's calendar date
                const calendarDate = new Date(mondayCalendarDate);
                calendarDate.setUTCDate(calendarDate.getUTCDate() + i);
                dates.push(calendarDate);
            }

        const endOfWeek = dates[6];
            // Format dates will be done in the component to respect timezone
            // Store the dates for formatting with timezone
            const formatted = ''; // Will be formatted in render with timezone
        
            const gameNow = getGameTime(currentDate);
        const calWeekNum = getWeek(gameNow, { weekStartsOn: 1 });

            // Calculate today index based on actual calendar date
            const now = new Date();
            // Get today's calendar date at midnight UTC
            const todayCalendarDate = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                0, 0, 0, 0
            ));
            
            let currentDayIndex = dates.findIndex(d => {
                // Compare calendar dates at midnight UTC
                return d.getTime() === todayCalendarDate.getTime();
            });
            
            const _isCurrentWeek = currentDayIndex !== -1;
        const period = getWeekPeriod(gameNow);

            // Calculate game week number
            const gameWeekNum = Math.floor(differenceInCalendarWeeks(gameWeekStart, GAME_LAUNCH_WEEK_START, { weekStartsOn: 1 })) + 1;

        return { weekDates: dates, weekRangeFormatted: formatted, gameWeekNumber: gameWeekNum, calendarWeekNumber: calWeekNum, todayIndex: currentDayIndex, isCurrentWeek: _isCurrentWeek, biWeeklyPeriod: period };
    }, [currentDate, timeMode, gameWeekStart, selectedTimezone, timezone]);
    
    // Calculate game week number for weekOccurrences
    const gameWeekNum = useMemo(() => {
        return Math.floor(differenceInCalendarWeeks(gameWeekStart, GAME_LAUNCH_WEEK_START, { weekStartsOn: 1 })) + 1;
    }, [gameWeekStart]);
    
    // Stage 1: Get all event occurrences for the week - one per event per game day
    const weekOccurrences = useMemo(() => {
        const occurrences: Array<{ event: GameEvent; occurrence: { start: Date; end?: Date }; range: { start: string; end?: string } }> = [];
        
        // Get all filtered events - use same filtering as calendar week view
        const prefilteredEvents = filterEventsByPreferences(events, isCategoryEnabled);
        const filteredEvents = prefilteredEvents.filter(event => {
            // Exclude events with no schedule (content unlocks) - but keep Boss category for now
            if (event.schedule.type === 'none') {
                return false;
            }
            // Exclude Boss category events (but not World Boss Crusade which is a different category)
            if (event.category === 'Boss') {
                return false;
            }
            // When enabled, only show time-limited events (those with dateRange or dateRanges)
            if (hidePermanent && !event.dateRange && !event.dateRanges) {
                return false;
            }
            // When enabled, hide all-week events (those that occur every day)
            if (hideDaily && isDailyEvent(event)) {
                return false;
            }
            return true;
        });
        
        // Check if event is in week date range
        const checkDateInRange = (event: GameEvent, date: Date) => {
            if (event.availability) {
                const { added, removed } = event.availability;
                if (added) {
                    const addedDate = new Date(added + 'T00:00:00Z');
                    if (date < addedDate) return false;
                }
                if (removed) {
                    const removedDate = new Date(removed + 'T00:00:00Z');
                    removedDate.setUTCHours(23, 59, 59, 999);
                    if (date > removedDate) return false;
                }
                return true;
            }
            
            const checkSingleRange = (range: { start: string; end?: string }) => {
                const startDate = new Date(range.start + 'T00:00:00Z');
                startDate.setUTCHours(0, 0, 0, 0);
                if (date < startDate) return false;
                const endDate = range.end ? new Date(range.end + 'T00:00:00Z') : null;
                if (endDate) {
                    endDate.setUTCHours(23, 59, 59, 999);
                    return date <= endDate;
                }
                return true;
            };
            
            if (event.dateRanges) {
                return event.dateRanges.some(range => checkSingleRange(range));
            }
            if (event.dateRange) {
                return checkSingleRange(event.dateRange);
            }
            return true;
        };
        
        // Iterate through each day of the week
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const dayStart = new Date(gameWeekStart);
            dayStart.setUTCDate(dayStart.getUTCDate() + dayOffset);
            // Set to 5 AM game time (7 AM UTC) - start of game day
            dayStart.setUTCHours(7, 0, 0, 0);
            
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
            
            // For Game Week 1, skip days before launch (before Thursday)
            if (gameWeekNum === 1 && dayOffset < 3) {
                continue;
            }
            
            // Get one occurrence per event per game day (spanning the full game day)
            filteredEvents.forEach(event => {
                const calendarDate = new Date(dayStart);
                calendarDate.setUTCHours(0, 0, 0, 0);
                
                if (!checkDateInRange(event, calendarDate)) {
                    return;
                }
                
                // Check bi-weekly rotation
                if (event.biWeeklyRotation) {
                    const period = getWeekPeriod(dayStart);
                    if (period !== event.biWeeklyRotation) {
                        return;
                    }
                }
                
                // Check if event occurs on this day based on schedule
                // Note: schedule.type === 'none' events are already filtered out above
                const { schedule } = event;
                let occursOnThisDay = false;
                
                if (schedule.type === 'hourly' || schedule.type === 'multi-hourly' || schedule.type === 'daily-intervals') {
                    occursOnThisDay = true; // These occur every day
                } else if (schedule.type === 'daily-specific' || schedule.type === 'daily-intervals-specific') {
                    occursOnThisDay = schedule.days.includes(dayStart.getUTCDay());
                }
                
                if (!occursOnThisDay) {
                    return;
                }
                
                // Get date range for this event
                let eventRange: { start: string; end?: string } | null = null;
                if (event.dateRanges) {
                    eventRange = event.dateRanges.find(range => {
                        const startDate = new Date(range.start + 'T00:00:00Z');
                        const endDate = range.end ? new Date(range.end + 'T00:00:00Z') : null;
                        return calendarDate >= startDate && (!endDate || calendarDate <= endDate);
                    }) || null;
                } else if (event.dateRange) {
                    eventRange = event.dateRange;
                } else if (event.availability) {
                    // For permanent events, create a dummy range for display
                    eventRange = { start: event.availability.added || '2025-10-09' };
                } else {
                    // For permanent events without availability field, create a dummy range
                    // This covers events like Guild Hunt, Guild Dance that are always available
                    eventRange = { start: '2025-10-09' };
                }
                
                // Create occurrence(s) for this day based on schedule type
                // Events that end at 7 AM UTC (5 AM game time, game day reset) belong to the previous game day
                // Example: Harvest Feast 0:00-5:00 UTC-2 = 2:00-7:00 UTC ends at game day reset, belongs to previous day
                let dateStrForEvent: string;
                
                // Check if event should be attributed to previous game day
                // This happens if:
                // 1. Event starts before 7 AM UTC, OR
                // 2. Event ends at exactly 7 AM UTC (5 AM game time, the game day reset)
                let usePreviousDay = false;
                if (schedule.type === 'daily-intervals' || schedule.type === 'daily-intervals-specific') {
                    if ('intervals' in event.schedule) {
                        const intervals = event.schedule.intervals;
                        if (intervals && intervals.length > 0) {
                            const firstInterval = intervals[0];
                            // Convert UTC-2 time to UTC: add 2 hours
                            const startHourUTC = firstInterval.start.hour + 2;
                            const firstEndHourUTC = firstInterval.end.hour + 2;
                            const firstEndMinuteUTC = firstInterval.end.minute;
                            // If event starts before 7 AM UTC OR first interval ends at exactly 7 AM UTC (game day reset), use previous day
                            // The first interval ending at 7 AM UTC means the event belongs to the previous game day
                            usePreviousDay = startHourUTC < 7 || (firstEndHourUTC === 7 && firstEndMinuteUTC === 0);
                        }
                    }
                } else if (schedule.type === 'daily-specific') {
                    if ('times' in event.schedule) {
                        const times = event.schedule.times;
                        if (times && times.length > 0) {
                            // Convert UTC-2 time to UTC: add 2 hours
                            const startHourUTC = times[0].hour + 2;
                            // For daily-specific, check if start is before 7 AM UTC
                            usePreviousDay = startHourUTC < 7;
                        }
                    }
                }
                
                if (usePreviousDay) {
                    // Use previous calendar day for events starting before 7 AM UTC
                    const prevDay = new Date(dayStart);
                    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
                    dateStrForEvent = `${prevDay.getUTCFullYear()}-${String(prevDay.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDay.getUTCDate()).padStart(2, '0')}`;
                } else {
                    // Use the current calendar day
                    dateStrForEvent = `${dayStart.getUTCFullYear()}-${String(dayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(dayStart.getUTCDate()).padStart(2, '0')}`;
                }
                
                let dayOccurrenceStart: Date;
                let dayOccurrenceEnd: Date;
                
                // For events with intervals that use previous day, we need to calculate
                // which intervals are actually active on the current game day
                if (usePreviousDay && (schedule.type === 'daily-intervals' || schedule.type === 'daily-intervals-specific')) {
                    if ('intervals' in event.schedule) {
                        const intervals = event.schedule.intervals;
                        if (intervals && intervals.length > 0) {
                            // Find the first interval that starts on or after 7 AM UTC (current game day start)
                            let firstIntervalOnDay: typeof intervals[0] | null = null;
                            // Find the interval that ends at 7 AM UTC (game day reset) - this is the first interval (0:00-5:00)
                            let resetInterval: typeof intervals[0] | null = null;
                            
                            for (const interval of intervals) {
                                const intervalStartUTC = interval.start.hour + 2;
                                
                                // Check if this is the interval that ends at game day reset (5 AM game time = 7 AM UTC)
                                if (interval.end.hour === 5 && interval.end.minute === 0) {
                                    resetInterval = interval;
                                }
                                
                                // Check if this interval starts on or after the current game day (7 AM UTC)
                                if (intervalStartUTC >= 7 && !firstIntervalOnDay) {
                                    firstIntervalOnDay = interval;
                                }
                            }
                            
                            // Use current day's date for calculation
                            const currentDayDateStr = `${dayStart.getUTCFullYear()}-${String(dayStart.getUTCMonth() + 1).padStart(2, '0')}-${String(dayStart.getUTCDate()).padStart(2, '0')}`;
                            
                            if (firstIntervalOnDay) {
                                // Start: first interval that's on the current game day (e.g., 12:00 UTC-2 = 14:00 UTC)
                                dayOccurrenceStart = new Date(Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate(), firstIntervalOnDay.start.hour + 2, firstIntervalOnDay.start.minute, 0, 0));
                            } else {
                                // Fallback: use first interval
                                dayOccurrenceStart = getEventStartTime(event, currentDayDateStr);
                            }
                            
                            // End: the interval that ends at game day reset (7 AM UTC = next game day start)
                            if (resetInterval) {
                                // This ends at 5 AM game time = 7 AM UTC, which is the start of the NEXT game day
                                dayOccurrenceEnd = new Date(dayStart);
                                dayOccurrenceEnd.setUTCDate(dayOccurrenceEnd.getUTCDate() + 1);
                                dayOccurrenceEnd.setUTCHours(7, 0, 0, 0);
                            } else {
                                // Fallback: use last interval
                                dayOccurrenceEnd = getEventEndTime(event, currentDayDateStr);
                                if (dayOccurrenceEnd < dayOccurrenceStart) {
                                    dayOccurrenceEnd.setUTCDate(dayOccurrenceEnd.getUTCDate() + 1);
                                }
                            }
                        } else {
                            // No intervals, fallback
                            dayOccurrenceStart = getEventStartTime(event, dateStrForEvent);
                            dayOccurrenceEnd = getEventEndTime(event, dateStrForEvent);
                            if (dayOccurrenceEnd < dayOccurrenceStart) {
                                dayOccurrenceEnd.setUTCDate(dayOccurrenceEnd.getUTCDate() + 1);
                            }
                        }
                    } else {
                        // No intervals property, fallback
                        dayOccurrenceStart = getEventStartTime(event, dateStrForEvent);
                        dayOccurrenceEnd = getEventEndTime(event, dateStrForEvent);
                        if (dayOccurrenceEnd < dayOccurrenceStart) {
                            dayOccurrenceEnd.setUTCDate(dayOccurrenceEnd.getUTCDate() + 1);
                        }
                    }
                } else {
                    // For events not using previous day, calculate occurrence within THIS game day only
                    // Game day boundaries: 7 AM UTC to 7 AM UTC next day
                    const dayEndBoundary = new Date(dayStart);
                    dayEndBoundary.setUTCDate(dayEndBoundary.getUTCDate() + 1);
                    dayEndBoundary.setUTCHours(7, 0, 0, 0);
                    
                    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
                        const intervals = event.schedule.intervals;
                        if (intervals && intervals.length > 0) {
                            // Calculate intervals for THIS game day only (7 AM UTC to 7 AM UTC next day)
                            // Intervals are ordered: normal intervals first, then early morning intervals (before 5 AM UTC-2 = 7 AM UTC) at the end
                            const intervalsInGameDay: Array<{ start: Date; end: Date }> = [];
                            
                            // Find intervals that start before 5 AM UTC-2 (7 AM UTC) at the end of the list
                            // These belong to the current game day
                            let earlyMorningStartIndex = intervals.length;
                            for (let i = intervals.length - 1; i >= 0; i--) {
                                if (intervals[i].start.hour + 2 < 7) {
                                    earlyMorningStartIndex = i;
                                } else {
                                    break;
                                }
                            }
                            
                            // Calculate range end date for filtering intervals that start after the event ends
                            const rangeEndDate = eventRange && eventRange.end ? new Date(eventRange.end + 'T00:00:00Z') : null;
                            if (rangeEndDate) {
                                rangeEndDate.setUTCHours(23, 59, 59, 999); // End of the end date
                            }
                            
                            for (let i = 0; i < intervals.length; i++) {
                                const interval = intervals[i];
                                const isEarlyMorningInterval = i >= earlyMorningStartIndex;
                                
                                // Convert UTC-2 times to UTC by adding 2 hours
                                const intervalStartHourUTC = interval.start.hour + 2;
                                const intervalEndHourUTC = interval.end.hour + 2;
                                
                                // Calculate interval times for this game day
                                let intervalStart: Date;
                                let intervalEnd: Date;
                                
                                if (isEarlyMorningInterval) {
                                    // Early morning intervals (at end of list): belong to this game day
                                    // They start before 7 AM UTC but end before 7 AM UTC next day
                                    // Calculate as if they're on the calendar day of dayStart, but they're actually the next calendar day
                                    intervalStart = new Date(dayStart);
                                    intervalStart.setUTCDate(intervalStart.getUTCDate() + 1);
                                    intervalStart.setUTCHours(intervalStartHourUTC, interval.start.minute, 0, 0);
                                    
                                    intervalEnd = new Date(intervalStart);
                                    intervalEnd.setUTCHours(intervalEndHourUTC, interval.end.minute, 0, 0);
                                    if (intervalEnd <= intervalStart) {
                                        intervalEnd.setUTCDate(intervalEnd.getUTCDate() + 1);
                                    }
                                    
                                    // Check if interval starts after the event end date - if so, exclude it
                                    if (rangeEndDate && intervalStart > rangeEndDate) {
                                        continue; // Skip this interval
                                    }
                                    
                                    // Include if end is within this game day (before 7 AM UTC next day = dayEndBoundary)
                                    if (intervalEnd <= dayEndBoundary && intervalEnd > dayStart) {
                                        intervalsInGameDay.push({ 
                                            start: new Date(dayStart), // Clip start to game day start (7 AM UTC)
                                            end: intervalEnd
                                        });
                                    }
                                } else {
                                    // Normal intervals: start at or after 7 AM UTC (5 AM UTC-2)
                                    intervalStart = new Date(dayStart);
                                    intervalStart.setUTCHours(intervalStartHourUTC, interval.start.minute, 0, 0);
                                    
                                    intervalEnd = new Date(intervalStart);
                                    intervalEnd.setUTCHours(intervalEndHourUTC, interval.end.minute, 0, 0);
                                    if (intervalEnd <= intervalStart) {
                                        intervalEnd.setUTCDate(intervalEnd.getUTCDate() + 1);
                                    }
                                    
                                    // Check if interval starts after the event end date - if so, exclude it
                                    if (rangeEndDate && intervalStart > rangeEndDate) {
                                        continue; // Skip this interval
                                    }
                                    
                                    // Include if start is within this game day
                                    if (intervalStart >= dayStart && intervalStart < dayEndBoundary) {
                                        intervalsInGameDay.push({ 
                                            start: intervalStart,
                                            end: intervalEnd > dayEndBoundary ? new Date(dayEndBoundary) : intervalEnd
                                        });
                                    }
                                }
                            }
                            
                            if (intervalsInGameDay.length > 0) {
                                // Use first interval start and last interval end within this game day
                                dayOccurrenceStart = intervalsInGameDay[0].start;
                                dayOccurrenceEnd = intervalsInGameDay[intervalsInGameDay.length - 1].end;
                                
                                // For events with date ranges, verify the occurrence falls within the range
                                // Check if any interval extends beyond the end date (rangeEndDate already calculated above)
                                if (rangeEndDate) {
                                    // If the occurrence starts after the end date, exclude it
                                    if (dayOccurrenceStart > rangeEndDate) {
                                        return;
                                    }
                                    // Clip end time to the end date if it extends beyond
                                    if (dayOccurrenceEnd > rangeEndDate) {
                                        dayOccurrenceEnd = new Date(rangeEndDate);
                                    }
                                }
                            } else {
                                // No intervals in this game day, skip
                                return;
                            }
                        } else {
                            return; // No intervals
                        }
                    } else {
                        // For other schedule types, use the existing functions
                    dayOccurrenceStart = getEventStartTime(event, dateStrForEvent);
                    dayOccurrenceEnd = getEventEndTime(event, dateStrForEvent);
                    
                    // Handle midnight crossover
                    if (dayOccurrenceEnd < dayOccurrenceStart) {
                        dayOccurrenceEnd.setUTCDate(dayOccurrenceEnd.getUTCDate() + 1);
                        }
                        
                        // Game day boundaries: 7 AM UTC to 7 AM UTC next day
                        const dayEndBoundary = new Date(dayStart);
                        dayEndBoundary.setUTCDate(dayEndBoundary.getUTCDate() + 1);
                        dayEndBoundary.setUTCHours(7, 0, 0, 0);
                        
                        // Only show if both start and end are within this game day
                        if (dayOccurrenceStart < dayStart || dayOccurrenceStart >= dayEndBoundary) {
                            return;
                        }
                        if (dayOccurrenceEnd <= dayStart || dayOccurrenceEnd > dayEndBoundary) {
                            return;
                        }
                    }
                }
                
                const dayOccurrence = {
                    start: dayOccurrenceStart,
                    end: dayOccurrenceEnd
                };
                
                occurrences.push({ event, occurrence: dayOccurrence, range: eventRange || { start: '2025-10-09' } });
            });
        }
        
        return occurrences;
    }, [gameWeekStart, gameWeekEnd, gameWeekNum, isCategoryEnabled, hidePermanent, hideDaily]);
    
    // Calculate date badges for the week - combine badges for the same calendar date within the same game day
    const dateBadges = useMemo(() => {
        // First, collect all date segments
        const dateSegments: Array<{ date: Date; startPercent: number; endPercent: number; dayIndex: number }> = [];
        
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            const dayStart = new Date(gameWeekStart);
            dayStart.setUTCDate(dayStart.getUTCDate() + dayIndex);
            dayStart.setUTCHours(7, 0, 0, 0); // Game day starts at 7 AM UTC
            
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
            dayEnd.setUTCHours(7, 0, 0, 0); // Game day ends at 7 AM UTC next day
            
            // Column positioning (each column is 24 hours = 24/168 of total width)
            const columnLeftPercent = (dayIndex * 24 / HOURS_IN_WEEK) * 100;
            const columnWidthPercent = (24 / HOURS_IN_WEEK) * 100;
            
            // Get the calendar date that dayStart represents in the selected timezone
            // dayStart is at 7 AM UTC, but in the selected timezone it might be a different calendar date
            // For example, Monday 7 AM UTC = Sunday 11 PM in Los Angeles (UTC-8)
            const tz = selectedTimezone || timezone;
            const dayStartDateStr = dayStart.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
            const [month, day, year] = dayStartDateStr.split('/').map(Number);
            // Create UTC date at noon from these components (safe for formatting)
            const baseCalendarDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
            
            // Calculate midnight position within the game day
            let midnightPercent: number;
            let hoursUntilMidnight: number;
            if (timeMode === 'game') {
                // For game time (UTC-2), midnight UTC-2 is at 2 AM UTC
                // Game day: 7 AM UTC (5 AM UTC-2) to 7 AM UTC next day (5 AM UTC-2 next day)
                // Midnight UTC-2: 2 AM UTC (which is 0:00 UTC-2)
                // From 7 AM UTC to 2 AM UTC next day = 19 hours
                // So midnight is at 19/24 = 79.17% of the game day
                hoursUntilMidnight = 19;
                midnightPercent = (19 / 24) * 100;
            } else {
                // For local time, calculate when local midnight occurs within the game day
                const timeFormatter = new Intl.DateTimeFormat('en-US', { 
                    timeZone: tz, 
                    hour: 'numeric',
                    minute: 'numeric',
                    hour12: false
                });
                
                // Get the local hour of dayStart
                const timeParts = timeFormatter.formatToParts(dayStart);
                const localHourOfDayStart = parseInt(timeParts.find(p => p.type === 'hour')?.value || '0');
                
                // Calculate hours until next midnight (24 - current hour)
                hoursUntilMidnight = (24 - localHourOfDayStart) % 24;
                
                // Clamp to 0-24 hours
                if (hoursUntilMidnight <= 0) {
                    midnightPercent = 0;
                } else if (hoursUntilMidnight >= 24) {
                    midnightPercent = 100;
                } else {
                    midnightPercent = (hoursUntilMidnight / 24) * 100;
                }
            }
            
            // Only split if midnight is within the game day (not at start or end)
            if (midnightPercent > 0 && midnightPercent < 100) {
                // First badge segment: from game day start to midnight
                dateSegments.push({
                    date: baseCalendarDate,
                    startPercent: columnLeftPercent,
                    endPercent: columnLeftPercent + (midnightPercent * columnWidthPercent / 100),
                    dayIndex: dayIndex
                });
                
                // Second badge segment: from midnight to game day end
                // Get the calendar date at midnight in the selected timezone
                const midnightInTz = new Date(dayStart.getTime() + (hoursUntilMidnight * 60 * 60 * 1000));
                const midnightDateStr = midnightInTz.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
                const [nextMonth, nextDay, nextYear] = midnightDateStr.split('/').map(Number);
                const nextCalendarDate = new Date(Date.UTC(nextYear, nextMonth - 1, nextDay, 12, 0, 0, 0));
                
                dateSegments.push({
                    date: nextCalendarDate,
                    startPercent: columnLeftPercent + (midnightPercent * columnWidthPercent / 100),
                    endPercent: columnLeftPercent + columnWidthPercent,
                    dayIndex: dayIndex
                });
            } else {
                // No split: badge spans the whole game day
                dateSegments.push({
                    date: baseCalendarDate,
                    startPercent: columnLeftPercent,
                    endPercent: columnLeftPercent + columnWidthPercent,
                    dayIndex: dayIndex
                });
            }
        }
        
        // Now combine segments that have the same calendar date across game days (reset lines)
        const badgesMap = new Map<string, { date: Date; startPercent: number; endPercent: number }>();
        
        dateSegments.forEach(segment => {
            // Create a key from the date (year-month-day) only - use the UTC date components directly
            // This ensures badges merge across game days when the same calendar date appears on both sides of a reset line
            const year = segment.date.getUTCFullYear();
            const month = segment.date.getUTCMonth();
            const day = segment.date.getUTCDate();
            const dateKey = `${year}-${month}-${day}`;
            
            if (badgesMap.has(dateKey)) {
                // Merge with existing badge - extend the range across reset lines
                const existing = badgesMap.get(dateKey)!;
                existing.startPercent = Math.min(existing.startPercent, segment.startPercent);
                existing.endPercent = Math.max(existing.endPercent, segment.endPercent);
            } else {
                // Create new badge
                badgesMap.set(dateKey, {
                    date: segment.date,
                    startPercent: segment.startPercent,
                    endPercent: segment.endPercent
                });
            }
        });
        
        // Convert to array and sort by start position
        return Array.from(badgesMap.values()).sort((a, b) => a.startPercent - b.startPercent);
    }, [gameWeekStart, timeMode, timezone, selectedTimezone]);
    
    const { daySpecificEventsByDay, multiDayEvents } = useMemo(() => {
        const daySpecificByDay: Record<string, GameEvent[]>[] = Array.from({ length: 7 }, () => ({}));
        const multiDayList: { event: GameEvent, daySpans: number[] }[] = [];

        const weekStart = weekDates[0];
        const weekEnd = addDays(weekDates[6], 1); 

        const checkDateInRange = (event: GameEvent, date: Date) => {
            // Check availability for permanent events
            if (event.availability) {
                const { added, removed } = event.availability;
                if (added) {
                    const addedDate = new Date(added + 'T00:00:00Z');
                    if (date < addedDate) return false;
                }
                if (removed) {
                    const removedDate = new Date(removed + 'T00:00:00Z');
                    removedDate.setUTCHours(23, 59, 59, 999);
                    if (date > removedDate) return false;
                }
                return true;
            }

            // Check dateRange/dateRanges for time-limited events
            // Note: dateRange uses calendar dates, so we compare calendar dates
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
            };

            if (event.dateRanges) {
                return event.dateRanges.some(range => {
                    const startDate = new Date(range.start + 'T00:00:00Z');
                    // Default to 5 AM game time (7 AM UTC) if event has no specific schedule
                    if (event.schedule.type === 'none') {
                        startDate.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC
                    } else {
                    startDate.setUTCHours(0, 0, 0, 0);
                    }
                    const endDate = new Date(range.end + 'T00:00:00Z');
                    // Events without specific times end at 5 AM game time (7 AM UTC) on the day after the end date
                    if (event.schedule.type === 'none') {
                        endDate.setUTCDate(endDate.getUTCDate() + 1);
                        endDate.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC on the next day
                    } else {
                    endDate.setUTCHours(23, 59, 59, 999);
                    }
                    return date >= startDate && date < endDate; // Use < for end since it's exclusive at 5 AM
                });
            }
            if (event.dateRange) {
                return checkSingleRange(event.dateRange);
            }
            return true;
        };

        const prefilteredEvents = filterEventsByPreferences(events, isCategoryEnabled);
        const filteredEvents = prefilteredEvents.filter(event => {
            // When enabled, only show time-limited events (those with dateRange or dateRanges)
            if (hidePermanent && !event.dateRange && !event.dateRanges) {
                return false;
            }
            if (event.schedule.type === 'none' || event.category === 'Boss' ) {
                return false;
            }
            
            const isInWeek = (range: {start?: string, end?: string}) => {
                const eventStart = new Date(range.start + 'T00:00:00Z');
                // Default to 5 AM game time (7 AM UTC) if event has no specific schedule
                if (event.schedule.type === 'none') {
                    eventStart.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC
                }
                const eventEnd = range.end ? (() => {
                    const end = new Date(range.end + 'T00:00:00Z');
                    // Events without specific times end at 5 AM game time (7 AM UTC) on the day after the end date
                    if (event.schedule.type === 'none') {
                        end.setUTCDate(end.getUTCDate() + 1);
                        end.setUTCHours(7, 0, 0, 0); // 5 AM game time = 7 AM UTC on the next day
                    } else {
                        end.setUTCDate(end.getUTCDate() + 1);
                    }
                    return end;
                })() : null;
                if (eventEnd) {
                    return eventStart < weekEnd && eventEnd > weekStart;
                }
                return eventStart < weekEnd;
            };
            
            if (event.dateRanges) {
                if (!event.dateRanges.some(isInWeek)) return false;
            } else if (event.dateRange) {
                if (!isInWeek(event.dateRange)) return false;
            }
            
            if (event.biWeeklyRotation && event.biWeeklyRotation !== biWeeklyPeriod) {
                return false;
            }
            
            return true;
        });

        const processedMultiDayEvents = new Set<string>();

        filteredEvents.forEach(event => {
            if (processedMultiDayEvents.has(event.name)) return;

            const { schedule } = event;
            const category = event.category;

            const eventDaysInWeek = weekDates.map((date, index) => {
                // Use calendar date for date range checking (event dateRange uses calendar dates)
                const calendarDate = new Date(date);
                calendarDate.setUTCHours(0,0,0,0);
                
                // For Game Week 1, ignore events before launch day (Thursday, index 3)
                if (gameWeekNumber === 1 && index < 3) {
                    return -1;
                }

                if (!checkDateInRange(event, calendarDate)) {
                    return -1;
                }
                
                // Use game day for schedule checking
                const gameDayForDate = getGameDate(date);
                
                let occursToday = false;
                if (isDailyEvent(event)) {
                    occursToday = true;
                } else if (schedule.type === 'daily-specific' || schedule.type === 'daily-intervals-specific') {
                    const scheduleDaysInWeek = schedule.days.map(d => (d + 6) % 7);
                    if (scheduleDaysInWeek.includes(index)) {
                        occursToday = true;
                    }
                }
                
                return occursToday ? index : -1;
            }).filter(index => index !== -1);

            if (eventDaysInWeek.length === 0) return;
            
            let currentSpan: number[] = [];
            for (let i = 0; i < eventDaysInWeek.length; i++) {
                if (i === 0 || eventDaysInWeek[i] === eventDaysInWeek[i-1] + 1) {
                    currentSpan.push(eventDaysInWeek[i]);
                } else {
                    if (currentSpan.length > 1) {
                        multiDayList.push({ event, daySpans: [...currentSpan] });
                    } else if (currentSpan.length === 1) {
                        const dateIndex = currentSpan[0];
                        if (!daySpecificByDay[dateIndex][category]) daySpecificByDay[dateIndex][category] = [];
                        if (!daySpecificByDay[dateIndex][category].find(e => e.name === event.name)) {
                           daySpecificByDay[dateIndex][category].push(event);
                        }
                    }
                    currentSpan = [eventDaysInWeek[i]];
                }
            }

             if (currentSpan.length > 1) {
                multiDayList.push({ event, daySpans: [...currentSpan] });
             } else if (currentSpan.length === 1) {
                 const dateIndex = currentSpan[0];
                 if (!daySpecificByDay[dateIndex][category]) daySpecificByDay[dateIndex][category] = [];
                 if (!daySpecificByDay[dateIndex][category].find(e => e.name === event.name)) {
                    daySpecificByDay[dateIndex][category].push(event);
                 }
             }
        });
        
        const sortDayCategories = (dayCategories: Record<string, GameEvent[]>[]) => {
            const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Dungeon Unlock', 'Raid Unlock', 'Event', 'Hunting', 'Guild', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike'];
            
            dayCategories.forEach(day => {
                for (const category in day) {
                    day[category].sort((a,b) => a.name.localeCompare(b.name));
                }
            });

            return dayCategories.map(day => 
                Object.fromEntries(
                    Object.entries(day).sort(([a], [b]) => {
                        const indexA = categoryOrder.indexOf(a as GameEvent['category']);
                        const indexB = categoryOrder.indexOf(b as GameEvent['category']);
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        return indexA - indexB;
                    })
                )
            );
        };
        
        const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Dungeon Unlock', 'Raid Unlock', 'Event', 'Guild', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike'];
        
        const sortedMultiDayEvents = multiDayList.sort((a, b) => {
            const lengthA = a.daySpans.length;
            const lengthB = b.daySpans.length;

            if (lengthA !== lengthB) {
                return lengthA - lengthB; // Sort by span length ascending
            }
            
            const indexA = categoryOrder.indexOf(a.event.category);
            const indexB = categoryOrder.indexOf(b.event.category);
            if (indexA !== indexB) {
                if (indexA === -1) return 1;
                if (indexB === -1) return -1;
                return indexA - indexB;
            }
            return a.event.name.localeCompare(b.event.name);
        });

        return { daySpecificEventsByDay: sortDayCategories(daySpecificByDay), multiDayEvents: sortedMultiDayEvents };

    }, [weekDates, biWeeklyPeriod, hidePermanent, gameWeekNumber, isCategoryEnabled]);

    const filteredMultiDayEvents = useMemo(() => {
        const sorted = multiDayEvents;
        if (!hideDaily) return sorted;
        const expectedDays = gameWeekNumber === 1 ? 4 : 7;
        return sorted.filter(e => {
            if (isDailyEvent(e.event)) {
                 // Check if it spans the entire visible week
                return e.daySpans.length < expectedDays;
            }
            return true;
        });
    }, [multiDayEvents, hideDaily, gameWeekNumber]);


    const EventColumn = ({ dayIndex, dayCategories }: { dayIndex: number; dayCategories: Record<string, GameEvent[]> }) => {
        if (gameWeekNumber === 1 && dayIndex < 3) {
            return (
                <div className="bg-card p-2 rounded-b-lg space-y-2 min-h-[100px] border-t border-border/20 flex items-center justify-center">
                     <p className="text-center text-xs text-muted-foreground">Pre-Launch</p>
                </div>
            );
        }
        return (
             <div className="bg-card p-2 rounded-b-lg space-y-2 min-h-[100px] border-t border-border/20">
                {Object.keys(dayCategories).length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground pt-4">No special events</div>
                 ) : (
                    Object.entries(dayCategories).map(([category, categoryEvents]) => (
                    <div key={category} className="space-y-1">
                        {categoryEvents.map(event => {
                            return (
                                <WeeklyEvent 
                                    key={event.name} 
                                    event={event}
                                    isCompleted={weeklyCompletionsMounted ? isWeeklyEventCompleted(event.name, weekDates[dayIndex]) : undefined}
                                    onToggleCompletion={() => {
                                        // Toggle weekly completion
                                        toggleWeeklyEventCompletion(event.name, weekDates[dayIndex]);
                                    }}
                                    isCurrentWeek={true}
                                    timeFormat={timeFormat}
                                />
                            );
                        })}
                    </div>
                )))}
            </div>
        );
    }

    return (
            <Card className="w-full">
                <CardHeader>
                    <div className="flex justify-between items-center">
                            <Button variant="outline" size="icon" onClick={() => changeWeek(-1)} disabled={gameWeekNumber <= 1}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        <div className="text-center">
                                <CardTitle className="text-lg">
                                    {gameWeekNumber > 0 ? `Game Week #${gameWeekNumber}` : 'Pre-Launch'}
                                </CardTitle>
                                {(() => {
                                    const tz = selectedTimezone || timezone;
                                    // Use the actual game week start/end times (7 AM UTC) to get calendar dates in the selected timezone
                                    // This matches what's actually shown in the timeline
                                    // Include weekday to show which day of the week it is in the selected timezone
                                    const startDateStr = gameWeekStart.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });
                                    const startTimeStr = gameWeekStart.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
                                    const endDateStr = gameWeekEnd.toLocaleDateString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                                    const endTimeStr = gameWeekEnd.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: timeFormat === '12h' });
                                    return (
                                <p className="text-sm text-muted-foreground">
                                            {startDateStr} {startTimeStr} - {endDateStr} {endTimeStr}
                                </p>
                                    );
                                })()}
                                <p className="text-xs text-muted-foreground/80">
                                    (Calendar Week {calendarWeekNumber})
                                </p>
                            </div>
                        <div className="flex items-center gap-2">
                            {dailyCompletionsMounted && (() => {
                                // Reset daily completions for all days in the week
                                const handleResetWeek = () => {
                                    weekDates.forEach(date => {
                                        resetDay(date);
                                    });
                                };
                                
                                return (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleResetWeek}
                                        className="h-7 px-2 gap-1.5"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        <span className="text-xs">Reset</span>
                                    </Button>
                                );
                            })()}
                            <Button variant="outline" size="icon" onClick={() => changeWeek(1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center gap-x-4 gap-y-2 justify-end">
                            <div className="flex items-center space-x-2">
                                <Switch id="hide-daily" checked={hideDaily} onCheckedChange={setHideDaily} />
                                <Label htmlFor="hide-daily">Hide all-week events</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <Switch id="hide-permanent" checked={hidePermanent} onCheckedChange={setHidePermanent} />
                                <Label htmlFor="hide-permanent">Show only time-limited events</Label>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                            {!now ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <p>Loading timeline...</p>
                             </div>
                            ) : (
                                <div className="w-full pb-4 relative">
                                    <div className="relative w-full">
                                        {/* Day Markers Header */}
                                        <div className="sticky top-0 bg-card z-20 border-b-2 border-border">
                                            <div className="relative h-16 flex">
                                                {Array.from({ length: 7 }).map((_, dayIndex) => {
                                                    const dayStart = new Date(gameWeekStart);
                                                    dayStart.setUTCDate(dayStart.getUTCDate() + dayIndex);
                                                    dayStart.setUTCHours(7, 0, 0, 0); // Ensure it's at 7 AM UTC (game day start)
                                                    
                                                    // Calculate game day number for this column
                                                    // Use same calculation as DailyTimeline: compare midnight UTC dates
                                                    const launchDate = new Date(GAME_LAUNCH_DATE);
                                                    launchDate.setUTCHours(0, 0, 0, 0);
                                                    const dayStartDate = new Date(dayStart);
                                                    dayStartDate.setUTCHours(0, 0, 0, 0);
                                                    const gameDayNumber = differenceInDays(dayStartDate, launchDate) + 1;
                                                    
                                                    // Calculate current game day number (based solely on game day, not calendar date)
                                                    const currentGameDate = getGameDate(now);
                                                    const currentGameDayNumber = differenceInDays(currentGameDate, launchDate) + 1;
                                                    
                                                    // Highlight if this column's game day number matches the current game day number
                                                    const isToday = gameDayNumber === currentGameDayNumber;
                                                    
                                                    const dayOfWeek = dayStart.getUTCDay();
                                                    const dayName = DAY_NAMES[dayOfWeek === 0 ? 6 : dayOfWeek - 1]; // Convert Sunday=0 to Monday=0
                                                    
                                                    return (
                                                        <div
                                                            key={dayIndex}
                                                            className={cn(
                                                                "flex flex-col items-center justify-center text-center border-r-2 border-border/60 py-2",
                                                                isToday && "bg-accent/20",
                                                                dayIndex === 6 && "border-r-0"
                                                            )}
                                                            style={{ width: `${(24 / HOURS_IN_WEEK) * 100}%` }}
                                                        >
                                                            <span className="text-base font-bold">{dayName}</span>
                                                            <span className="text-xs text-muted-foreground mt-0.5">#{gameDayNumber}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                    </div>

                                        {/* Time Markers and Date Badges Row */}
                                        <div className="relative h-10 border-b border-border/50">
                                            {dateBadges.map((dateInfo, index) => {
                                                // Get day of week
                                                const dayOfWeek = dateInfo.date.getDay();
                                                const dayName = DAY_NAMES[dayOfWeek === 0 ? 6 : dayOfWeek - 1]; // Convert Sunday=0 to Monday=0
                                                
                                                // Format date with day of week: "Sun 4 Jan"
                                                // dateInfo.date is a UTC calendar date at midnight UTC
                                                // To show the correct calendar date in the selected timezone, format it at noon UTC
                                                // (noon UTC is always the same calendar date in all timezones, avoiding edge cases)
                                                const tz = selectedTimezone || timezone;
                                                const dateAtNoon = new Date(dateInfo.date);
                                                dateAtNoon.setUTCHours(12, 0, 0, 0); // Use noon UTC to avoid timezone edge cases
                                                const day = dateAtNoon.toLocaleDateString('en-US', { timeZone: tz, day: 'numeric' });
                                                const month = dateAtNoon.toLocaleDateString('en-US', { timeZone: tz, month: 'short' });
                                                const dateStr = `${dayName} ${day} ${month}`;
                                                
                                                // Alternate colors for date badges - make one lighter grey
                                                const bgColor = index % 2 === 0 ? 'bg-muted/20' : 'bg-muted/50';
                                                
                                                return (
                                                    <div
                                                        key={index}
                                                        className={cn("absolute top-1 h-6 flex items-center px-2 border border-border/50 rounded text-[10px] font-medium text-muted-foreground", bgColor)}
                                                        style={{
                                                            left: `${dateInfo.startPercent}%`,
                                                            width: `${dateInfo.endPercent - dateInfo.startPercent}%`
                                                        }}
                                                    >
                                                        {dateStr}
                                </div>
                                                );
                                            })}
                                            {Array.from({ length: 7 }).map((_, dayIndex) => {
                                                const dayStart = new Date(gameWeekStart);
                                                dayStart.setUTCDate(dayStart.getUTCDate() + dayIndex);
                                                
                                                const dayEnd = new Date(dayStart);
                                                dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
                                                
                                                // Column positioning (each column is 24 hours = 24/168 of total width)
                                                const columnLeftPercent = (dayIndex * 24 / HOURS_IN_WEEK) * 100;
                                                const columnWidthPercent = (24 / HOURS_IN_WEEK) * 100;
                                                
                                                // Time markers: 0% (7 AM start), 25% (1/4), 50% (midday = 7 AM + 12h), 75% (3/4), 100% (7 AM next day)
                                                const startMarkerPercent = 0;
                                                const quarter1Percent = 25;
                                                const middayMarkerPercent = 50;
                                                const quarter3Percent = 75;
                                                const endMarkerPercent = 100;
                                                
                                                // Format time markers - only hour, adjust for timezone, format based on timeFormat
                                                // Use tz from component scope
                                                const formatHour = (date: Date, isGameTime: boolean): string => {
                                                    let hour: number;
                                                    if (isGameTime) {
                                                        // For game time, subtract 2 hours from UTC to get UTC-2
                                                        hour = (date.getUTCHours() - 2 + 24) % 24;
                                                    } else {
                                                        // For local time, get hour in selected timezone
                                                        if (tz) {
                                                            const formatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
                                                            hour = parseInt(formatter.format(date));
                                                        } else {
                                                            const localDate = toLocalTime(date);
                                                            hour = localDate.getHours();
                                                        }
                                                    }
                                                    
                                                    if (timeFormat === '12h') {
                                                        const period = hour >= 12 ? 'PM' : 'AM';
                                                        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                                        return `${displayHour} ${period}`;
                                                    } else {
                                                        return `${hour}`;
                                                    }
                                                };
                                                
                                                const startTimeStr = formatHour(dayStart, timeMode === 'game');
                                                const quarter1Time = new Date(dayStart.getTime() + 6 * 60 * 60 * 1000); // 7 AM + 6h = 1 PM
                                                const quarter1TimeStr = formatHour(quarter1Time, timeMode === 'game');
                                                const middayTime = new Date(dayStart.getTime() + 12 * 60 * 60 * 1000);
                                                const middayTimeStr = formatHour(middayTime, timeMode === 'game');
                                                const quarter3Time = new Date(dayStart.getTime() + 18 * 60 * 60 * 1000); // 7 AM + 18h = 1 AM next day
                                                const quarter3TimeStr = formatHour(quarter3Time, timeMode === 'game');
                                                const endTimeStr = formatHour(dayEnd, timeMode === 'game');
                                                
                                                return (
                                                    <Fragment key={dayIndex}>
                                                        {/* Reset line - prominent line at game day start (5 AM game time = 7 AM UTC) */}
                                                        <div
                                                            className="absolute top-0 bottom-0 w-0.5 bg-accent z-20"
                                                            style={{ left: `${columnLeftPercent + (startMarkerPercent * columnWidthPercent / 100)}%` }}
                                                        />
                                                        {/* Quarter 1 marker */}
                                                        <div
                                                            className="absolute top-0 bottom-0 w-px bg-border/40 z-10"
                                                            style={{ left: `${columnLeftPercent + (quarter1Percent * columnWidthPercent / 100)}%` }}
                                                        />
                                                        {/* Midday marker - less prominent */}
                                                        <div
                                                            className="absolute top-0 bottom-0 w-px bg-border/60 z-10"
                                                            style={{ left: `${columnLeftPercent + (middayMarkerPercent * columnWidthPercent / 100)}%` }}
                                                        />
                                                        {/* Quarter 3 marker */}
                                                        <div
                                                            className="absolute top-0 bottom-0 w-px bg-border/40 z-10"
                                                            style={{ left: `${columnLeftPercent + (quarter3Percent * columnWidthPercent / 100)}%` }}
                                                        />
                                                        {/* Reset line at end of game day (start of next game day) - prominent */}
                                                        <div
                                                            className="absolute top-0 bottom-0 w-0.5 bg-accent z-20"
                                                            style={{ left: `${columnLeftPercent + (endMarkerPercent * columnWidthPercent / 100)}%` }}
                                                        />
                                                        
                                                        {/* Time labels - below the markers */}
                                                        <div
                                                            className="absolute top-10 text-[9px] text-muted-foreground font-medium whitespace-nowrap"
                                                            style={{ left: `${columnLeftPercent + (startMarkerPercent * columnWidthPercent / 100)}%`, transform: 'translateX(-50%)' }}
                                                        >
                                                            {startTimeStr}
                                </div>
                                                        <div
                                                            className="absolute top-10 text-[9px] text-muted-foreground/80 font-medium whitespace-nowrap"
                                                            style={{ left: `${columnLeftPercent + (quarter1Percent * columnWidthPercent / 100)}%`, transform: 'translateX(-50%)' }}
                                                        >
                                                            {quarter1TimeStr}
                            </div>
                                                        <div
                                                            className="absolute top-10 text-[9px] text-muted-foreground font-medium whitespace-nowrap"
                                                            style={{ left: `${columnLeftPercent + (middayMarkerPercent * columnWidthPercent / 100)}%`, transform: 'translateX(-50%)' }}
                                                        >
                                                            {middayTimeStr}
                                                        </div>
                                                        <div
                                                            className="absolute top-10 text-[9px] text-muted-foreground/80 font-medium whitespace-nowrap"
                                                            style={{ left: `${columnLeftPercent + (quarter3Percent * columnWidthPercent / 100)}%`, transform: 'translateX(-50%)' }}
                                                        >
                                                            {quarter3TimeStr}
                                                        </div>
                                                        {dayIndex === 6 && (
                                                            <div
                                                                className="absolute top-10 text-[9px] text-muted-foreground font-medium whitespace-nowrap"
                                                                style={{ left: `${columnLeftPercent + (endMarkerPercent * columnWidthPercent / 100)}%`, transform: 'translateX(-50%)' }}
                                                            >
                                                                {endTimeStr}
                        </div>
                    )}
                                                    </Fragment>
                                                );
                        })}
                    </div>

                                        {/* Event Rows */}
                                        <div className="relative space-y-1 py-2 mt-6">
                                            {(() => {
                                                // First group by category, then by event name
                                                const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Guild', 'Hunting', 'Event', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike', 'Boss'];
                                                
                                                // Group by category first
                                                const eventsByCategory = new Map<GameEvent['category'], Map<string, Array<{ event: GameEvent; occurrence: { start: Date; end?: Date }; range: { start: string; end?: string } }>>>();
                                                
                                                weekOccurrences.forEach(({ event, occurrence, range }) => {
                                                    const category = event.category;
                                                    if (!eventsByCategory.has(category)) {
                                                        eventsByCategory.set(category, new Map());
                                                    }
                                                    const categoryMap = eventsByCategory.get(category)!;
                                                    if (!categoryMap.has(event.name)) {
                                                        categoryMap.set(event.name, []);
                                                    }
                                                    categoryMap.get(event.name)!.push({ event, occurrence, range });
                                                });
                                                
                                                // Convert to array, sort by category order, then by event name within each category
                                                const sortedCategories = Array.from(eventsByCategory.entries()).sort(([catA], [catB]) => {
                                                    const indexA = categoryOrder.indexOf(catA);
                                                    const indexB = categoryOrder.indexOf(catB);
                                                    if (indexA === -1 && indexB === -1) return catA.localeCompare(catB);
                                                    if (indexA === -1) return 1;
                                                    if (indexB === -1) return -1;
                                                    return indexA - indexB;
                                                });
                                                
                                                return sortedCategories.flatMap(([category, eventsByName]) => {
                                                    // Sort events within category by name
                                                    const sortedEvents = Array.from(eventsByName.entries()).sort(([nameA], [nameB]) => nameA.localeCompare(nameB));
                                                    
                                                    return sortedEvents.map(([eventName, occurrences]) => {
                                                        const event = occurrences[0].event;
                                                    
                                                        return (
                                                            <div key={eventName} className="relative h-9">
                                                                {occurrences.map(({ occurrence, range }, index) => {
                                                                    // Calculate completion date based on occurrence start date
                                                                    // Use getGameDate to get the game date (same as DailyTimeline uses)
                                                                    const completionDate = getGameDate(occurrence.start);
                                                                    
                                                                    // Use daily completions for per-day tracking in the weekly timeline
                                                                    const isCompleted = dailyCompletionsMounted ? isDailyEventCompleted(event.name, completionDate) : false;
                                                                    
                                                                    const handleToggleCompletion = () => {
                                                                        // Toggle daily completion (per-day, not per-week)
                                                                        toggleDailyEventCompletion(event.name, completionDate);
                                                                    };
                                                                    
                                                                    return (
                                                                        <WeeklyHourEventBar
                                                                            key={`${event.name}-${occurrence.start.getTime()}-${index}`}
                                                                            event={event}
                                                                            occurrence={occurrence}
                                                                            range={range}
                                                                            weekStart={gameWeekStart}
                                                                            weekEnd={gameWeekEnd}
                                                                            isCompleted={isCompleted}
                                                                            onToggleCompletion={handleToggleCompletion}
                                                                            currentTime={now}
                                                                            timeMode={timeMode}
                                                                            timeFormat={timeFormat}
                                                                            selectedTimezone={tz}
                                                                        />
                                                                    );
                                                                })}
                                </div>
                                                        );
                                                    });
                                                });
                                            })()}
                                </div>
                                        
                                        {/* Current Time Indicator */}
                                        {isCurrentWeek && now && (() => {
                                            // Always use UTC time (now) for positioning, regardless of timeMode
                                            // The timeline is always based on UTC (gameWeekStart/gameWeekEnd are in UTC)
                                            // Only the hour labels and date badges change when switching time modes
                                            
                                            // Week boundaries are always in UTC
                                            const weekStartTimestamp = gameWeekStart.getTime();
                                            const weekEndTimestamp = gameWeekEnd.getTime();
                                            const weekDurationMs = weekEndTimestamp - weekStartTimestamp;
                                            
                                            // Use actual UTC time for positioning
                                            const currentOffsetMs = now.getTime() - weekStartTimestamp;
                                            const currentTimePercent = (currentOffsetMs / weekDurationMs) * 100;
                                            
                                            // Only show if current time is within this week
                                            if (currentTimePercent >= 0 && currentTimePercent <= 100) {
                                                // Format time using selectedTimezone for display
                                                // When game-time mode is on, selectedTimezone is 'Etc/GMT+2' (UTC-2)
                                                // When local-time mode is on, selectedTimezone is the user's selected timezone
                                                const tz = selectedTimezone || timezone;
                                                const timeStr = now.toLocaleTimeString('en-US', { 
                                                    timeZone: tz, 
                                                    hour12: timeFormat === '12h', 
                                                    hour: '2-digit', 
                                                    minute: '2-digit' 
                                                });
                                                
                                                return (
                                                    <div
                                                        className="absolute top-0 h-full w-0.5 bg-accent z-20 pointer-events-none"
                                                        style={{ left: `${currentTimePercent}%` }}
                                                    >
                                                        <div className="absolute -top-5 -translate-x-1/2 text-xs font-bold text-accent bg-background px-1 rounded whitespace-nowrap font-mono">
                                                            {timeStr}
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}
                            </div>
                        </div>
                    )}


                     {!isCurrentWeek && (
                        <Button onClick={() => setCurrentDate(getGameTime(new Date()))} className="w-full mt-4">
                            Jump to Current Week
                        </Button>
                    )}
                    
                    {(() => {
                        // Collect categories from events actually shown in the current view
                        const shownCategories = new Set<GameEvent['category']>();
                        daySpecificEventsByDay.forEach(day => {
                            Object.values(day).flat().forEach(event => shownCategories.add(event.category));
                        });
                        filteredMultiDayEvents.forEach(({ event }) => shownCategories.add(event.category));
                        
                        const categoryOrder: GameEvent['category'][] = ['World Boss Crusade', 'Dungeon Unlock', 'Raid Unlock', 'Event', 'Hunting', 'Guild', 'Patrol', 'Social', 'Mini-game', 'Buff', 'Roguelike'];
                        const legendItems = categoryOrder
                            .filter(category => shownCategories.has(category))
                            .map(category => ({
                                name: category,
                                icon: CategoryIcons[category],
                                color: CategoryColors[category]
                            }))
                            .filter(item => item.icon && item.color);
                        
                        if (legendItems.length === 0) return null;
                        
                        return (
                            <div className="border-t pt-4 mt-4">
                                <h4 className="text-sm font-semibold mb-2">Legend</h4>
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-3 gap-y-2">
                                    {legendItems.map(({ name, icon: Icon, color }) => (
                                        <div key={name} className="flex items-center gap-1.5 text-xs">
                                            <div className={cn("h-4 w-4 rounded-sm border flex items-center justify-center flex-shrink-0", color.replace(/bg-\w+\/\d+/, ''))}>
                                                <Icon className={cn("h-2.5 w-2.5", color.replace(/border-\w+/, '').replace(/bg-\w+\/\d+/, ''))} />
                                            </div>
                                            <span className="font-semibold whitespace-nowrap">{name.replace(/([A-Z])/g, ' $1').trim()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}
                </CardContent>
            </Card>
    );
}
