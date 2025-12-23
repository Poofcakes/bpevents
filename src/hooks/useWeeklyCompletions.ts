"use client";

import { useState, useEffect, useCallback } from 'react';
import { getGameDate, getWeekPeriod } from '@/lib/time';

const STORAGE_KEY = 'weekly-event-completions';
const STIMEN_STORAGE_KEY = 'stimen-vault-completions';

type WeeklyCompletions = Record<string, Set<string>>; // week key -> Set of event names

export function useWeeklyCompletions() {
  const [completions, setCompletions] = useState<WeeklyCompletions>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const converted: WeeklyCompletions = {};
        Object.entries(parsed).forEach(([week, events]: [string, any]) => {
          converted[week] = new Set(Array.isArray(events) ? events : []);
        });
        setCompletions(converted);
      }
    } catch (error) {
      console.error('Error loading weekly completions:', error);
    }
  }, []);

  const getWeekKey = useCallback((date: Date) => {
    const gameDate = getGameDate(date);
    const period = getWeekPeriod(gameDate);
    const year = gameDate.getUTCFullYear();
    const week = Math.floor((gameDate.getTime() - new Date(Date.UTC(year, 0, 1)).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${week}-${period}`;
  }, []);

  // Helper to get Monday of the week for a given date
  const getMondayOfWeek = useCallback((date: Date): Date => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = (d.getUTCDay() + 6) % 7; // Monday is 0
    d.setUTCDate(d.getUTCDate() - dayOfWeek);
    return d;
  }, []);

  const isEventCompleted = useCallback((eventName: string, date: Date) => {
    // Always use Monday's week key for consistency
    const monday = getMondayOfWeek(date);
    const weekKey = getWeekKey(monday);
    return completions[weekKey]?.has(eventName) ?? false;
  }, [completions, getWeekKey, getMondayOfWeek]);

  const toggleEventCompletion = useCallback((eventName: string, date: Date) => {
    // Always use Monday's week key for consistency
    const monday = getMondayOfWeek(date);
    const weekKey = getWeekKey(monday);
    setCompletions(prev => {
      const newCompletions = { ...prev };
      if (!newCompletions[weekKey]) {
        newCompletions[weekKey] = new Set();
      }
      const weekCompletions = new Set(newCompletions[weekKey]);
      
      if (weekCompletions.has(eventName)) {
        weekCompletions.delete(eventName);
      } else {
        weekCompletions.add(eventName);
      }
      
      newCompletions[weekKey] = weekCompletions;
      
      if (mounted) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(newCompletions).forEach(([week, events]) => {
            toStore[week] = Array.from(events);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error saving weekly completions:', error);
        }
      }
      
      return newCompletions;
    });
  }, [mounted, getWeekKey, getMondayOfWeek]);

  const resetWeek = useCallback((weekStartDate: Date, weeklyEventNames: string[] = []) => {
    // weekStartDate should already be Monday, but ensure we use Monday's week key
    // This is the canonical week key for the week being viewed
    const monday = getMondayOfWeek(weekStartDate);
    const primaryWeekKey = getWeekKey(monday);
    
    setCompletions(prev => {
      const newCompletions = { ...prev };
      
      // Only reset from the primary week key (Monday's week key)
      // Since we now always use Monday's week key for checking/unchecking, this should be sufficient
      if (newCompletions[primaryWeekKey]) {
        const weekCompletions = new Set(newCompletions[primaryWeekKey]);
        
        // Remove only the specified weekly events
        if (weeklyEventNames.length > 0) {
          weeklyEventNames.forEach(eventName => {
            weekCompletions.delete(eventName);
          });
        } else {
          // Fallback: remove all weekly events if no specific names provided
          const eventsToRemove: string[] = [];
          weekCompletions.forEach(eventName => {
            if (eventName === 'Guild Dance' || eventName.includes('World Boss Crusade')) {
              eventsToRemove.push(eventName);
            }
          });
          eventsToRemove.forEach(eventName => weekCompletions.delete(eventName));
        }
        
        if (weekCompletions.size === 0) {
          delete newCompletions[primaryWeekKey];
        } else {
          newCompletions[primaryWeekKey] = weekCompletions;
        }
      }
      
      if (mounted) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(newCompletions).forEach(([week, events]) => {
            toStore[week] = Array.from(events);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error saving weekly completions:', error);
        }
      }
      
      return newCompletions;
    });
  }, [mounted, getWeekKey, getMondayOfWeek]);

  return {
    isEventCompleted,
    toggleEventCompletion,
    resetWeek,
    getWeekKey,
    mounted,
  };
}

export function useStimenVaultCompletion() {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STIMEN_STORAGE_KEY);
      if (stored) {
        setCompleted(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Error loading stimen vault completion:', error);
    }
  }, []);

  const getPeriodKey = useCallback((date: Date) => {
    const gameDate = getGameDate(date);
    const period = getWeekPeriod(gameDate);
    const year = gameDate.getUTCFullYear();
    const week = Math.floor((gameDate.getTime() - new Date(Date.UTC(year, 0, 1)).getTime()) / (7 * 24 * 60 * 60 * 1000));
    return `${year}-W${week}-${period}`;
  }, []);

  const isCompleted = useCallback((date: Date) => {
    const periodKey = getPeriodKey(date);
    return completed[periodKey] ?? false;
  }, [completed, getPeriodKey]);

  const toggleCompletion = useCallback((date: Date) => {
    const periodKey = getPeriodKey(date);
    setCompleted(prev => {
      const newCompleted = { ...prev };
      newCompleted[periodKey] = !newCompleted[periodKey];
      
      if (mounted) {
        try {
          localStorage.setItem(STIMEN_STORAGE_KEY, JSON.stringify(newCompleted));
        } catch (error) {
          console.error('Error saving stimen vault completion:', error);
        }
      }
      
      return newCompleted;
    });
  }, [mounted, getPeriodKey]);

  const resetPeriod = useCallback((date: Date) => {
    const periodKey = getPeriodKey(date);
    setCompleted(prev => {
      const newCompleted = { ...prev };
      delete newCompleted[periodKey];
      
      if (mounted) {
        try {
          localStorage.setItem(STIMEN_STORAGE_KEY, JSON.stringify(newCompleted));
        } catch (error) {
          console.error('Error saving stimen vault completion:', error);
        }
      }
      
      return newCompleted;
    });
  }, [mounted, getPeriodKey]);

  return {
    isCompleted,
    toggleCompletion,
    resetPeriod,
    mounted,
  };
}

