
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Timer, RefreshCw, CalendarDays, Lock } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { getNextDailyReset, getNextWeeklyReset, getNextBiWeeklyReset, formatDuration, formatDurationWithDays, getGameTime } from '@/lib/time';
import { useStimenVaultCompletion } from '@/hooks/useWeeklyCompletions';

const ResetCountdown = ({ title, nextResetFn, formatFn, icon, showCheckbox, isCompleted, onToggleCompletion }: { title: string, nextResetFn: (date: Date) => Date, formatFn: (ms: number) => string, icon: React.ReactNode, showCheckbox?: boolean, isCompleted?: boolean, onToggleCompletion?: () => void }) => {
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const timerId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    if (!now) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                        {icon}
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold font-mono">
                        Loading...
                    </div>
                    <p className="text-xs text-muted-foreground">
                        until next reset
                    </p>
                </CardContent>
            </Card>
        );
    }
    
    const nextReset = nextResetFn(now);
    const timeDifference = nextReset.getTime() - now.getTime();

    return (
        <Card style={isCompleted ? { filter: 'saturate(0.3)', opacity: 0.75 } : undefined}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-medium flex items-center gap-2">
                    {icon}
                    {title}
                </CardTitle>
                {showCheckbox && (
                    <Checkbox
                        checked={isCompleted}
                        onCheckedChange={(checked) => {
                            if (checked !== 'indeterminate' && onToggleCompletion) {
                                onToggleCompletion();
                            }
                        }}
                        className="h-4 w-4"
                    />
                )}
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold font-mono">
                    {formatFn(timeDifference)}
                </div>
                <p className="text-xs text-muted-foreground">
                    until next reset
                </p>
            </CardContent>
        </Card>
    );
};


export default function ResetTimers() {
    const { isCompleted: isStimenCompleted, toggleCompletion: toggleStimenCompletion, mounted: stimenMounted } = useStimenVaultCompletion();
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const timerId = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timerId);
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ResetCountdown 
                title="Daily Reset"
                nextResetFn={getNextDailyReset}
                formatFn={formatDuration}
                icon={<RefreshCw className="h-5 w-5 text-accent" />}
            />
            <ResetCountdown 
                title="Weekly Reset"
                nextResetFn={getNextWeeklyReset}
                formatFn={formatDurationWithDays}
                icon={<CalendarDays className="h-5 w-5 text-accent" />}
            />
            <ResetCountdown 
                title="Stimen Vaults"
                nextResetFn={getNextBiWeeklyReset}
                formatFn={formatDurationWithDays}
                icon={<Lock className="h-5 w-5 text-accent" />}
                showCheckbox={stimenMounted}
                isCompleted={stimenMounted && now ? isStimenCompleted(now) : false}
                onToggleCompletion={() => now && toggleStimenCompletion(now)}
            />
        </div>
    );
}
