/**
 * Process bookmarks data to calculate various statistics
 * @param {Array} bookmarks - Array of bookmark objects
 * @returns {Object} Processed statistics
 */
export function processBookmarksStats(bookmarks) {
  if (!bookmarks || !Array.isArray(bookmarks)) {
    return {
      length: 0,
      topAuthors: [],
      readingTime: 0,
      topMonth: 'JAN',
      monthCount: 0
    };
  }

  // Total bookmarks is just the array length
  const totalBookmarks = bookmarks.length;

  // Process authors and their counts
  const authorStats = {};
  bookmarks.forEach(bookmark => {
    const { author } = bookmark;
    if (!authorStats[author.screen_name]) {
      authorStats[author.screen_name] = {
        count: 0,
        name: author.name,
        screen_name: author.screen_name,
        profile_image_url: author.profile_image_url
      };
    }
    authorStats[author.screen_name].count++;
  });

  // Get top 5 authors
  const topAuthors = Object.values(authorStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Calculate reading time (assuming average reading speed of 238 words per minute)
  const WORDS_PER_MINUTE = 238;
  const totalWords = bookmarks.reduce((sum, bookmark) => {
    const words = bookmark.full_text ? bookmark.full_text.split(/\s+/).length : 0;
    return sum + words;
  }, 0);
  const readingTime = Math.round(totalWords / WORDS_PER_MINUTE);

  // Calculate monthly stats
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const monthCounts = {};
  bookmarks.forEach(bookmark => {
    // Extract timestamp from tweet ID if no timestamp provided
    const timestamp = new Date(bookmark.timestamp);
    const monthKey = monthNames[timestamp.getMonth()];
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
  });

  // Find month with most bookmarks
  const [topMonth, monthCount] = Object.entries(monthCounts)
    .sort(([,a], [,b]) => b - a)[0] || ['January', 0];

  return {
    length: totalBookmarks,
    topAuthors,
    readingTime,
    topMonth,
    monthCount
  };
} 