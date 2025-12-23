"use client";

import { useState, useEffect, useCallback } from 'react';
import { getGameDate } from '@/lib/time';

const STORAGE_KEY = 'daily-event-completions';

type DailyCompletions = Record<string, Set<string>>; // date string -> Set of event names

export function useDailyCompletions() {
  const [completions, setCompletions] = useState<DailyCompletions>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert arrays back to Sets
        const converted: DailyCompletions = {};
        Object.entries(parsed).forEach(([date, events]: [string, any]) => {
          converted[date] = new Set(Array.isArray(events) ? events : []);
        });
        setCompletions(converted);
      }
    } catch (error) {
      console.error('Error loading daily completions:', error);
    }
  }, []);

  const getDateKey = useCallback((date: Date) => {
    const gameDate = getGameDate(date);
    return `${gameDate.getUTCFullYear()}-${String(gameDate.getUTCMonth() + 1).padStart(2, '0')}-${String(gameDate.getUTCDate()).padStart(2, '0')}`;
  }, []);

  const isEventCompleted = useCallback((eventName: string, date: Date, occurrenceKey?: string) => {
    const dateKey = getDateKey(date);
    const key = occurrenceKey ? `${eventName}-${occurrenceKey}` : eventName;
    return completions[dateKey]?.has(key) ?? false;
  }, [completions, getDateKey]);

  const toggleEventCompletion = useCallback((eventName: string, date: Date, occurrenceKey?: string) => {
    const dateKey = getDateKey(date);
    const key = occurrenceKey ? `${eventName}-${occurrenceKey}` : eventName;
    setCompletions(prev => {
      const newCompletions = { ...prev };
      if (!newCompletions[dateKey]) {
        newCompletions[dateKey] = new Set();
      }
      const dateCompletions = new Set(newCompletions[dateKey]);
      
      if (dateCompletions.has(key)) {
        dateCompletions.delete(key);
      } else {
        dateCompletions.add(key);
      }
      
      newCompletions[dateKey] = dateCompletions;
      
      // Save to localStorage
      if (mounted) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(newCompletions).forEach(([date, events]) => {
            toStore[date] = Array.from(events);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error saving daily completions:', error);
        }
      }
      
      return newCompletions;
    });
  }, [mounted, getDateKey]);

  const resetDay = useCallback((date: Date) => {
    const dateKey = getDateKey(date);
    setCompletions(prev => {
      const newCompletions = { ...prev };
      delete newCompletions[dateKey];
      
      // Save to localStorage
      if (mounted) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(newCompletions).forEach(([date, events]) => {
            toStore[date] = Array.from(events);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error saving daily completions:', error);
        }
      }
      
      return newCompletions;
    });
  }, [mounted, getDateKey]);

  // Clean up old dates (older than 7 days)
  useEffect(() => {
    if (!mounted) return;
    
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
    
    setCompletions(prev => {
      const cleaned: DailyCompletions = {};
      Object.entries(prev).forEach(([dateKey, events]) => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date >= sevenDaysAgo) {
          cleaned[dateKey] = events;
        }
      });
      
      if (Object.keys(cleaned).length !== Object.keys(prev).length) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(cleaned).forEach(([date, events]) => {
            toStore[date] = Array.from(events);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error cleaning daily completions:', error);
        }
      }
      
      return cleaned;
    });
  }, [mounted]);

  return {
    isEventCompleted,
    toggleEventCompletion,
    resetDay,
    getDateKey,
    mounted,
  };
}

