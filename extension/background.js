let isDone = false;
let not2024count = 0;
const SITE_URL = "localhost:5173";

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({
    url: 'popup.html'
  });
});

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTENSION_READY') {
    console.log("Received EXTENSION_READY message from landing page");
    sendResponse({ status: "ready" });
  } else if (message.type === 'GET_TWITTER_DATA') {
    console.log(`Received ${message.type} message from landing page`);
    
    // Reset global state
    isDone = false;
    not2024count = 0;

    // Create single bookmarks tab
    chrome.tabs.create({ url: "https://x.com/i/bookmarks/all" }, async (newTab) => {
      // Store tab ID for later use
      const bookmarksTabId = newTab.id;

      // Show loader
      setTimeout(() => {
        chrome.tabs.sendMessage(bookmarksTabId, {action: "showLoader"});
      }, 1000);

      try {
        // Wait for required data and fetch bookmarks
        await waitForRequiredData();
        let allTweets = [];
        await getBookmarks("", 0, allTweets);
        
        // Process the data
        const processedData = processBookmarksData(allTweets);

        // Close the bookmarks tab
        // chrome.tabs.remove(bookmarksTabId);

        chrome.tabs.query({}, (tabs) => {
          console.log("Tabs", tabs);
          for (const tab of tabs) {
            if (tab.url.includes(SITE_URL)) {
              chrome.tabs.update(tab.id, {active: true});
            }
          }
        });

        // Send response back to landing page
        sendResponse({ 
          status: "ready",
          bookmarks: allTweets,
          stats: processedData
        });
      } catch (error) {
        console.error("Error processing bookmarks:", error);
        chrome.tabs.remove(bookmarksTabId);
        sendResponse({ status: "error", message: error.message });
      }
    });
  } else {
    return false;
  }
});

const getTweetYear = (timestamp) => {
  return new Date(timestamp).getFullYear();
};



