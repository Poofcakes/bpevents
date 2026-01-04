

"use client";

import { useState, useMemo, useRef, useEffect, Fragment, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { getGameTime, toLocalTime, DAILY_RESET_HOUR_UTC, GAME_TIMEZONE_OFFSET, formatDuration, formatDurationWithDays } from '@/lib/time';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Star, Crown, Swords, Ghost, Gamepad2, Users, Footprints, Gift, UtensilsCrossed, HeartHandshake, ShieldCheck, KeySquare, CalendarHeart, BrainCircuit, ShieldAlert, RotateCcw, Target, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';
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
    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
    // Default to 5 AM (7 AM UTC) if we can't determine
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        const intervals = event.schedule.intervals;
        if (intervals && intervals.length > 0) {
            // Times are in UTC-2, convert to UTC by adding 2 hours
            date.setUTCHours(intervals[0].start.hour + 2, intervals[0].start.minute, 0, 0);
            return date;
        }
    }
    if (event.schedule.type === 'daily-specific') {
        const times = event.schedule.times;
        if (times && times.length > 0) {
            // Times are in UTC-2, convert to UTC by adding 2 hours
            date.setUTCHours(times[0].hour + 2, times[0].minute, 0, 0);
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
    // Times in events.ts are in UTC-2 (game time), convert to UTC by adding 2 hours
    if (event.schedule.type === 'daily-intervals' || event.schedule.type === 'daily-intervals-specific') {
        const intervals = event.schedule.intervals;
        if (intervals && intervals.length > 0) {
            const lastInterval = intervals[intervals.length - 1];
            // Times are in UTC-2, convert to UTC by adding 2 hours
            const endHourUTC = lastInterval.end.hour + 2;
            date.setUTCHours(endHourUTC, lastInterval.end.minute, 0, 0);
            // If the interval crosses midnight (end hour < start hour), the end time is on the next day
            // Also handle case where end hour is 0 (midnight) which means it's the next day
            if (lastInterval.end.hour < lastInterval.start.hour || lastInterval.end.hour === 0) {
                date.setUTCDate(date.getUTCDate() + 1);
            }
            // Handle hour >= 24 after adding 2 hours
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
            // Times are in UTC-2, convert to UTC by adding 2 hours
            date.setUTCHours(lastTime.hour + 2, lastTime.minute, 0, 0);
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
const MonthlyTooltipContent = memo(({ event, exactStartTime, exactEndTime, timeMode, timeFormat, selectedTimezone }: { event: GameEvent; exactStartTime: Date; exactEndTime: Date | null; timeMode: TimeDisplayMode; timeFormat: TimeFormat; selectedTimezone?: string }) => {
    const [now, setNow] = useState<Date | null>(null);
    const [timezone, setTimezone] = useState<string>(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    useEffect(() => {
        setNow(new Date());
        const timerId = setInterval(() => {
            setNow(new Date());
            // Update timezone in case it changed
            setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        }, 1000);
        return () => clearInterval(timerId);
    }, []);
    
    const dateFormat = 'MMM d, yyyy';
    const timeFormatStr = timeFormat === '12h' ? 'hh:mm a' : 'HH:mm';
    const isWhimsicalWinterfest = event.name === 'Whimsical Winterfest';
    
    // Validate dates before formatting
    const isValidStart = exactStartTime && !isNaN(exactStartTime.getTime());
    const isValidEnd = exactEndTime && !isNaN(exactEndTime.getTime());
    
    // exactStartTime and exactEndTime are stored in UTC
    // Always use selectedTimezone for formatting
    // When game time is on, selectedTimezone is 'Etc/GMT+2' (UTC-2)
    // When local time is on, selectedTimezone is the user's selected timezone
    const tz = selectedTimezone || undefined;
    
    // Format dates and times directly using the UTC dates with the selected timezone
    const startDateStr = exactStartTime && isValidStart
        ? exactStartTime.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' })
        : 'Invalid date';
    const startTimeStr = exactStartTime && isValidStart
        ? exactStartTime.toLocaleTimeString('en-US', { timeZone: tz, hour12: timeFormat === '12h', hour: '2-digit', minute: '2-digit' })
        : '--:--';
    const endDateStr = exactEndTime && isValidEnd
        ? exactEndTime.toLocaleDateString('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric' })
        : null;
    const endTimeStr = exactEndTime && isValidEnd
        ? exactEndTime.toLocaleTimeString('en-US', { timeZone: tz, hour12: timeFormat === '12h', hour: '2-digit', minute: '2-digit' })
        : null;
    
    // Helper function to format duration - use days format if longer than 24 hours
    const formatDurationSmart = (ms: number): string => {
        const HOURS_24_MS = 24 * 60 * 60 * 1000;
        return ms >= HOURS_24_MS ? formatDurationWithDays(ms) : formatDuration(ms);
    };
    
    // Calculate total event duration
    let totalDuration: string | null = null;
    if (exactEndTime && isValidEnd && isValidStart) {
        const durationMs = exactEndTime.getTime() - exactStartTime.getTime();
        totalDuration = formatDurationSmart(durationMs);
    }
    
    // Calculate timer information
    let timeInfo: string | null = null;
    if (now && isValidStart) {
        const nowTime = now.getTime();
        const startTime = exactStartTime.getTime();
        const timeUntilStart = startTime - nowTime;
        
        if (exactEndTime && isValidEnd) {
            const endTime = exactEndTime.getTime();
            const timeUntilEnd = endTime - nowTime;
            
            if (timeUntilStart > 0) {
                // Event hasn't started yet
                timeInfo = `Starts in ${formatDurationSmart(timeUntilStart)}`;
            } else if (timeUntilEnd > 0) {
                // Event is active
                timeInfo = `Active! ${formatDurationSmart(timeUntilEnd)} left`;
            } else {
                // Event has ended
                const timeAgo = nowTime - endTime;
                timeInfo = `Ended ${formatDurationSmart(timeAgo)} ago`;
            }
        } else {
            // No end time - just show when it started
            if (timeUntilStart > 0) {
                timeInfo = `Starts in ${formatDurationSmart(timeUntilStart)}`;
            } else {
                const timeAgo = nowTime - startTime;
                timeInfo = `Started ${formatDurationSmart(timeAgo)} ago`;
            }
        }
    }
    
    return (
        <div className="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg max-w-xs">
            <p className="font-bold">{event.name}</p>
            <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2">
                {exactEndTime && isValidEnd ? (
                    <p>Runs from {startDateStr} {startTimeStr} until {endDateStr} {endTimeStr}</p>
                ) : (
                    <p>Became available on {startDateStr} {startTimeStr}</p>
                )}
                {totalDuration && (
                    <p className="mt-1">Total duration: {totalDuration}</p>
                )}
            </div>
            {timeInfo && (
                <p className={cn(
                    "text-sm font-medium mt-2",
                    timeInfo.includes('Active!') ? "text-green-400" : 
                    timeInfo.includes('ago') ? "text-muted-foreground" : 
                    "text-accent"
                )}>
                    {timeInfo}
                </p>
            )}
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


const MonthlyEventBar = ({ event, range, monthStart, daysInMonth, isCompleted, onToggleCompletion, currentTime, timeMode, timeFormat, selectedTimezone }: { event: GameEvent; range: { start: string; end?: string }; monthStart: Date; daysInMonth: number; isCompleted: boolean; onToggleCompletion: () => void; currentTime: Date; timeMode: TimeDisplayMode; timeFormat: TimeFormat; selectedTimezone?: string }) => {

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

    // Convert to display time using selectedTimezone
    // For positioning, we always use UTC and apply timezone offset
    // The exactStartTime/exactEndTime are kept as UTC for internal calculations
    const exactStartTime = exactStartTimeUTC;
    const exactEndTime = exactEndTimeUTC;

    // Calculate month boundaries for positioning
    // We use UTC-based boundaries for internal calculations (positioning)
    // but all formatting will use selectedTimezone
    const viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 0, 0, 0, 0));
    const viewMonthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    // Clamp to month boundaries for display
    const displayStartTime = exactStartTime < viewMonthStart ? viewMonthStart : exactStartTime;
    const displayEndTime = exactEndTime && exactEndTime > viewMonthEnd ? viewMonthEnd : (exactEndTime || displayStartTime);

    // If the event is not in this month, don't render it
    if (displayEndTime < viewMonthStart || displayStartTime > viewMonthEnd) return null;

    // Calculate timezone offset for positioning (same approach as "now" line)
    // Always use selectedTimezone if provided, otherwise fall back based on timeMode
    // Never use system timezone when selectedTimezone is explicitly provided (even if empty string means use game time)
    const tz = selectedTimezone && selectedTimezone !== '' 
        ? selectedTimezone 
        : (timeMode === 'game' ? 'Etc/GMT+2' : Intl.DateTimeFormat().resolvedOptions().timeZone);
    
    // Use the same getTimezoneOffset function pattern as the "now" line
    // Calculate offset using the start time of the event
    const getTimezoneOffset = (tz: string, date: Date): number => {
        const utcFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const tzFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const utcParts = utcFormatter.formatToParts(date);
        const tzParts = tzFormatter.formatToParts(date);
        
        const utcHour = parseInt(utcParts.find(p => p.type === 'hour')?.value || '0');
        const utcMinute = parseInt(utcParts.find(p => p.type === 'minute')?.value || '0');
        const tzHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0');
        const tzMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0');
        
        const utcTotalMinutes = utcHour * 60 + utcMinute;
        const tzTotalMinutes = tzHour * 60 + tzMinute;
        const offsetMinutes = tzTotalMinutes - utcTotalMinutes;
        
        let adjustedOffsetMinutes = offsetMinutes;
        if (offsetMinutes > 12 * 60) {
            adjustedOffsetMinutes = offsetMinutes - 24 * 60;
        } else if (offsetMinutes < -12 * 60) {
            adjustedOffsetMinutes = offsetMinutes + 24 * 60;
        }
        
        return adjustedOffsetMinutes * 60 * 1000;
    };
    
    // Calculate timezone offset for both start and end times
    const startTimezoneOffsetMs = getTimezoneOffset(tz, displayStartTime);
    const endTimezoneOffsetMs = displayEndTime ? getTimezoneOffset(tz, displayEndTime) : startTimezoneOffsetMs;
    
    // Calculate position based on hour precision: position as fraction of month duration
    // Shift the times by the timezone offset for positioning (same as "now" line)
    const monthStartTimestamp = viewMonthStart.getTime();
    const monthDurationMs = viewMonthEnd.getTime() - monthStartTimestamp;
    // Apply timezone offset to shift the event position, same way as displayNow for "now" line
    const shiftedStartTime = new Date(displayStartTime.getTime() + startTimezoneOffsetMs);
    const shiftedEndTime = displayEndTime ? new Date(displayEndTime.getTime() + endTimezoneOffsetMs) : shiftedStartTime;
    const startOffsetMs = shiftedStartTime.getTime() - monthStartTimestamp;
    const endOffsetMs = shiftedEndTime.getTime() - monthStartTimestamp;
    const widthMs = endOffsetMs - startOffsetMs;

    const leftPercent = (startOffsetMs / monthDurationMs) * 100;
    const widthPercent = (widthMs / monthDurationMs) * 100;

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
                    "absolute px-2 py-1 flex items-center gap-2 text-xs font-bold z-30 h-8 cursor-default border transition-all duration-200",
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
                    ...(isCompleted && { filter: 'saturate(0.3)', opacity: 0.75 }),
                    pointerEvents: 'auto',
                    zIndex: 30
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
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={isCompleted}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        onToggleCompletion();
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                    }}
                    className={cn(
                        "h-3 w-3 shrink-0 rounded-sm border border-white bg-white ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center cursor-pointer",
                        isCompleted && "bg-white border-white text-accent"
                    )}
                    style={{ pointerEvents: 'auto', zIndex: 9999, position: 'relative' }}
                >
                    {isCompleted && (
                        <Check className="h-3 w-3 -mt-0.5" />
                    )}
                </button>
                <Icon className="h-4 w-4 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                    <span className="truncate">{event.name}</span>
                {continuesToNextMonth && (
                    <ChevronRight className="h-3 w-3 flex-shrink-0 opacity-60 ml-auto" />
                    )}
                </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <MonthlyTooltipContent event={event} exactStartTime={exactStartTimeUTC} exactEndTime={exactEndTimeUTC} timeMode={timeMode} timeFormat={timeFormat} selectedTimezone={selectedTimezone} />
                </div>,
                document.body
            )}
        </>
    );
};

