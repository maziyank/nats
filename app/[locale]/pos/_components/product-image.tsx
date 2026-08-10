'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/services/lib/utils';
import { ImageOff } from 'lucide-react';

interface ProductImageProps {
  src: string | null;
  alt: string;
  className?: string;
  category?: string | null;
  productId: string;
}

export function ProductImage({
  src,
  alt,
  className,
  category,
  productId,
}: ProductImageProps) {
  const [error, setError] = useState(false);

  // If we have a valid source and no error, use it
  if (src && !error) {
    return (
      <div className={cn("relative h-full w-full overflow-hidden bg-muted", className)}>
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          onError={() => setError(true)}
        />
      </div>
    );
  }

  // Generate a deterministic random image based on category and product ID
  // We use the category as the keyword for relevance
  // We use the productId as the lock to ensure the same product always gets the same image
  const keyword = category 
    ? category.split(' ').join(',') // Replace spaces with commas for multi-tag search
    : 'product,item';
    
  // Use a hash of the productId to get a numeric lock ID to keep it consistent
  // Simple hash function to convert string to number
  const hash = productId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const fallbackSrc = `https://loremflickr.com/400/400/${keyword}?lock=${hash}`;

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-muted", className)}>
      <Image
        src={fallbackSrc}
        alt={alt}
        fill
        className="object-cover opacity-90 hover:opacity-100 transition-opacity"
        // If the fallback also fails (e.g. offline), show the icon placeholder
        onError={(e) => {
           // Prevent infinite loop if fallback fails by hiding the image element
           const target = e.target as HTMLImageElement;
           target.style.display = 'none';
           // We could set another state here to show an icon instead
           target.parentElement?.classList.add('fallback-failed');
        }}
      />
      {/* Fallback for when the image fails to load or is loading */}
      <div className="fallback-placeholder absolute inset-0 -z-10 flex items-center justify-center bg-muted text-muted-foreground/20">
         <span className="text-4xl font-bold">{alt.charAt(0)}</span>
      </div>
      
      {/* Script to handle the hidden fallback */}
      <style jsx global>{`
        .fallback-failed .fallback-placeholder {
          z-index: 10;
        }
      `}</style>
    </div>
  );
}