const processBookmarksData = (tweets) => {
  // Calculate total bookmarks
  const totalBookmarks = tweets.length;

  // Process authors
  const authorStats = {};
  tweets.forEach(tweet => {
    const author = tweet.author;
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

  const topAuthors = Object.values(authorStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Calculate reading time
  const WORDS_PER_MINUTE = 238;
  const totalWords = tweets.reduce((sum, tweet) => {
    const words = tweet.full_text ? tweet.full_text.split(/\s+/).length : 0;
    return sum + words;
  }, 0);
  const readingTime = Math.round(totalWords / WORDS_PER_MINUTE);

  // Calculate monthly stats
  const monthCounts = {};
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  tweets.forEach(tweet => {
    const date = new Date(tweet.timestamp);
    const monthKey = monthNames[date.getMonth()];
    monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
  });
  
  const topMonth = Object.entries(monthCounts)
    .sort(([,a], [,b]) => b - a)[0];

  return {
    totalBookmarks,
    topAuthors,
    readingTime,
    topMonth: topMonth[0],
    monthCount: topMonth[1]
  };
};

const getBookmarks = async (cursor = "", totalImported = 0, allTweets = []) => {
  const sessionData = await chrome.storage.local.get(["cookie", "csrf", "auth"]);
  const localData = await chrome.storage.local.get(["bookmarksApiId", "features"]);

  if (!sessionData.cookie || !sessionData.csrf || !sessionData.auth) {
    throw new Error("Missing authentication data");
  }

  if (!localData.bookmarksApiId || !localData.features) {
    throw new Error("Missing API configuration");
  }

  const headers = new Headers();
  headers.append("Cookie", sessionData.cookie);
  headers.append("X-Csrf-token", sessionData.csrf);
  headers.append("Authorization", sessionData.auth);

  const variables = {
    count: 100,
    cursor: cursor,
    includePromotedContent: false,
  };
  const API_URL = `https://x.com/i/api/graphql/${
    localData.bookmarksApiId
  }/Bookmarks?features=${encodeURIComponent(
    JSON.stringify(localData.features)
  )}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

  console.log("API_URL", API_URL);

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      headers: headers,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const entries =
      data.data?.bookmark_timeline_v2?.timeline?.instructions?.[0]
        ?.entries || [];
    
    const tweetEntries = entries.filter((entry) =>
      entry.entryId.startsWith("tweet-")
    );

    const parsedTweets = tweetEntries.map(parseTweet);
    console.log("Parsed Tweets", parsedTweets);
    for (const tweet of parsedTweets) {
      if (getTweetYear(tweet.timestamp) !== 2024) {
        console.log("Year is not 2024, stopping import");
        not2024count++;
        if (not2024count > 10) {
          isDone = true;
          break;
        }
      }
      else {
        not2024count = 0;
        allTweets.push(tweet);
      }
    }
    
    const newTweetsCount = parsedTweets.length;
    totalImported += newTweetsCount;

    console.log("Bookmarks data:", data);
    console.log("New tweets in this batch:", newTweetsCount);
    console.log("Current total imported:", totalImported);

    const nextCursor = getNextCursor(entries);

    if (nextCursor && newTweetsCount > 0 && !isDone) {
      await getBookmarks(nextCursor, totalImported, allTweets);
    } else {
      console.log("Import completed. Total imported:", totalImported);
      console.log("All imported tweets:", allTweets);
      
      // Process the data
      const processedData = processBookmarksData(allTweets);
    }
  } catch (error) {
    console.error("Error fetching bookmarks:", error);
  }
};

const parseTweet = (entry) => {
  const tweet = entry.content?.itemContent?.tweet_results?.result?.tweet || entry.content?.itemContent?.tweet_results?.result;

  // Safely access media, handling potential undefined values
  const media = tweet?.legacy?.entities?.media?.[0] || null;

  const getBestVideoVariant = (variants) => {
    if (!variants || variants.length === 0) return null;
    const mp4Variants = variants.filter(v => v.content_type === "video/mp4");
    return mp4Variants.reduce((best, current) => {
      if (!best || (current.bitrate && current.bitrate > best.bitrate)) {
        return current;
      }
      return best;
    }, null);
  };

  const getMediaInfo = (media) => {
    if (!media) return null;

    if (media.type === 'video' || media.type === 'animated_gif') {
      const videoInfo = tweet?.legacy?.extended_entities?.media?.[0]?.video_info;
      const bestVariant = getBestVideoVariant(videoInfo?.variants);
      return {
        type: media.type,
        source: bestVariant?.url || media.media_url_https,
      };
    }

    return {
      type: media.type,
      source: media.media_url_https,
    };
  };

  const author = tweet?.core?.user_results?.result?.legacy || {};

  return {
    id: entry.entryId,
    full_text: tweet?.legacy?.full_text,
    timestamp: tweet?.legacy?.created_at,
    media: getMediaInfo(media),
    author: {
      name: author.name,
      screen_name: author.screen_name,
      profile_image_url: author.profile_image_url_https
    }
  }; 
};

const getNextCursor = (entries) => {
  const cursorEntry = entries.find(entry => entry.entryId.startsWith("cursor-bottom-"));
  return cursorEntry ? cursorEntry.content.value : null;
};

const waitForRequiredData = () => {
  return new Promise((resolve) => {
    const checkData = () => {
      chrome.storage.local.get(['bookmarksApiId', 'cookie', 'csrf', 'auth'], (result) => {
        if (result.bookmarksApiId && result.cookie && result.csrf && result.auth) {
          console.log('Got all data needed to fetch bookmarks, going to getBookmarks');
          resolve();
        } else {
          setTimeout(checkData, 100); // Check again after 100ms
        }
      });
    };
    checkData();
  });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "exportBookmarks") {
    chrome.tabs.create({ url: "https://x.com/i/bookmarks/all" }, (newTab) => {
      setTimeout(() => {
        chrome.tabs.sendMessage(newTab.id, {action: "showLoader"});
      }, 1000);
    });
    
    console.log("Received export request from popup");

    waitForRequiredData().then(() => {
      getBookmarks();
      sendResponse({ status: "started" });
    });

    return true;
  }
  
  if (request.action === "takeScreenshot") {

    const slideContent = document.querySelector('.slide-content');
    if (!slideContent) {
        sendResponse({error: "No slide content found"});
        return;
    }

    html2canvas(slideContent, {
        backgroundColor: '#1a1f2e',
        scale: 2, // Higher resolution
        logging: false
    }).then(function(canvas) {
        const dataURL = canvas.toDataURL("image/png", 1.0);
        sendResponse({imageData: dataURL});
    });

    return true; // Required for async response
  }
});

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (
      !(details.url.includes("x.com") || details.url.includes("twitter.com"))
    ) {
      return;
    }


    // Check if stuff is already stored
    chrome.storage.local.get(["bookmarksApiId", "cookie", "csrf", "auth", "features"], (result) => {
      // Check if the URL matches the pattern for bookmarks API
      const bookmarksUrlPattern = /https:\/\/x\.com\/i\/api\/graphql\/([^/]+)\/Bookmarks\?/;
      const match = details.url.match(bookmarksUrlPattern);

      if (match) {
        if (!result.bookmarksApiId) {
          const bookmarksApiId = match[1];
          chrome.storage.local.set({ bookmarksApiId }, () => {
            console.log(`Stored bookmarksApiId: ${bookmarksApiId}`);
          });
        }

        if (!result.features) {
          const url = new URL(details.url);
          const features = JSON.parse(decodeURIComponent(url.searchParams.get('features') || '{}'));
          chrome.storage.local.set({ features }, () => {
            console.log("Stored features: ", features);
          });
        }
      }



      const authHeader = details.requestHeaders?.find(
        (header) => header.name.toLowerCase() === "authorization"
      );
      const auth = authHeader ? authHeader.value : "";

      const cookieHeader = details.requestHeaders?.find(
        (header) => header.name.toLowerCase() === "cookie"
      );
      const cookie = cookieHeader ? cookieHeader.value : "";

      const csrfHeader = details.requestHeaders?.find(
        (header) => header.name.toLowerCase() === "x-csrf-token"
      );
      const csrf = csrfHeader ? csrfHeader.value : "";

      if (!auth || !cookie || !csrf) {
        return;
      }

      if (result.cookie !== cookie || result.csrf !== csrf || result.auth !== auth) {
        chrome.storage.local.set({ cookie, csrf, auth }, () => {
          console.log("Updated cookie, csrf, auth in local storage");
        });
      }
    });
  },
  { urls: ["*://x.com/*", "*://twitter.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

// Add onInstalled handler at the top level of the file
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.get(['wasPopupShown'], (result) => {
      if (!result.wasPopupShown) {
        chrome.tabs.create({
          url: chrome.runtime.getURL('welcome.html')
        });
        chrome.storage.local.set({ wasPopupShown: true });
      }
    });
  }
});

