

"use client";

import { useState, useMemo, useRef, useEffect, Fragment, memo } from 'react';
import { createPortal } from 'react-dom';
import { events, GameEvent } from '@/lib/events';
import { useEventPreferences, filterEventsByPreferences } from './EventPreferences';
import { getGameTime, toLocalTime, DAILY_RESET_HOUR_UTC, GAME_TIMEZONE_OFFSET } from '@/lib/time';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Star, Crown, Swords, Ghost, Gamepad2, Users, Footprints, Gift, UtensilsCrossed, HeartHandshake, ShieldCheck, KeySquare, CalendarHeart, BrainCircuit, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, addDays, startOfWeek } from 'date-fns';

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

// Reusable tooltip content component for monthly timeline
const MonthlyTooltipContent = memo(({ event, originalStartDate, originalEndDate, range }: { event: GameEvent; originalStartDate: Date; originalEndDate: Date | null; range?: { start: string; end?: string } }) => {
    const dateFormat = 'MMM d, yyyy';
    const isWhimsicalWinterfest = event.name === 'Whimsical Winterfest';
    
    return (
        <div className="rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg max-w-xs">
            <p className="font-bold">{event.name}</p>
            <div className="text-xs text-muted-foreground/80 mt-2 border-t pt-2">
                {originalEndDate ? (
                    <p>Runs from {format(originalStartDate, dateFormat)} until {format(originalEndDate, dateFormat)}</p>
                ) : (
                    <p>Became available on {format(originalStartDate, dateFormat)}</p>
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
    'Social': { bg: 'bg-sky-400/80', border: 'border-sky-400', text: 'text-sky-500' },
    'Mini-game': { bg: 'bg-lime-400/80', border: 'border-lime-400', text: 'text-lime-500' },
    'Patrol': { bg: 'bg-neutral-400/80', border: 'border-neutral-400', text: 'text-neutral-400' },
    'Guild': { bg: 'bg-purple-400/80', border: 'border-purple-400', text: 'text-purple-500' },
    'Buff': { bg: 'bg-emerald-400/80', border: 'border-emerald-400', text: 'text-emerald-500' },
    'Dungeon Unlock': { bg: 'bg-cyan-400/80', border: 'border-cyan-400', text: 'text-cyan-500' },
    'Raid Unlock': { bg: 'bg-teal-400/80', border: 'border-teal-400', text: 'text-teal-300' },
    'Roguelike': { bg: 'bg-purple-500/80', border: 'border-purple-500', text: 'text-purple-300' },
};


const MonthlyEventBar = ({ event, range, monthStart, daysInMonth }: { event: GameEvent; range: { start: string; end?: string }; monthStart: Date; daysInMonth: number }) => {

    const parseDate = (dateString: string) => {
        // Assumes 'YYYY-MM-DD' and interprets it as UTC midnight
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day));
    };

    const eventStart = parseDate(range.start);
    const eventEnd = range.end
        ? parseDate(range.end)
        : new Date(eventStart);

    const viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
    const viewMonthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0, 23, 59, 59));

    // Clamp event dates to the current month view
    const viewStart = eventStart < viewMonthStart ? viewMonthStart : eventStart;
    const viewEnd = eventEnd > viewMonthEnd ? viewMonthEnd : eventEnd;

    // If the event is not in this month, don't render it
    if (viewEnd < viewMonthStart || viewStart > viewMonthEnd) return null;

    let startDay = viewStart.getUTCDate();
    
    // Correctly calculate duration
    const durationDays = (viewEnd.getTime() - viewStart.getTime()) / (1000 * 3600 * 24) + 1;
    if (durationDays < 1) return null;


    const leftPercent = ((startDay - 1) / daysInMonth) * 100;
    const widthPercent = (durationDays / daysInMonth) * 100;


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


    const dateFormat = 'MMM d, yyyy';
    const originalStartDate = parseDate(range.start);
    const originalEndDate = range.end ? parseDate(range.end) : null;
    
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
                className={cn("absolute rounded-lg px-2 py-1 flex items-center gap-2 text-xs font-bold z-10 h-8 cursor-default", colorClasses.bg, colorClasses.border)}
                style={{
                    left: `${leftPercent}%`,
                    width: `max(calc(${widthPercent}% - 2px), 24px)`,
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
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{event.name}</span>
            </div>
            {mounted && isHovered && mousePos && typeof window !== 'undefined' && createPortal(
                <div ref={tooltipRef} style={tooltipStyle}>
                    <MonthlyTooltipContent event={event} originalStartDate={originalStartDate} originalEndDate={originalEndDate} range={range} />
                </div>,
                document.body
            )}
        </>
    );
};

export default function MonthlyTimeline() {
    const { isCategoryEnabled } = useEventPreferences();
    const [now, setNow] = useState<Date | null>(null);

    const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const hasScrolledRef = useRef(false);

    useEffect(() => {
        setNow(new Date());
    }, []);

    const gameNow = useMemo(() => now ? getGameTime(now) : new Date(), [now]);
    const displayNow = gameNow;

    const monthStart = useMemo(() => {
        const d = new Date(Date.UTC(currentMonthDate.getUTCFullYear(), currentMonthDate.getUTCMonth(), 1));
        return d;
    }, [currentMonthDate]);
    
    const daysInMonth = useMemo(() => getDaysInMonth(monthStart.getUTCFullYear(), monthStart.getUTCMonth()), [monthStart]);

    const isCurrentMonth = monthStart.getUTCFullYear() === displayNow.getUTCFullYear() &&
                           monthStart.getUTCMonth() === displayNow.getUTCMonth();
    
    const todayIndex = isCurrentMonth ? gameNow.getUTCDate() - 1 : -1;

    const { dungeonUnlockEvents, raidUnlockEvents, roguelikeEvents, otherEvents } = useMemo(() => {
        const viewMonthStart = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1, 5,0,0));
        const viewMonthEnd = new Date(viewMonthStart);
        viewMonthEnd.setUTCMonth(viewMonthEnd.getUTCMonth() + 1);
        
        // Filter out deprecated patrols from monthly view
        const deprecatedPatrols = ['Ancient City Patrol', 'Brigand Camp Patrol'];

        const checkRange = (range: {start?: string, end?: string}) => {
            if (!range.start) return false; // Must have start date for monthly
            const eventStart = new Date(range.start + 'T00:00:00Z');
            const eventEnd = range.end ? new Date(range.end + 'T00:00:00Z') : null;
             if (eventEnd) { // Has a start and end
                if(eventStart >= viewMonthEnd || addDays(eventEnd,1) <= viewMonthStart) return false;
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
                    return e.dateRanges.some(checkRange);
                }
                if (e.dateRange) {
                    return checkRange(e.dateRange);
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
                        {format(monthStart, 'MMMM yyyy')} (Game Time)
                    </h3>
                    <Button variant="outline" size="icon" onClick={() => changeMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
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
                                      <MonthlyEventBar key={`dungeon-${event.name}-${index}`} event={event} range={event.dateRange!} monthStart={monthStart} daysInMonth={daysInMonth} />
                                  ))}
                               </div>
                             )}
                             {raidUnlockEvents.length > 0 && (
                              <div className="relative h-9">
                                  {raidUnlockEvents.map((event, index) => (
                                      <MonthlyEventBar key={`raid-${event.name}-${index}`} event={event} range={event.dateRange!} monthStart={monthStart} daysInMonth={daysInMonth} />
                                  ))}
                               </div>
                             )}
                             {roguelikeEvents.length > 0 && (
                              <div className="relative h-9">
                                  {roguelikeEvents.map((event, index) => (
                                      <MonthlyEventBar key={`roguelike-${event.name}-${index}`} event={event} range={event.dateRange!} monthStart={monthStart} daysInMonth={daysInMonth} />
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
                                          />
                                        ))}
                                      </Fragment>
                                    ) : event.dateRange ? (
                                      <MonthlyEventBar 
                                        event={event} 
                                        range={event.dateRange}
                                        monthStart={monthStart} 
                                        daysInMonth={daysInMonth} 
                                      />
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        
                        {/* Current Day Indicator */}
                        {isCurrentMonth && (
                            <div
                                className="absolute top-0 h-full w-0.5 bg-accent z-10"
                                style={{ left: `calc(${((todayIndex) / daysInMonth) * 100}% + (100% / ${daysInMonth} / 2))` }}
                            >
                               <div className="absolute -top-5 -translate-x-1/2 text-xs font-bold text-accent bg-background px-1 rounded">TODAY</div>
                            </div>
                        )}
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
