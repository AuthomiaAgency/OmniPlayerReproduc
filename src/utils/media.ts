import * as jsmediatags from 'jsmediatags/dist/jsmediatags.min.js';

export interface Track {
  id: string; // Video ID
  title: string;
  artist: string;
  album?: string;
  coverUrl: string;
  source: 'youtube' | 'local';
  type: 'track' | 'video';
  originalUrl?: string;
  file?: File;
  duration?: number;
}

export const extractColors = (imageUrl: string): Promise<{ bg: string; accent: string; pastel: string; dark: string }> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    
    img.src = `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
    
    const fallback = { bg: '#ffffff', accent: '#000000', pastel: '#fdfdfd', dark: '#1a1a1a' };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(fallback);
      
      canvas.width = 60;
      canvas.height = 60;
      ctx.drawImage(img, 0, 0, 60, 60);
      
      try {
        const data = ctx.getImageData(0, 0, 60, 60).data;
        let r = 0, g = 0, b = 0;
        let maxSaturation = -1;
        let vibrantR = 100, vibrantG = 100, vibrantB = 100;
        
        for (let i = 0; i < data.length; i += 16) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          
          const max = Math.max(data[i], data[i+1], data[i+2]);
          const min = Math.min(data[i], data[i+1], data[i+2]);
          const sat = max === 0 ? 0 : (max - min) / max;
          
          if (sat > maxSaturation && max > 50) {
            maxSaturation = sat;
            vibrantR = data[i];
            vibrantG = data[i+1];
            vibrantB = data[i+2];
          }
        }
        
        const count = data.length / 16;
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        
        const accent = `rgb(${vibrantR}, ${vibrantG}, ${vibrantB})`;
        const pastel = `rgba(${vibrantR}, ${vibrantG}, ${vibrantB}, 0.15)`;
        const dark = `rgb(${Math.floor(vibrantR * 0.3)}, ${Math.floor(vibrantG * 0.3)}, ${Math.floor(vibrantB * 0.3)})`;
        const bg = `rgb(${r}, ${g}, ${b})`;
        
        resolve({ bg, accent, pastel, dark });
      } catch (e) {
        resolve(fallback);
      }
    };
    
    img.onerror = () => resolve(fallback);
  });
};

export const parseYouTubeUrl = async (url: string): Promise<Track[]> => {
  const isExplicitPlaylist = url.includes('/playlist?list=');
  const listMatch = url.match(/[?&]list=([^#\&\?]+)/i);
  const videoMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
  
  const playlistId = listMatch ? listMatch[1] : null;
  const videoId = videoMatch ? videoMatch[1] : null;
  
  if (!videoId && !playlistId) return [];

  // If it's explicitly a playlist OR it has a list but NO video ID, fetch playlist
  const shouldFetchPlaylist = playlistId && (isExplicitPlaylist || !videoId);

  // If it's a playlist, expand it into individual tracks
  if (shouldFetchPlaylist) {
    const pipedInstances = [
      'https://pipedapi.kavin.rocks',
      'https://pipedapi.tokhmi.xyz',
      'https://pipedapi.syncpundit.io'
    ];

    const invidiousInstances = [
      'https://vid.puffyan.us',
      'https://invidious.flokinet.to',
      'https://inv.tux.pizza'
    ];

    const fetchers = [
      // 1. Lemnoslife (Official API proxy) with pagination
      async () => {
        let items: any[] = [];
        let pageToken = '';
        let pages = 0;
        do {
          const res = await fetch(`https://yt.lemnoslife.com/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}${pageToken ? `&pageToken=${pageToken}` : ''}`);
          if (!res.ok) throw new Error();
          const data = await res.json();
          if (!data.items || data.items.length === 0) break;
          items = items.concat(data.items);
          pageToken = data.nextPageToken;
          pages++;
        } while (pageToken && pages < 10); // Max 500 items

        if (items.length === 0) throw new Error();
        return items.map((item: any): Track => ({
          id: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          artist: item.snippet.videoOwnerChannelTitle || 'YouTube',
          coverUrl: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${item.snippet.resourceId.videoId}/hqdefault.jpg`,
          source: 'youtube',
          type: 'video',
          originalUrl: `https://youtube.com/watch?v=${item.snippet.resourceId.videoId}`
        })).filter((t: Track) => t.title !== 'Private video' && t.title !== 'Deleted video');
      },
      // 2. HTML Scraper via CORS proxy (Robust fallback for Mixes and Playlists)
      async () => {
        const targetUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}&list=${playlistId}` : `https://www.youtube.com/playlist?list=${playlistId}`;
        let html = '';
        try {
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
          const res = await fetch(proxyUrl);
          if (!res.ok) throw new Error();
          html = await res.text();
        } catch (e) {
          const proxyUrl2 = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
          const res2 = await fetch(proxyUrl2);
          if (!res2.ok) throw new Error();
          const data = await res2.json();
          html = data.contents;
        }
        
        const match = html.match(/(?:var ytInitialData|window\["ytInitialData"\])\s*=\s*(\{.*?\});\s*<\/script>/);
        if (!match) throw new Error("Could not find ytInitialData in HTML");
        const ytData = JSON.parse(match[1]);
        
        let items = [];
        
        // Try to parse as a Watch page with a Mix/Playlist panel
        try {
          const panels = ytData.contents.twoColumnWatchNextResults.playlist.playlist.contents;
          items = panels.filter((item: any) => item.playlistPanelVideoRenderer).map((item: any) => item.playlistPanelVideoRenderer);
        } catch (e) {
          // Try to parse as a standard Playlist page
          try {
            const tabs = ytData.contents.twoColumnBrowseResultsRenderer.tabs;
            const playlistContents = tabs[0].tabRenderer.content.sectionListRenderer.contents[0].itemSectionRenderer.contents[0].playlistVideoListRenderer.contents;
            items = playlistContents.filter((item: any) => item.playlistVideoRenderer).map((item: any) => item.playlistVideoRenderer);
          } catch (err) {
            throw new Error("Could not parse ytInitialData");
          }
        }
        
        if (items.length === 0) throw new Error();
        
        return items.map((v: any) => ({
          id: v.videoId,
          title: v.title?.runs?.[0]?.text || v.title?.simpleText || 'YouTube Video',
          artist: v.shortBylineText?.runs?.[0]?.text || v.longBylineText?.runs?.[0]?.text || 'YouTube',
          coverUrl: v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          source: 'youtube',
          type: 'video',
          originalUrl: `https://youtube.com/watch?v=${v.videoId}`
        }));
      },
      // 3. Piped APIs
      ...pipedInstances.map(instance => async () => {
        const res = await fetch(`${instance}/playlists/${playlistId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data.relatedStreams || data.relatedStreams.length === 0) throw new Error();
        return data.relatedStreams.map((v: any) => {
          const vidId = v.url.split('?v=')[1] || v.url.split('/watch?v=')[1];
          return {
            id: vidId,
            title: v.title,
            artist: v.uploaderName,
            coverUrl: v.thumbnail || `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`,
            source: 'youtube',
            type: 'video',
            originalUrl: `https://youtube.com/watch?v=${vidId}`
          };
        });
      }),
      // 4. Invidious APIs
      ...invidiousInstances.map(instance => async () => {
        const res = await fetch(`${instance}/api/v1/playlists/${playlistId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!data.videos || data.videos.length === 0) throw new Error();
        return data.videos.map((v: any) => ({
          id: v.videoId,
          title: v.title,
          artist: v.author,
          coverUrl: v.videoThumbnails?.find((t:any) => t.quality === 'high')?.url || `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
          source: 'youtube',
          type: 'video',
          originalUrl: `https://youtube.com/watch?v=${v.videoId}`
        }));
      })
    ];

    for (const fetcher of fetchers) {
      try {
        const tracks = await fetcher();
        if (tracks && tracks.length > 0) {
          return tracks;
        }
      } catch (e) {
        console.warn("Playlist fetcher failed, trying next...");
      }
    }
    
    console.warn("All playlist APIs failed. Falling back to single video if available.");
  }

  // Fallback to single video if playlist failed (e.g., private playlist or Mix) or if it's just a single video
  if (videoId) {
    try {
      const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}`);
      const data = await res.json();
      return [{
        id: videoId,
        title: data.title || 'YouTube Video',
        artist: data.author_name || 'YouTube',
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'youtube',
        type: 'video',
        originalUrl: `https://youtube.com/watch?v=${videoId}`
      }];
    } catch (e) {
      return [{
        id: videoId,
        title: 'YouTube Video',
        artist: 'YouTube',
        coverUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        source: 'youtube',
        type: 'video',
        originalUrl: `https://youtube.com/watch?v=${videoId}`
      }];
    }
  }

  return [];
};

export const parseUniversalUrl = async (url: string): Promise<Track[]> => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return parseYouTubeUrl(url);
  }
  return [];
};

export const readLocalFile = (file: File): Promise<Track> => {
  return new Promise((resolve) => {
    jsmediatags.read(file, {
      onSuccess: (tag) => {
        let coverUrl = 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500&auto=format&fit=crop';
        if (tag.tags.picture) {
          const data = tag.tags.picture.data;
          const format = tag.tags.picture.format;
          let base64String = "";
          for (let i = 0; i < data.length; i++) {
            base64String += String.fromCharCode(data[i]);
          }
          coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }
        
        resolve({
          id: file.name,
          title: tag.tags.title || file.name.replace(/\.[^/.]+$/, ""),
          artist: tag.tags.artist || 'Unknown Artist',
          album: tag.tags.album,
          coverUrl,
          source: 'local',
          type: 'track',
          file
        });
      },
      onError: (error) => {
        resolve({
          id: file.name,
          title: file.name.replace(/\.[^/.]+$/, ""),
          artist: 'Unknown Artist',
          coverUrl: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500&auto=format&fit=crop',
          source: 'local',
          type: 'track',
          file
        });
      }
    });
  });
};
