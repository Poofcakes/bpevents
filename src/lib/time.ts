

export const GAME_TIMEZONE_OFFSET = -2;
export const DAILY_RESET_HOUR_UTC = 5; // 5 AM Game Time (UTC-2) is 7 AM UTC
const WEEKLY_RESET_DAY_UTC = 1; // Monday
export const BIWEEKLY_REFERENCE_RESET = new Date('2024-07-29T07:00:00Z'); 
import { getWeek } from 'date-fns';


export const getGameTime = (date: Date): Date => {
  // 1. Create a new Date object representing the same moment in time, but in UTC.
  const utcDate = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
  
  // 2. Apply the game's timezone offset.
  utcDate.setUTCHours(utcDate.getUTCHours() + GAME_TIMEZONE_OFFSET);
  
  return utcDate;
};

// Determines the "Game Day" date based on the 5AM UTC-2 reset time.
export const getGameDate = (date: Date): Date => {
    // Get the UTC time of the input date
    const utcDate = new Date(Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        date.getUTCSeconds(),
        date.getUTCMilliseconds()
    ));
    
    // Game day resets at 5 AM UTC-2, which is 7 AM UTC
    const resetHourUTC = 7; // 7 AM UTC = 5 AM UTC-2
    
    // If the time is before 7 AM UTC (5 AM game time), it's still considered the previous game day.
    if (utcDate.getUTCHours() < resetHourUTC) {
        const prevDay = new Date(utcDate);
        prevDay.setUTCDate(prevDay.getUTCDate() - 1);
        // Return the date at midnight UTC for the previous day
        prevDay.setUTCHours(0, 0, 0, 0);
        return prevDay;
    }
    // Return the date at midnight UTC for the current day
    const currentDay = new Date(utcDate);
    currentDay.setUTCHours(0, 0, 0, 0);
    return currentDay;
}


export const toLocalTime = (gameDate: Date): Date => {
    // 1. Get the UTC time from the game time Date object
    const gameTimeUTC = Date.UTC(
        gameDate.getUTCFullYear(),
        gameDate.getUTCMonth(),
        gameDate.getUTCDate(),
        gameDate.getUTCHours(),
        gameDate.getUTCMinutes(),
        gameDate.getUTCSeconds(),
        gameDate.getUTCMilliseconds()
    );

    // 2. Adjust for the game timezone offset to get true UTC
    const trueUTC = gameTimeUTC - (GAME_TIMEZONE_OFFSET * 3600000);

    // 3. Create a new Date object from this true UTC timestamp
    // The new Date() constructor will automatically use the browser's local timezone
    return new Date(trueUTC);
};

export const getNextDailyReset = (fromDate: Date): Date => {
    const now = fromDate;
    let nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_RESET_HOUR_UTC + (-GAME_TIMEZONE_OFFSET), 0, 0, 0));
    
    // The reset time is in UTC. We compare with current time, also in UTC.
    if (now.getTime() >= nextReset.getTime()) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
    }
    return nextReset;
};

export const getNextWeeklyReset = (fromDate: Date): Date => {
    const now = fromDate;
    let nextReset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_RESET_HOUR_UTC + (-GAME_TIMEZONE_OFFSET), 0, 0, 0));
    
    const currentDay = nextReset.getUTCDay();
    let daysUntilMonday = (WEEKLY_RESET_DAY_UTC + 7 - currentDay) % 7;

    if (daysUntilMonday === 0 && now.getTime() >= nextReset.getTime()) {
        daysUntilMonday = 7;
    }
    
    nextReset.setUTCDate(nextReset.getUTCDate() + daysUntilMonday);
    
    return nextReset;
};


export const getNextBiWeeklyReset = (fromDate: Date): Date => {
    const now = fromDate;
    const fourteenDaysInMillis = 14 * 24 * 60 * 60 * 1000;
    
    let nextResetTime = new Date(BIWEEKLY_REFERENCE_RESET.getTime());
    
    // Move reference forward until it's after the current time
    while (nextResetTime < now.getTime()) {
      nextResetTime.setTime(nextResetTime.getTime() + fourteenDaysInMillis);
    }
    
    return nextResetTime;
};

export const getWeekPeriod = (date: Date): 'even' | 'odd' => {
  const weekNumber = getWeek(date, { weekStartsOn: 1 });
  return (weekNumber % 2 === 0) ? 'even' : 'odd';
}

export const formatDuration = (ms: number): string => {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
};

export const formatDurationWithDays = (ms: number): string => {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    let result = '';
    if (days > 0) {
        result += `${days}d `;
    }
    result += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
    
    return result.trim();
};
