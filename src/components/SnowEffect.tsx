"use client";

import { useState, useEffect, useMemo } from 'react';
import { Snowflake } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SnowEffect() {
  const [enabled, setEnabled] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [snowflakes, setSnowflakes] = useState<Array<{ id: number; char: string; left: number; duration: number; delay: number; size: number; opacity: number }>>([]);

  useEffect(() => {
    setMounted(true);
    // Load preference from localStorage
    const saved = localStorage.getItem('snowEnabled');
    if (saved !== null) {
      setEnabled(saved === 'true');
    } else {
      // Default: enabled (will be filtered by shouldShowSnow date check)
      setEnabled(true);
    }
  }, []);

  // Save preference to localStorage when it changes
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('snowEnabled', enabled.toString());
    }
  }, [enabled, mounted]);

  // Check if we're in snow season (December 1st to February 1st, regardless of year)
  const inSnowSeason = useMemo(() => {
    if (!mounted) return false;
    const now = new Date();
    const month = now.getMonth(); // 0 = January, 11 = December
    
    // Show snow from December 1st until February 1st (exclusive)
    // So: December (month 11) OR January (month 0)
    return month === 11 || month === 0;
  }, [mounted]);

  // Check if we should actually show snow (in season AND enabled)
  const shouldShowSnow = useMemo(() => {
    return inSnowSeason && enabled;
  }, [inSnowSeason, enabled]);

  // Create snowflakes when component mounts and shouldShowSnow is true
  useEffect(() => {
    if (!shouldShowSnow || !mounted) {
      setSnowflakes([]);
      return;
    }

    const snowflakeChars = ['❄', '❅', '❆', '✻', '✼', '✽'];
    const numSnowflakes = 50;

    const newSnowflakes = Array.from({ length: numSnowflakes }, (_, i) => ({
      id: i,
      char: snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)],
      left: Math.random() * 100,
      duration: Math.random() * 5 + 3, // 3-8 seconds
      delay: Math.random() * 2,
      size: Math.random() * 0.5 + 0.5, // 0.5-1em
      opacity: Math.random() * 0.5 + 0.5, // 0.5-1.0
    }));

    setSnowflakes(newSnowflakes);
  }, [shouldShowSnow, mounted]);

  // Don't render anything if not mounted or not in snow season
  if (!mounted || !inSnowSeason) {
    return null;
  }

  return (
    <>
      {shouldShowSnow && (
        <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
          {snowflakes.map(flake => (
            <div
              key={flake.id}
              className="absolute top-[-10px] text-white select-none snowflake-animation"
              style={{
                left: `${flake.left}%`,
                animationDuration: `${flake.duration}s`,
                animationDelay: `${flake.delay}s`,
                fontSize: `${flake.size}em`,
                opacity: flake.opacity,
                textShadow: '0 0 5px rgba(255, 255, 255, 0.8)',
              }}
            >
              {flake.char}
            </div>
          ))}
        </div>
      )}
      <Button
        onClick={() => setEnabled(!enabled)}
        variant="outline"
        size="sm"
        className="fixed top-20 right-4 z-[101] pointer-events-auto bg-background/80 backdrop-blur-sm"
        title={enabled ? "Hide snow effect" : "Show snow effect"}
      >
        <Snowflake className="h-4 w-4 mr-2" />
        {enabled ? 'Hide Snow' : 'Show Snow'}
      </Button>
    </>
  );
}
