import TimeDisplay from './TimeDisplay';
import { TimeDisplayMode, TimeFormat } from '@/app/page';
import Image from 'next/image';
import { getImagePath } from '@/lib/utils';

interface HeaderProps {
    timeMode: TimeDisplayMode;
    setTimeMode: (mode: TimeDisplayMode) => void;
    timeFormat: TimeFormat;
    setTimeFormat: (format: TimeFormat) => void;
    selectedTimezone: string;
    setSelectedTimezone: (tz: string) => void;
}

export default function Header({ timeMode, setTimeMode, timeFormat, setTimeFormat, selectedTimezone, setSelectedTimezone }: HeaderProps) {
  return (
    <header className="bg-card/50 backdrop-blur-sm border-b border-border sticky top-0 z-[100]">
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-4 flex flex-wrap justify-between items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative bounce-gentle">
            <Image
              src={getImagePath("/images/clock.webp")}
              alt="Clock logo"
              width={32}
              height={32}
              className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8"
              priority
            />
            <span className="absolute -top-1 -right-1 text-sm sm:text-lg animate-pulse">✨</span>
          </div>
          <h1 className="text-lg sm:text-2xl md:text-3xl font-bold text-primary-foreground font-headline tracking-tight">
            BP:SR Event Tracker
          </h1>
        </div>
        <TimeDisplay 
          timeMode={timeMode} 
          setTimeMode={setTimeMode}
          timeFormat={timeFormat}
          setTimeFormat={setTimeFormat}
          selectedTimezone={selectedTimezone}
          setSelectedTimezone={setSelectedTimezone}
        />
      </div>
    </header>
  );
}
