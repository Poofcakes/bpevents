

"use client";

import { useMemo, Fragment, useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Star, Swords, Zap, Crown, Gamepad2, Footprints, Users, Gift, UtensilsCrossed, HeartHandshake, ShieldCheck, Clock, KeySquare, Trophy, ChevronLeft, ChevronRight, BrainCircuit, ShieldAlert, RotateCcw, Ghost, CalendarHeart, Target } from 'lucide-react';
import { getGameTime, getWeekPeriod, getGameDate } from '@/lib/time';
import { format, getWeek, isSameDay, startOfDay, differenceInCalendarWeeks, addDays } from 'date-fns';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { useWeeklyCompletions } from '@/hooks/useWeeklyCompletions';
import { TimeDisplayMode } from '@/app/page';
import { toLocalTime } from '@/lib/time';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GAME_LAUNCH_DATE = new Date('2025-10-09T05:00:00Z'); // Game launches at reset time on Thursday Oct 9th.
// The ISO week for Oct 9, 2025 starts on Monday, Oct 6, 2025
const GAME_LAUNCH_WEEK_START = new Date('2025-10-06T00:00:00Z');

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
    'Boss': 'bg-destructive/20 text-destructive-foreground',
    'World Boss Crusade': 'bg-amber-400/20 text-amber-500',
    'Event': 'bg-purple-400/20 text-purple-500',
    'Hunting': 'bg-red-500/20 text-red-500',
    'Social': 'bg-sky-400/20 text-sky-500',
    'Mini-game': 'bg-lime-400/20 text-lime-500',
    'Patrol': 'bg-neutral-400/20 text-neutral-400',
    'Guild': 'bg-purple-400/20 text-purple-500',
    'Buff': 'bg-emerald-400/20 text-emerald-500',
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


const isDailyEvent = (event: GameEvent) => {
    const { schedule } = event;
    if (schedule.type === 'hourly' || schedule.type === 'multi-hourly' || schedule.type === 'daily-intervals') {
        return true;
    }
    if ((schedule.type === 'daily-specific' || schedule.type === 'daily-intervals-specific') && schedule.days.length === 7) {
        return true;
    }
    return false;
}

