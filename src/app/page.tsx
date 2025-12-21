
"use client";

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import DailyTimeline from '@/components/DailyTimeline';
import WeeklyTimeline from '@/components/WeeklyTimeline';
import MonthlyTimeline from '@/components/MonthlyTimeline';
import ResetTimers from '@/components/ResetTimers';
import Image from 'next/image';
import Link from 'next/link';
import AccentColorSelector from '@/components/AccentColorSelector';
import { EventPreferencesPanel, EventPreferencesProvider } from '@/components/EventPreferences';
import RebuildingPage from '@/components/RebuildingPage';
import { getImagePath } from '@/lib/utils';
import { AlarmClock, Calendar, CalendarDays, CalendarRange, Target } from 'lucide-react';

export type TimeDisplayMode = 'game' | 'local';
export type TimeFormat = '12h' | '24h';

export default function Home() {
  const [timeMode, setTimeMode] = useState<TimeDisplayMode>('local');
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('24h');
  const [mounted, setMounted] = useState(false);
  const [isRebuilding, setIsRebuilding] = useState(false);

  // Check if site is rebuilding (showing README or 404)
  useEffect(() => {
    if (typeof window === 'undefined' || !mounted) return;

    const checkRebuilding = () => {
      // Wait a bit for React to hydrate
      setTimeout(() => {
        const bodyText = document.body.innerText || '';
        const hasReadmeContent = bodyText.includes('README') || 
                                 (bodyText.includes('# BP') && bodyText.includes('Installation')) ||
                                 bodyText.includes('npm install') ||
                                 bodyText.includes('## Getting Started');
        
        // Check if we have the expected React app structure
        const hasReactApp = document.querySelector('main') || 
                           document.querySelector('header') ||
                           bodyText.includes('BP:SR Event Tracker') ||
                           document.querySelector('[data-react-app="true"]');
        
        // If we see README content but no React app structure, we're rebuilding
        if (hasReadmeContent && !hasReactApp) {
          setIsRebuilding(true);
        }
      }, 1500); // Give React time to hydrate
    };

    checkRebuilding();
  }, [mounted]);

  // Load preferences from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const savedTimeMode = localStorage.getItem('timeMode') as TimeDisplayMode | null;
    const savedTimeFormat = localStorage.getItem('timeFormat') as TimeFormat | null;
    
    if (savedTimeMode === 'game' || savedTimeMode === 'local') {
      setTimeMode(savedTimeMode);
    }
    if (savedTimeFormat === '12h' || savedTimeFormat === '24h') {
      setTimeFormat(savedTimeFormat);
    }
  }, []);

  // Save timeMode to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('timeMode', timeMode);
    }
  }, [timeMode, mounted]);

  // Save timeFormat to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('timeFormat', timeFormat);
    }
  }, [timeFormat, mounted]);

  // Show rebuilding page if detected
  if (isRebuilding) {
    return <RebuildingPage />;
  }

  return (
    <EventPreferencesProvider>
      <div className="flex flex-col min-h-screen" data-react-app="true">
        <Header 
          timeMode={timeMode} 
          setTimeMode={setTimeMode} 
          timeFormat={timeFormat}
          setTimeFormat={setTimeFormat}
        />
        <main className="flex-grow container mx-auto px-4 py-8 space-y-8">
        <div>
          <h2 className="text-3xl font-bold mb-6 font-headline gradient-text drop-shadow-lg flex items-center gap-2">
            <AlarmClock className="h-7 w-7" />
            Reset Timers
          </h2>
          <ResetTimers />
        </div>
        <div>
          <h2 className="text-3xl font-bold mb-6 font-headline gradient-text drop-shadow-lg flex items-center gap-2">
            <Calendar className="h-7 w-7" />
            Today's Timeline
          </h2>
          <DailyTimeline timeMode={timeMode} timeFormat={timeFormat} />
        </div>
        <div>
          <h2 className="text-3xl font-bold mb-6 font-headline gradient-text drop-shadow-lg flex items-center gap-2">
            <CalendarDays className="h-7 w-7" />
            This Week's Schedule
          </h2>
          <WeeklyTimeline />
        </div>
        <div>
          <h2 className="text-3xl font-bold mb-6 font-headline gradient-text drop-shadow-lg flex items-center gap-2">
            <CalendarRange className="h-7 w-7" />
            Monthly Events
          </h2>
          <MonthlyTimeline />
        </div>
        <div className="space-y-4">
           <h2 className="text-3xl font-bold font-headline gradient-text drop-shadow-lg flex items-center gap-2">
            <Target className="h-7 w-7" />
            Monster Hunter Times
          </h2>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="lg:w-80 flex-shrink-0">
              <div className="bg-card border rounded-lg p-4 space-y-3">
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Field Bosses</h3>
                  <p className="text-sm text-muted-foreground">
                    Field bosses respawn every <span className="font-semibold text-foreground">:00</span> and <span className="font-semibold text-foreground">:30</span> past the hour.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    For detailed world boss respawn times, please refer to <Link href="https://bptimer.com/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline transition-colors font-semibold">bptimer.com</Link>.
                  </p>
                </div>
                <div className="pt-2 border-t space-y-2">
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">Rare Spawns</h3>
                  <p className="text-sm text-muted-foreground">
                    For rare spawn locations, refer to the map on the right.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    For Loyal Boar (Golden Pig) respawn times, please refer to <Link href="https://pigtastic.netlify.app/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline transition-colors font-semibold">pigtastic.netlify.app</Link>.
                  </p>
                </div>
                <div className="pt-2 flex justify-center">
                  <Image
                    src={getImagePath("/images/pigblanket.webp")}
                    alt="Pig blanket"
                    width={200}
                    height={200}
                    className="w-auto h-auto max-w-full"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <div className="max-w-4xl w-full">
                <Image
                  src={getImagePath("/images/spawnpoints_rares.webp")}
                  alt="Rare spawn points map"
                  width={1920}
                  height={1080}
                  className="rounded-lg border w-full h-auto"
                  priority
                />
                <p className="text-xs text-muted-foreground text-center mt-2">Map credit to original creator.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="text-center py-4 text-muted-foreground text-sm border-t space-y-2">
        <p>BP:SR Event Tracker | Blue Protocol: Star Resonance</p>
        <p>Last Updated: 20.12.2025</p>
        <AccentColorSelector />
      </footer>
        <EventPreferencesPanel />
        <div className="fixed bottom-0 left-0 z-30 pointer-events-none">
          <Image
            src={getImagePath("/images/airona_peek.webp")}
            alt="Airona peek"
            width={200}
            height={200}
            className="w-auto h-auto max-w-[80px] sm:max-w-[120px] md:max-w-[150px] lg:max-w-[200px]"
            priority
          />
        </div>
      </div>
    </EventPreferencesProvider>
  );
}
