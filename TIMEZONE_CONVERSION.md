# Timezone Conversion Guide

## Important: Event Times in events.ts are in UTC-2 (Game Time)

All event schedule times in `events.ts` are specified in **UTC-2** (game time). This is the timezone used by the game.

## Conversion Pattern

When processing event times from `events.ts`, always follow this pattern:

1. **Read from events.ts**: Times are in UTC-2 (game time)
2. **Convert to UTC**: Add 2 hours to convert UTC-2 → UTC for internal calculations
3. **Convert to display timezone**: Based on user's selected time mode:
   - **Game time mode**: Subtract 2 hours from UTC to display UTC-2
   - **Local time mode**: Let browser convert UTC to local timezone

## Examples

### Converting UTC-2 to UTC (for internal calculations)
```typescript
// Event time in events.ts: { hour: 10, minute: 0 } (10:00 UTC-2)
const date = new Date(Date.UTC(year, month, day));
date.setUTCHours(10 + 2, 0, 0, 0); // Convert to UTC: 12:00 UTC
```

### Displaying in Game Time Mode (UTC-2)
```typescript
// date is in UTC (e.g., 12:00 UTC representing 10:00 UTC-2)
const gameTime = new Date(date.getTime() - (2 * 60 * 60 * 1000)); // Subtract 2 hours
// Format as UTC to show: 10:00
gameTime.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
```

### Displaying in Local Time Mode
```typescript
// date is in UTC (e.g., 12:00 UTC)
// Browser automatically converts to local timezone
const localTime = new Date(date);
// Format normally (browser handles conversion)
format(localTime, 'HH:mm'); // Shows local time (e.g., 13:00 for UTC+1)
```

## Files That Handle Conversions

- `src/components/DailyTimeline.tsx`: ✅ All conversions correct
- `src/components/WeeklyTimeline.tsx`: ✅ All conversions correct
- `src/components/MonthlyTimeline.tsx`: ✅ All conversions correct
- `src/components/EventCard.tsx`: ✅ All conversions correct

## Default Times

Events without specific schedules (`schedule.type === 'none'`) default to:
- **Start**: 5 AM game time (UTC-2) = 7 AM UTC
- **End**: 5 AM game time (UTC-2) on the end date = 7 AM UTC

## Key Constants

- `GAME_TIMEZONE_OFFSET = -2` (UTC-2)
- `DAILY_RESET_HOUR_UTC = 7` (5 AM UTC-2 = 7 AM UTC)

