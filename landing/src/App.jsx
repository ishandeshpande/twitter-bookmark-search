import { useState, useEffect } from 'react';
import { processBookmarksStats } from './helpers';
import html2canvas from 'html2canvas';

export default function App() {
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [bookmarksData, setBookmarksData] = useState(null);
  const extensionId = 'fianembkjihgflomceciegiekkllnabm';
  const [isExtensionReady, setIsExtensionReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [checkCount, setCheckCount] = useState(0);
  const [screenshots, setScreenshots] = useState({
    totalBookmarks: null,
    topAuthors: null,
    readingTime: null,
    monthlyStats: null
  });
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const handleExtensionClick = () => {
    window.open('https://chromewebstore.google.com/detail/bookmarks-wrapped/kbfpieehoalhenikobakdhoddpciione', '_blank');
  };

  const handleWrapClick = () => {
    console.log("Sending GET_TWITTER_DATA message to extension");
    chrome.runtime.sendMessage(extensionId, { type: 'GET_TWITTER_DATA' }, function (response) {
      console.log("Twitter data:", response);
      const processedData = processBookmarksStats(response.bookmarks);
      setBookmarksData(processedData);
      setShowSlideshow(true);
    });
  };

  useEffect(() => {
    if (!isExtensionReady && checkCount < 3) {
      const intervalId = setInterval(() => {
        setCheckCount(prev => prev + 1);
        chrome.runtime.sendMessage(extensionId, { type: 'EXTENSION_READY' }, function (response) {
          console.log("Extension ready:", response);
          if (response && response.status === 'ready') {
            setIsExtensionReady(true);
            setIsLoading(false);
          }
          if (checkCount >= 2) { // Will be 3 after this check due to state update
            setIsLoading(false);
          }
        });
      }, 100);

      // Clean up the interval
      return () => clearInterval(intervalId);
    }
  }, [isExtensionReady, checkCount]);

  const takeScreenshot = async (slideId) => {
    const slideContent = document.getElementById(slideId);
    if (!slideContent) {
      console.error(`Slide content not found for id: ${slideId}`);
      return null;
    }

    try {
      slideContent.classList.add('capturing');
      
      const canvas = await html2canvas(slideContent, {
        backgroundColor: '#1a1f2e',
        scale: 2,
        logging: false,
        // useCORS: true,
        // width: 800,
        // height: 500,
        // x: 0,
        // y: 0,
        // scrollX: 0,
        // scrollY: 0,
        // windowWidth: 800,
        // windowHeight: 500
      });
      
      slideContent.classList.remove('capturing');
      
      return canvas.toDataURL('image/png', 1.0);
    } catch (error) {
      console.error('Error taking screenshot:', error);
      slideContent.classList.remove('capturing');
      return null;
    }
  };

  const waitForElement = (id, maxAttempts = 50) => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        attempts++;
        const element = document.getElementById(id);
        if (element) {
          resolve(element);
        } else if (attempts >= maxAttempts) {
          reject(new Error(`Element ${id} not found after ${maxAttempts} attempts`));
        } else {
          setTimeout(check, 100); // Check every 100ms
        }
      };
      check();
    });
  };

  useEffect(() => {
    const captureScreenshot = async () => {
      if (currentSlide >= 1 && currentSlide <= 4) {
        const slideIds = ['total-bookmarks', 'top-authors', 'reading-time', 'monthly-stats'];
        const screenshotKeys = ['totalBookmarks', 'topAuthors', 'readingTime', 'monthlyStats'];
        const slideId = slideIds[currentSlide - 1];
        const key = screenshotKeys[currentSlide - 1];
        
        try {
          console.log(`Waiting for ${slideId} to be rendered...`);
          await waitForElement(slideId);
          
          console.log(`Capturing screenshot for slide: ${slideId}`);
          const screenshot = await takeScreenshot(slideId);
          if (screenshot) {
            setScreenshots(prev => ({
              ...prev,
              [key]: screenshot
            }));
            console.log(`Screenshot captured for ${key}`);
          }
        } catch (error) {
          console.error(`Failed to capture screenshot for ${slideId}:`, error);
        }
      }
    };

    // Start capture immediately, no need for setTimeout
    captureScreenshot();

    // No need for cleanup since we're not using setTimeout anymore
  }, [currentSlide]);

  const handleCopyImage = async () => {
    try {
      const currentScreenshotKey = Object.keys(screenshots)[currentPreviewIndex];
      const imageData = screenshots[currentScreenshotKey];
      
      if (!imageData) {
        console.error('No screenshot data available');
        return;
      }

      const response = await fetch(imageData);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      
      const button = document.querySelector('.copy-button');
      if (button) {
        const originalText = button.innerHTML;
        button.innerHTML = '<span>✅</span> Copied!';
        setTimeout(() => {
          button.innerHTML = originalText;
        }, 2000);
      }
      
      setCopied(true);
    } catch (error) {
      console.error('Error copying image:', error);
    }
  };

  const handleShare = (platform) => {
    const text = "Check out my 2024 Bookmarks Wrapped!\n\nTry it out at https://elondontsueme.com\n\nP.S: @elonmusk please don't sue @sahillalani0\n\n[PASTE-IMAGE-HERE]";
    
    switch (platform) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'whatsapp':
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        break;
      case 'sms':
        window.open(`sms:?body=${encodeURIComponent(text)}`, '_blank');
        break;
    }
  };

  const ShareButton = ({ platform, icon, onClick }) => (
    <button
      onClick={onClick}
      className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center gap-2 hover:bg-white/20 transition-colors min-w-[120px]"
    >
      <img src={icon} alt={platform} className="w-4 h-4 object-contain" />
      <span className="flex-shrink-0">{platform}</span>
    </button>
  );

  const slides = [
    {
      id: 'intro',
      content: (
        <div id="intro" className="w-[800px] h-[500px] flex items-center justify-center p-8">
          <div className="slide-content text-center">
            <h2 className="text-3xl mb-4">Are you ready for your</h2>
            <div className="text-6xl font-bold mb-4 text-[#1da1f2]">
              2024
            </div>
            <h2 className="text-3xl mb-8">Bookmarks Wrapped?</h2>
            <div className="flex gap-4 justify-center">
              <button 
                onClick={() => setCurrentSlide(1)}
                className="px-8 py-3 bg-[#1da1f2] rounded-full text-xl hover:scale-105 transition-transform"
              >
                Yes
              </button>
              <button 
                onClick={() => setCurrentSlide(1)}
                className="px-8 py-3 bg-[#1da1f2] rounded-full text-xl hover:scale-105 transition-transform"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'total-bookmarks',
      content: (
        <div id="total-bookmarks" className="w-[800px] h-[500px] flex items-center justify-center p-8">
          <div className="slide-content text-center">
            <h2 className="text-3xl mb-4">In 2024, you saved</h2>
            <div className="text-7xl font-bold mb-4 text-[#1da1f2]">
              {bookmarksData?.length || 0}
            </div>
            <h2 className="text-3xl">posts to your bookmarks</h2>
          </div>
        </div>
      )
    },
    {
      id: 'top-authors',
      content: (
        <div id="top-authors" className="w-[800px] h-[500px] flex items-center justify-center p-8">
          <div className="slide-content text-center w-full max-w-2xl mx-auto">
            <h2 className="text-3xl mb-6">Your Top Bookmarked Accounts</h2>
            <div className="flex flex-col gap-3">
              {bookmarksData?.topAuthors?.map((author, index) => (
                <div key={author.screen_name} className="flex items-center gap-3 bg-white/10 p-3 rounded-xl">
                  <div className={`text-xl font-bold ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-gray-400' :
                    index === 2 ? 'text-orange-400' : 'text-blue-400'
                  }`}>{index + 1}</div>
                  <img 
                    src={author.profile_image_url} 
                    alt={author.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="text-left">
                    <div className="font-semibold text-sm">{author.name}</div>
                    <div className="text-gray-400 text-sm">@{author.screen_name}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'reading-time',
      content: (
        <div id="reading-time" className="w-[800px] h-[500px] flex items-center justify-center p-8">
          <div className="slide-content text-center">
            <h2 className="text-3xl mb-4">You spent</h2>
            <div className="text-7xl font-bold mb-4 text-[#1da1f2]">
              {bookmarksData?.readingTime || 0}
            </div>
            <h2 className="text-3xl mb-4">minutes reading bookmarks</h2>
            <div className="text-xl text-gray-400 italic">
              In that time, Elon could have smoked weed on Joe Rogan {Math.floor((bookmarksData?.readingTime || 0) / 2.38)} times 🌿
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'monthly-stats',
      content: (
        <div id="monthly-stats" className="w-[800px] h-[500px] flex items-center justify-center p-8">
          <div className="slide-content text-center">
            <h2 className="text-3xl mb-4">Your most active bookmarking month was</h2>
            <div className="text-7xl font-bold mb-4 text-[#1da1f2]">
              {bookmarksData?.topMonth || 'JAN'}
            </div>
            <div className="text-2xl mb-4">
              with <span className="text-[#1da1f2]">{bookmarksData?.monthCount || 0}</span> bookmarks
            </div>
            <div className="text-xl text-gray-400 italic">
              You were really going through it that month huh
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'outro',
      content: (
        <div id="outro" className="w-[800px] h-[500px] flex items-center justify-center p-8">
          <div className="slide-content flex gap-32 w-full">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <h2 className="text-3xl mb-4">Thanks for using</h2>
              <div className="text-6xl font-bold mb-4 text-[#1da1f2]">
                Bookmarks
              </div>
              <h2 className="text-3xl mb-4">Wrapped</h2>
              <div className="text-xl text-gray-400 italic max-w-sm">
                Will this be back in 2025? Who knows... Elon might sue me by then 🤷‍♂️
              </div>
            </div>
            <div className="flex-1 flex flex-col items-center gap-6">
              <div className="relative w-full bg-[#1a1f2e] rounded-xl overflow-hidden shadow-[0_0_50px_rgba(29,161,242,0.3)] transition-all duration-300 hover:shadow-[0_0_70px_rgba(29,161,242,0.4)]">
                {screenshots.totalBookmarks && (
                  <div id="final-collage" className="relative w-full">
                    <img 
                      src={screenshots[Object.keys(screenshots)[currentPreviewIndex]]} 
                      alt="Stats preview"
                      className="w-full h-[300px] object-contain bg-[#1a1f2e]"
                    />
                    <button 
                      onClick={() => setCurrentPreviewIndex((prev) => (prev - 1 + 4) % 4)}
                      className="absolute left-1 top-1/2 -translate-y-1/2  rounded-full transition-colors flex items-center justify-center text-xl"
                    >
                      ←
                    </button>
                    <button 
                      onClick={() => setCurrentPreviewIndex((prev) => (prev + 1) % 4)}
                      className="absolute right-1 top-1/2 -translate-y-1/2  rounded-full transition-colors flex items-center justify-center text-xl"
                    >
                      →
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/50 px-3 py-1.5 rounded-full">
                      {[0, 1, 2, 3].map((index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentPreviewIndex(index)}
                          className={`w-2.5 h-2.5 rounded-full transition-all ${
                            index === currentPreviewIndex 
                              ? 'bg-[#1da1f2] scale-125' 
                              : 'bg-white/30 hover:bg-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button 
                onClick={handleCopyImage}
                className="copy-button w-full px-6 py-3 bg-[#1da1f2] rounded-full font-semibold flex items-center justify-center gap-2 hover:scale-105 transition-transform"
              >
                <span>📋</span> Copy Image to Share
              </button>
              
              <div className={`w-full space-y-2 transition-all duration-300 ${copied ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="text-sm text-gray-400 text-center">Share on:</div>
                <div className="flex gap-2 justify-center">
                  <ShareButton 
                    platform="Twitter" 
                    icon="https://upload.wikimedia.org/wikipedia/commons/6/6b/Twitter_Logo_Blue.png"
                    onClick={() => handleShare('twitter')}
                  />
                  <ShareButton 
                    platform="WhatsApp" 
                    icon="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
                    onClick={() => handleShare('whatsapp')}
                  />
                  <ShareButton 
                    platform="iMessage" 
                    icon="https://upload.wikimedia.org/wikipedia/commons/5/51/IMessage_logo.svg"
                    onClick={() => handleShare('sms')}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ];

  if (!showSlideshow) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a1f2e] to-[#2d3748] text-white">
        <div className="container mx-auto px-4 py-16">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h1 className="text-6xl font-bold mb-4 text-[#1da1f2]">
              Bookmarks Wrapped
            </h1>
            <p className="text-xl text-gray-300 mb-8">
              Spotify wrapped but for Twitter bookmarks.
            </p>
            <a 
              onClick={isExtensionReady ? handleWrapClick : handleExtensionClick}
              target="_blank"
              className="cursor-pointer inline-flex items-center px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-500 hover:bg-blue-600 hover:scale-105 rounded-full font-semibold text-2xl transition-all animate-bounce-subtle mb-4"
            >
              {isLoading ? (
                <div className="flex items-center">
                  <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Checking extension...
                </div>
              ) : (
                <>
                  {isExtensionReady ? <span className="mr-2">🎁</span> : <span className="mr-2">🚀</span>}
                  {isExtensionReady ? "Wrap my bookmarks" : "Get Started"}
                  {isExtensionReady ? <span className="ml-2">🎁</span> : <span className="ml-2">🚀</span>}
                </>
              )}
            </a>
            <div className="text-sm text-gray-400 mt-2">
              <span className="mr-2 animate-bounce-slow">🏄‍♂️</span>
              Built with <a 
                href="https://surferprotocol.org" 
                target="_blank" 
                className="text-blue-500 hover:text-blue-600 relative group"
              >
                Surfer Protocol
                <span className="absolute inset-0 bg-blue-500/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity"></span>
              </a>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-4 gap-8 mb-16">
            <FeatureCard 
              emoji="📊"
              title="Saved Posts"
              description="See how many posts you've saved and the top 5 authors you've bookmarked"
            />
            <FeatureCard 
              emoji="🔍"
              title="Top 5 Authors"
              description="See the top 5 authors you've bookmarked"
            />
            <FeatureCard 
              emoji="⏱️"
              title="Reading Time"
              description="Find out how many Elon-smoking-with-Joe-Rogan sessions you could have watched instead"
            />
            <FeatureCard 
              emoji="📅"
              title="Monthly Insights"
              description="Discover your most active bookmarking month"
            />
          </div>

          {/* Fun Quote */}
          <div className="text-center mb-16">
            <blockquote className="text-2xl italic text-gray-300">
              Disclaimer: Elon Musk may not be happy about this.
            </blockquote>
          </div>

          {/* Footer */}
          <footer className="text-center text-gray-400">
            <p>
              Made by{" "}
              <a href="https://twitter.com/SahilLalani0" target="_blank" className="text-blue-500 hover:text-blue-600">
                @SahilLalani0
              </a>
              {" | "}
              <a href="https://github.com/sahil-lalani/bookmarks-wrapped" target="_blank" className="text-blue-500 hover:text-blue-600">
                Open-source
              </a>{" "}
              just like the Twitter algo
            </p>
            <p className="text-sm mt-2">
              Not affiliated with X/Twitter. Please don't sue me, Elon.
            </p>
          </footer>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1f2e] to-[#2d3748] text-white flex items-center justify-center">
      <div className="w-[800px] relative">
        {/* Slideshow */}
        <div className="relative min-h-[60vh] flex items-center justify-center">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute w-full transition-all duration-500 ${
                index === currentSlide
                  ? 'opacity-100 transform scale-100 pointer-events-auto'
                  : 'opacity-0 transform scale-95 pointer-events-none'
              }`}
            >
              {slide.content}
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-center items-center gap-4 mt-8">
          <button
            onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            className={`p-2 text-2xl ${currentSlide === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:text-blue-400'}`}
            disabled={currentSlide === 0}
          >
            ←
          </button>
          <div className="flex gap-2">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`w-3 h-3 rounded-full transition-all ${
                  index === currentSlide ? 'bg-blue-400 scale-125' : 'bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            className={`p-2 text-2xl ${currentSlide === slides.length - 1 ? 'opacity-50 cursor-not-allowed' : 'hover:text-blue-400'}`}
            disabled={currentSlide === slides.length - 1}
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ emoji, title, description }) {
  return (
    <div className="group relative bg-white/10 rounded-xl p-6 backdrop-blur-sm hover:transform hover:scale-105 transition-all duration-300 hover:after:opacity-100 after:absolute after:inset-0 after:rounded-xl after:bg-gradient-to-br after:from-transparent after:to-blue-500/20 after:opacity-0 after:transition-opacity after:duration-300 after:-z-10">
      <div className="text-4xl mb-4 animate-bounce-slow">{emoji}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-300">{description}</p>
    </div>
  );
}