import React from 'react';

interface ImageSearchBlockProps {
  query?: string; // currently ignored, kept for future use
}

const ImageSearchBlockBase: React.FC<ImageSearchBlockProps> = ({ query }) => {
  const [imgUrl, setImgUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    // Always fetch a new random image from Lorem Picsum
    setImgUrl(null);
    setError(false);

    const url = `https://picsum.photos/400/300?random=${Date.now()}`;
    const img = new Image();
    img.onload = () => setImgUrl(url);
    img.onerror = () => setError(true);
    img.src = url;
  }, []);

  return (
    <div className="sol-image-block my-3">
      {!error && imgUrl && (
        <img src={imgUrl} alt={query || 'Random image'} className="rounded-md max-w-full h-auto border border-gray-200" />
      )}
      {!imgUrl && !error && (
        <div className="w-40 h-24 bg-gray-100 animate-pulse rounded-md" />
      )}
      {error && (
        <div className="text-sm text-red-500">Image search failed</div>
      )}
    </div>
  );
};

export default React.memo(ImageSearchBlockBase); 