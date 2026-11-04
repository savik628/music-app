import React, { useEffect, useState } from 'react';
import { Music2 } from 'lucide-react';

interface CoverImageProps {
  blob?: Blob;
  alt: string;
  className?: string;
}

export const CoverImage: React.FC<CoverImageProps> = ({ blob, alt, className = '' }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-neutral-800 text-neutral-500 rounded-lg ${className}`}>
        <Music2 className="w-1/2 h-1/2" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      className={`object-cover rounded-lg shadow-md ${className}`}
    />
  );
};
