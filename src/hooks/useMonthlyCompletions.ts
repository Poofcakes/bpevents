"use client";

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'monthly-event-completions';

type MonthlyCompletions = Record<string, Set<string>>; // event name -> Set of range keys (start-end)

export function useMonthlyCompletions() {
  const [completions, setCompletions] = useState<MonthlyCompletions>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const converted: MonthlyCompletions = {};
        Object.entries(parsed).forEach(([eventName, ranges]: [string, any]) => {
          converted[eventName] = new Set(Array.isArray(ranges) ? ranges : []);
        });
        setCompletions(converted);
      }
    } catch (error) {
      console.error('Error loading monthly completions:', error);
    }
  }, []);

  const getRangeKey = useCallback((range: { start: string; end?: string }) => {
    return `${range.start}::${range.end || 'permanent'}`;
  }, []);

  const isEventCompleted = useCallback((eventName: string, range: { start: string; end?: string }) => {
    const rangeKey = getRangeKey(range);
    return completions[eventName]?.has(rangeKey) ?? false;
  }, [completions, getRangeKey]);

  const toggleEventCompletion = useCallback((eventName: string, range: { start: string; end?: string }) => {
    const rangeKey = getRangeKey(range);
    setCompletions(prev => {
      const newCompletions = { ...prev };
      if (!newCompletions[eventName]) {
        newCompletions[eventName] = new Set();
      }
      const eventRanges = new Set(newCompletions[eventName]);
      
      if (eventRanges.has(rangeKey)) {
        eventRanges.delete(rangeKey);
      } else {
        eventRanges.add(rangeKey);
      }
      
      newCompletions[eventName] = eventRanges;
      
      if (mounted) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(newCompletions).forEach(([name, ranges]) => {
            toStore[name] = Array.from(ranges);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error saving monthly completions:', error);
        }
      }
      
      return newCompletions;
    });
  }, [mounted, getRangeKey]);

  const resetMonth = useCallback((monthStart: Date) => {
    const monthYear = monthStart.getUTCFullYear();
    const monthNum = monthStart.getUTCMonth() + 1;
    const monthKey = `${monthYear}-${String(monthNum).padStart(2, '0')}`;
    
    // Calculate month boundaries
    const monthStartDate = new Date(Date.UTC(monthYear, monthNum - 1, 1));
    const monthEndDate = new Date(Date.UTC(monthYear, monthNum, 0, 23, 59, 59, 999));
    
    setCompletions(prev => {
      const newCompletions: MonthlyCompletions = {};
      
      Object.entries(prev).forEach(([eventName, ranges]) => {
        const filteredRanges = new Set<string>();
        ranges.forEach(rangeKey => {
          // Parse range key: "start::end" or "start::permanent"
          const [startStr, endStr] = rangeKey.split('::');
          const startDate = new Date(startStr + 'T00:00:00Z');
          const endDate = endStr === 'permanent' ? null : new Date(endStr + 'T00:00:00Z');
          
          // Check if range overlaps with the target month
          // Range overlaps if: start <= monthEnd AND (end is null OR end >= monthStart)
          const overlaps = startDate <= monthEndDate && (endDate === null || endDate >= monthStartDate);
          
          // Only keep ranges that do NOT overlap with the target month
          if (!overlaps) {
            filteredRanges.add(rangeKey);
          }
        });
        
        if (filteredRanges.size > 0) {
          newCompletions[eventName] = filteredRanges;
        }
      });
      
      if (mounted) {
        try {
          const toStore: Record<string, string[]> = {};
          Object.entries(newCompletions).forEach(([name, ranges]) => {
            toStore[name] = Array.from(ranges);
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
        } catch (error) {
          console.error('Error saving monthly completions:', error);
        }
      }
      
      return newCompletions;
    });
  }, [mounted]);

  return {
    isEventCompleted,
    toggleEventCompletion,
    resetMonth,
    mounted,
  };
}