export default function MonthlyTimeline({ timeMode = 'game', timeFormat = '24h', selectedTimezone }: { timeMode?: TimeDisplayMode; timeFormat?: TimeFormat; selectedTimezone?: string }) {
    const { isCategoryEnabled } = useEventPreferences();
    const { isEventCompleted: isMonthlyEventCompletedBase, toggleEventCompletion: toggleMonthlyEventCompletion, resetMonth, mounted: monthlyCompletionsMounted } = useMonthlyCompletions();
    const [now, setNow] = useState<Date | null>(null);
    // Use selectedTimezone if provided, otherwise fall back to browser timezone
    const timezone = selectedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    useEffect(() => {
        setNow(new Date());
        const timerId = setInterval(() => {
            setNow(new Date());
        }, 1000);
        return () => clearInterval(timerId);
    }, []);
    
    // Use the base completion check - allow marking events as completed even if they haven't ended yet
    const isMonthlyEventCompleted = useCallback((eventName: string, range: { start: string; end?: string }, event?: GameEvent) => {
        return isMonthlyEventCompletedBase(eventName, range);
    }, [isMonthlyEventCompletedBase]);

    const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);

    // Ensure now is initialized
    useEffect(() => {
        if (!now) {
        setNow(new Date());
        }
    }, [now]);

    const gameNow = useMemo(() => now ? getGameTime(now) : new Date(), [now]);
    
    // Calculate timezone offset difference for positioning the "now" line
    // We need to shift the "now" line based on the difference between selectedTimezone and UTC
    const getTimezoneOffset = useCallback((tz: string, date: Date): number => {
        // Use a known UTC date and format it in both UTC and the target timezone
        // The difference in hours/minutes gives us the offset
        const utcFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const tzFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        const utcParts = utcFormatter.formatToParts(date);
        const tzParts = tzFormatter.formatToParts(date);
        
        const utcHour = parseInt(utcParts.find(p => p.type === 'hour')?.value || '0');
        const utcMinute = parseInt(utcParts.find(p => p.type === 'minute')?.value || '0');
        const tzHour = parseInt(tzParts.find(p => p.type === 'hour')?.value || '0');
        const tzMinute = parseInt(tzParts.find(p => p.type === 'minute')?.value || '0');
        
        // Calculate offset in milliseconds
        const utcTotalMinutes = utcHour * 60 + utcMinute;
        const tzTotalMinutes = tzHour * 60 + tzMinute;
        const offsetMinutes = tzTotalMinutes - utcTotalMinutes;
        
        // Handle day rollover (e.g., UTC is 23:00, timezone is 01:00 next day = +2 hours)
        // If the difference is more than 12 hours, it's likely a day rollover
        let adjustedOffsetMinutes = offsetMinutes;
        if (offsetMinutes > 12 * 60) {
            adjustedOffsetMinutes = offsetMinutes - 24 * 60;
        } else if (offsetMinutes < -12 * 60) {
            adjustedOffsetMinutes = offsetMinutes + 24 * 60;
        }
        
        return adjustedOffsetMinutes * 60 * 1000;
    }, []);
    
    // For positioning the "now" line, shift it based on timezone difference
    const displayNow = useMemo(() => {
        if (!now) return new Date();
        const tz = selectedTimezone && selectedTimezone !== '' 
            ? selectedTimezone 
            : (timeMode === 'game' ? 'Etc/GMT+2' : Intl.DateTimeFormat().resolvedOptions().timeZone);
        const timezoneOffsetMs = getTimezoneOffset(tz, now);
        // Return a date shifted by the timezone offset for positioning
        return new Date(now.getTime() + timezoneOffsetMs);
    }, [now, selectedTimezone, timeMode, getTimezoneOffset]);

    const monthStart = useMemo(() => {
        const d = new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth(), 1));
        return d;
    }, [currentMonthDate]);
    
    const daysInMonth = useMemo(() => getDaysInMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth()), [monthStart]);

    // Calculate isCurrentMonth and todayIndex using selectedTimezone calendar dates
    const isCurrentMonth = useMemo(() => {
        if (!now) return false;
        const tz = selectedTimezone && selectedTimezone !== '' 
            ? selectedTimezone 
            : (timeMode === 'game' ? 'Etc/GMT+2' : Intl.DateTimeFormat().resolvedOptions().timeZone);
        // Get current calendar date in the selected timezone
        const currentYear = parseInt(now.toLocaleString('en-US', { timeZone: tz, year: 'numeric' }));
        const currentMonth = parseInt(now.toLocaleString('en-US', { timeZone: tz, month: 'numeric' })) - 1; // Month is 0-indexed
        
        return monthStart.getUTCFullYear() === currentYear &&
               monthStart.getUTCMonth() === currentMonth;
    }, [monthStart, now, selectedTimezone, timeMode]);
    
    const todayIndex = useMemo(() => {
        if (!isCurrentMonth) return -1;
        if (!now) return -1;
        
        const tz = selectedTimezone && selectedTimezone !== '' 
            ? selectedTimezone 
            : (timeMode === 'game' ? 'Etc/GMT+2' : Intl.DateTimeFormat().resolvedOptions().timeZone);
        // Get current calendar date in the selected timezone
        const currentDay = parseInt(now.toLocaleString('en-US', { timeZone: tz, day: 'numeric' }));
        // monthStart is the 1st, so today's index is currentDay - 1
        return currentDay - 1;
    }, [isCurrentMonth, now, selectedTimezone, timeMode]);

    const { seasonEvents, dungeonUnlockEvents, raidUnlockEvents, roguelikeEvents, otherEvents } = useMemo(() => {
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
            seasonEvents: allEvents.filter(e => e.seasonalCategory === 'Season 1' || e.seasonalCategory === 'Season 2'),
            dungeonUnlockEvents: allEvents.filter(e => e.category === 'Dungeon Unlock'),
            raidUnlockEvents: allEvents.filter(e => e.category === 'Raid Unlock'),
            roguelikeEvents: allEvents.filter(e => e.category === 'Roguelike'),
            otherEvents: allEvents.filter(e => e.category !== 'Dungeon Unlock' && e.category !== 'Raid Unlock' && e.category !== 'Roguelike' && e.seasonalCategory !== 'Season 1' && e.seasonalCategory !== 'Season 2'),
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
        const allEvents = [...seasonEvents, ...dungeonUnlockEvents, ...raidUnlockEvents, ...roguelikeEvents, ...otherEvents];
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
    }, [seasonEvents, dungeonUnlockEvents, raidUnlockEvents, roguelikeEvents, otherEvents]);

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
                             {seasonEvents.length > 0 && (
                               <div className="relative h-9">
                                  {seasonEvents.map((event, index) => (
                                      <MonthlyEventBar 
                                          key={`season-${event.name}-${index}`} 
                                          event={event} 
                                          range={event.dateRange!} 
                                          monthStart={monthStart} 
                                          daysInMonth={daysInMonth}
                                          isCompleted={monthlyCompletionsMounted && isMonthlyEventCompleted(event.name, event.dateRange!, event)}
                                          onToggleCompletion={() => toggleMonthlyEventCompletion(event.name, event.dateRange!)}
                                          currentTime={now!}
                                          timeMode={timeMode}
                                          timeFormat={timeFormat}
                                          selectedTimezone={selectedTimezone}
                                      />
                                  ))}
                               </div>
                             )}
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
                                          selectedTimezone={selectedTimezone}
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
                                          selectedTimezone={selectedTimezone}
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
                                          selectedTimezone={selectedTimezone}
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
                                            selectedTimezone={selectedTimezone}
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
                                        selectedTimezone={selectedTimezone}
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
                            
                            // Use UTC-based month boundaries for positioning calculations
                            // All formatting will use selectedTimezone
                            viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 0, 0, 0));
                            viewMonthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59));
                            
                            // Calculate position of current time within the month
                            const monthStartTimestamp = viewMonthStart.getTime();
                            const monthDurationMs = viewMonthEnd.getTime() - monthStartTimestamp;
                            const currentOffsetMs = displayNow.getTime() - monthStartTimestamp;
                            const currentTimePercent = (currentOffsetMs / monthDurationMs) * 100;
                            
                            // Only show if current time is within this month
                            if (currentTimePercent >= 0 && currentTimePercent <= 100) {
                                // Always use selectedTimezone for formatting
                                const tz = selectedTimezone && selectedTimezone !== '' 
                                    ? selectedTimezone 
                                    : timezone;
                                const timeStr = displayNow.toLocaleTimeString('en-US', { timeZone: tz, hour12: timeFormat === '12h', hour: '2-digit', minute: '2-digit' });
                                
                                return (
                                    <div
                                        className="absolute top-0 h-full w-0.5 bg-accent z-40 pointer-events-none"
                                        style={{ left: `${currentTimePercent}%` }}
                                    >
                                        <div className="absolute -top-5 -translate-x-1/2 text-xs font-bold text-accent bg-background px-1 rounded whitespace-nowrap pointer-events-none">
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
