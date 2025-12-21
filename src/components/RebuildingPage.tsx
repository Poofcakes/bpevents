"use client";

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { getImagePath } from '@/lib/utils';

export default function RebuildingPage() {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          window.location.reload();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative inline-block">
          <Image
            src={getImagePath("/images/clock.webp")}
            alt="Clock logo"
            width={64}
            height={64}
            className="mx-auto animate-spin"
            priority
          />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Site is Rebuilding</h1>
          <p className="text-muted-foreground">
            We're updating the site with the latest changes. Please come back in a few seconds.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-accent">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <p className="text-lg font-semibold">
            Auto-refreshing in {countdown} second{countdown !== 1 ? 's' : ''}...
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-accent text-accent-foreground rounded-md hover:bg-accent/90 transition-colors"
        >
          Refresh Now
        </button>
      </div>
    </div>
  );
}