const WeeklyEvent = ({ event, isCompleted, onToggleCompletion, isCurrentWeek }: { event: GameEvent, isCompleted: boolean | undefined, onToggleCompletion: () => void, isCurrentWeek: boolean }) => {
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
        const uniqueTimes = [...new Set(schedule.times.map(t => {
            const d = new Date();
            d.setUTCHours(t.hour, t.minute);
            return d.toLocaleTimeString('en-US', { timeZone, hour: '2-digit', minute: '2-digit' });
        }))];
        timeSummary = uniqueTimes.slice(0, 2).join(', ') + (uniqueTimes.length > 2 ? '...' : '');
    } else if (schedule.type === 'multi-hourly') {
        timeSummary = `Every ${schedule.hours}h`;
    } else if (schedule.type === 'hourly') {
        timeSummary = `Every hour at :${String(schedule.minute).padStart(2, '0')}`;
    } else if (schedule.type === 'daily-intervals' || schedule.type === 'daily-intervals-specific') {
         const uniqueTimes = [...new Set(schedule.intervals.map(t => {
            const d = new Date();
            d.setUTCHours(t.start.hour, t.start.minute);
            return d.toLocaleTimeString('en-US', { timeZone, hour: '2-digit', minute: '2-digit' });
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
                {isCurrentWeek && (
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
                )}
                        <div className="flex items-center gap-1">
                            {event.seasonalCategory && (() => {
                            const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                            return SeasonalIcon ? (
                                <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                            ) : null;
                        })()}
                        <Icon className="h-4 w-4 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                    </div>
                    <span className="truncate flex-1">{event.name}</span>
                    {(event.dateRange || event.dateRanges) && (
                                <Clock className="h-3 w-3 text-muted-foreground" />
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

const WeeklyEventBar = ({ event, daySpans, isCompleted, onToggleCompletion, isCurrentWeek }: { event: GameEvent; daySpans: number[]; isCompleted: boolean | undefined; onToggleCompletion: () => void; isCurrentWeek: boolean }) => {
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

    const firstDayIndex = daySpans[0];
    const span = daySpans.length;

    const left = `${(firstDayIndex / 7) * 100}%`;
    const width = `${(span / 7) * 100}%`;

    let timeSummary = '';
    const schedule = event.schedule;
    const dateFormat = 'MMM d, yyyy';

    if (schedule.type === 'daily-intervals' || schedule.type === 'daily-intervals-specific') {
        timeSummary = schedule.intervals.map(iv => {
            const start = new Date(0);
            start.setUTCHours(iv.start.hour, iv.start.minute);
            const end = new Date(0);
            end.setUTCHours(iv.end.hour, iv.end.minute);
            const formatOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', timeZone };
            return `${start.toLocaleTimeString('en-US', formatOptions)} - ${end.toLocaleTimeString('en-US', formatOptions)}`;
        }).join(', ');
    } else if (schedule.type === 'daily-specific') {
         const uniqueTimes = [...new Set(schedule.times.map(t => {
            const d = new Date();
            d.setUTCHours(t.hour, t.minute);
            return d.toLocaleTimeString('en-US', { timeZone, hour: '2-digit', minute: '2-digit' });
        }))];
        timeSummary = uniqueTimes.join(', ');
    } else if (isDailyEvent(event)) {
        timeSummary = 'Resets daily';
    }

    return (
        <div className="px-px" style={{ paddingTop: '2px', paddingBottom: '2px'}}>
                    <div
                className={cn("rounded-md px-2 py-1 flex items-center gap-2 text-xs font-semibold cursor-default h-7 relative", colorClass)}
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
                {(isCurrentWeek || isCompleted !== undefined) && (
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
                )}
                        <div className="flex items-center gap-1">
                            {event.seasonalCategory && (() => {
                                const SeasonalIcon = SeasonalCategoryIcons[event.seasonalCategory];
                                return SeasonalIcon ? (
                                    <SeasonalIcon className="h-2.5 w-2.5 flex-shrink-0 opacity-70" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                                ) : null;
                            })()}
                            <Icon className="h-4 w-4 flex-shrink-0" style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined} />
                        </div>
                        <span className="truncate flex-1">{event.name}</span>
                        {(event.dateRange || event.dateRanges) && (
                                    <Clock className="h-3 w-3 text-muted-foreground" />
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


export default function WeeklyTimeline({ timeMode = 'game' }: { timeMode?: TimeDisplayMode }) {
    const { isCategoryEnabled } = useEventPreferences();
    const { isEventCompleted, toggleEventCompletion, resetWeek, mounted: weeklyCompletionsMounted } = useWeeklyCompletions();
    const [currentDate, setCurrentDate] = useState(() => new Date());
    const [hideDaily, setHideDaily] = useState(false);
    const [hidePermanent, setHidePermanent] = useState(false);
    
    // This state is just to force a re-render when the user navigates,
    // ensuring the memoized calculations run again.
    const [_, setForceUpdate] = useState(0);

    useEffect(() => {
        setCurrentDate(getGameTime(new Date()));
    }, []);

    const changeWeek = (amount: number) => {
        setCurrentDate(prev => {
            const newDate = new Date(prev);
            newDate.setUTCDate(newDate.getUTCDate() + (amount * 7));
            return newDate;
        });
        setForceUpdate(val => val + 1);
    };

    const { weekDates, weekRangeFormatted, gameWeekNumber, calendarWeekNumber, todayIndex, isCurrentWeek, biWeeklyPeriod } = useMemo(() => {
        const gameNow = getGameTime(currentDate);
        const startOfWeek = new Date(gameNow);
        startOfWeek.setUTCHours(0, 0, 0, 0);
        const dayOfWeek = (startOfWeek.getUTCDay() + 6) % 7; // Monday is 0
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - dayOfWeek);
        
        const dates = Array.from({length: 7}).map((_, i) => {
            const d = new Date(startOfWeek);
            d.setUTCDate(startOfWeek.getUTCDate() + i);
            return d;
        });

        const endOfWeek = dates[6];
        const rangeFormat = 'MMM d';
        const formatted = `${format(startOfWeek, rangeFormat)} - ${format(endOfWeek, `${rangeFormat}, yyyy`)}`;
        
        const calWeekNum = getWeek(gameNow, { weekStartsOn: 1 });

        // Calculate today index based on selected timezone
        const now = new Date();
        let currentDayIndex = -1;
        if (timeMode === 'local') {
            // For local time, compare dates directly in local timezone
            const localNow = now;
            const localDate = new Date(localNow.getFullYear(), localNow.getMonth(), localNow.getDate());
            currentDayIndex = dates.findIndex(d => {
                const weekDate = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
                return localDate.getTime() === weekDate.getTime();
            });
        } else {
            // For game time, use game date
            const gameNowDate = getGameDate(now);
            currentDayIndex = dates.findIndex(d => isSameDay(d, gameNowDate));
        }

        const _isCurrentWeek = currentDayIndex !== -1;
        
        const period = getWeekPeriod(gameNow);

        // Calculate game week number relative to the launch week
        const gameWeekNum = differenceInCalendarWeeks(startOfWeek, GAME_LAUNCH_WEEK_START, { weekStartsOn: 1 }) + 1;

        return { weekDates: dates, weekRangeFormatted: formatted, gameWeekNumber: gameWeekNum, calendarWeekNumber: calWeekNum, todayIndex: currentDayIndex, isCurrentWeek: _isCurrentWeek, biWeeklyPeriod: period };
    }, [currentDate, timeMode]);
    
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
                            const shouldShowCheckbox = (event.category === 'World Boss Crusade' || event.name === 'Guild Dance' || event.name === 'Snowman Strike! (Hunting Event)');
                            return (
                                <WeeklyEvent 
                                    key={event.name} 
                                    event={event}
                                    isCompleted={shouldShowCheckbox && weeklyCompletionsMounted ? isEventCompleted(event.name, weekDates[dayIndex]) : undefined}
                                    onToggleCompletion={() => toggleEventCompletion(event.name, weekDates[dayIndex])}
                                    isCurrentWeek={shouldShowCheckbox}
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
                                    {gameWeekNumber > 0 ? `Game Week ${gameWeekNumber}` : 'Pre-Launch'}
                                </CardTitle>
                                <p className="text-sm text-muted-foreground">
                                    {weekRangeFormatted}
                                </p>
                                <p className="text-xs text-muted-foreground/80">
                                    (Calendar Week {calendarWeekNumber})
                                </p>
                            </div>
                        <div className="flex items-center gap-2">
                            {weeklyCompletionsMounted && (() => {
                                // Collect all World Boss Crusade, Guild Dance, and Snowman Strike event names in the current week
                                const weeklyEventNames: string[] = [];
                                daySpecificEventsByDay.forEach(day => {
                                    Object.values(day).flat().forEach(event => {
                                        if ((event.category === 'World Boss Crusade' || event.name === 'Guild Dance' || event.name === 'Snowman Strike! (Hunting Event)') && !weeklyEventNames.includes(event.name)) {
                                            weeklyEventNames.push(event.name);
                                        }
                                    });
                                });
                                filteredMultiDayEvents.forEach(({ event }) => {
                                    if ((event.category === 'World Boss Crusade' || event.name === 'Guild Dance' || event.name === 'Snowman Strike! (Hunting Event)') && !weeklyEventNames.includes(event.name)) {
                                        weeklyEventNames.push(event.name);
                                    }
                                });
                                
                                return (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => resetWeek(weekDates[0], weeklyEventNames)}
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
                    <div className="grid grid-cols-7 gap-px bg-border/20 rounded-lg overflow-hidden border border-border/20">
                        {DAY_NAMES.map((day, i) => (
                             <div key={day} className={cn(
                                 "text-center font-bold p-2 bg-card",
                                 isCurrentWeek && i === todayIndex && "bg-accent/20"
                                 )}>
                                <p className="text-lg">{day}</p>
                                <p className="text-sm font-normal text-muted-foreground">{weekDates[i].getUTCDate()}</p>
                             </div>
                        ))}
                        
                        {daySpecificEventsByDay.map((dayCategories, dayIndex) => {
                            // In Game Week 1, clear events before Thursday (index 3)
                            if (gameWeekNumber === 1 && dayIndex < 3) {
                                return <EventColumn key={`specific-${dayIndex}`} dayIndex={dayIndex} dayCategories={{}} />;
                            }
                            return <EventColumn key={`specific-${dayIndex}`} dayIndex={dayIndex} dayCategories={dayCategories} />;
                        })}
                    </div>

                    {filteredMultiDayEvents.length > 0 && (
                        <div className="mt-px">
                            <div className="relative bg-border/20 rounded-lg overflow-hidden border border-border/20">
                                <div className="absolute top-0 left-0 grid grid-cols-7 h-full w-full -z-10 bg-card/50">
                                    {DAY_NAMES.map((_, i) => (
                                        <div key={i} className={cn("h-full", i > 0 && "border-l border-border/20")} />
                                    ))}
                                </div>
                                <div className="space-y-1 p-1">
                                    {filteredMultiDayEvents.map(({ event, daySpans }, index) => (
                                        <WeeklyEventBar 
                                            key={`${event.name}-${daySpans[0]}-${index}`} 
                                            event={event} 
                                            daySpans={daySpans}
                                            isCompleted={(event.category === 'World Boss Crusade' || event.name === 'Guild Dance' || event.name === 'Snowman Strike! (Hunting Event)') && weeklyCompletionsMounted ? isEventCompleted(event.name, weekDates[daySpans[0]]) : undefined}
                                            onToggleCompletion={() => toggleEventCompletion(event.name, weekDates[daySpans[0]])}
                                            isCurrentWeek={(event.category === 'World Boss Crusade' || event.name === 'Guild Dance' || event.name === 'Snowman Strike! (Hunting Event)')}
                                        />
                                    ))}
                                </div>
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
