// ==UserScript==
// @name         Tiktok Video Playback Speed & Auto Scroll
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Automatically set TikTok regular video playback speed to DEFAULT_SPEEDx and live video to 1x when scrolling or switching videos, including live video thumbnails. Auto scroll to next video when current video ends. Skip ended live videos.
// @author       You
// @match        *://www.tiktok.com/*
// @updateURL    https://raw.githubusercontent.com/vaitan/tiktok-video-speed/main/tiktok-video-speed.user.js
// @downloadURL  https://raw.githubusercontent.com/vaitan/tiktok-video-speed/main/tiktok-video-speed.user.js
// @supportURL   https://github.com/vaitan/tiktok-video-speed/issues
// @homepageURL  https://github.com/vaitan/tiktok-video-speed
// ==/UserScript==

const DEFAULT_SPEED = 1.75;

function setVideoSpeed() {
    let videos = document.querySelectorAll('video');
    videos.forEach(video => {
        video.playbackRate = DEFAULT_SPEED;
        let isLive = video.closest('[data-e2e="live-player"]') ||
            video.closest('.tiktok-live-container') ||
            video.closest('[class*="live"]') ||
            video.closest('[data-e2e="video-player-live"]') ||
            video.closest('[class*="is-live"]');

        if (isLive) {
            if (video.playbackRate !== 1) {
                video.playbackRate = 1;
                console.log('Live video speed set to 1x');
            }
        } else {
            if (video.playbackRate !== DEFAULT_SPEED) {
                video.playbackRate = DEFAULT_SPEED;
                console.log('Regular video speed set to ' + DEFAULT_SPEED + 'x');
            }

            if (video.getAttribute('playsinline') === 'true') {
                video.playbackRate = 1;
                console.log('Regular video speed set to 1x');
            }
        }
    });
}

function setupAutoScroll() {
    let videos = document.querySelectorAll('video');
    videos.forEach(video => {
        // Remove existing listeners to avoid duplicates
        video.removeEventListener('ended', handleVideoEnd);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        
        // Add new listeners
        video.addEventListener('ended', handleVideoEnd);
        video.addEventListener('timeupdate', handleTimeUpdate);
    });
}

// Track which videos we've already handled to prevent duplicate triggers
const handledVideos = new WeakSet();
let autoScrollTimeout = null;

function handleTimeUpdate() {
    const video = this;
    
    // Skip if we've already handled this video
    if (handledVideos.has(video)) {
        return;
    }
    
    const timeRemaining = video.duration - video.currentTime;
    
    // Only trigger when video is VERY close to the end (less than 0.1s)
    if (timeRemaining <= 0.1 && timeRemaining > 0) {
        console.log(`Video very close to end: ${timeRemaining.toFixed(3)}s remaining`);
        
        // Clear any existing timeout
        if (autoScrollTimeout) {
            clearTimeout(autoScrollTimeout);
        }
        
        // Mark as handled to prevent duplicate processing
        handledVideos.add(video);
        
        // Wait until the video is COMPLETELY finished before scrolling
        autoScrollTimeout = setTimeout(() => {
            // Double check that video is really at the end
            if (video.ended || (video.duration - video.currentTime) <= 0.05) {
                console.log('Video truly ended, triggering auto-scroll');
                handleVideoEnd.call(video);
            } else {
                console.log('Video not truly ended yet, resetting handler');
                handledVideos.delete(video);
            }
        }, 200); // Wait 200ms after detection to ensure completion
    }
}

function handleVideoEnd() {
    const video = this;
    
    // Extra verification that video is really ended
    const timeRemaining = video.duration - video.currentTime;
    if (!video.ended && timeRemaining > 0.05) {
        console.log('Video not truly ended (' + timeRemaining.toFixed(3) + 's remaining), ignoring scroll event');
        handledVideos.delete(video); // Reset handling status
        return;
    }
    
    console.log('Video ended, looking for next video...');
    
    let currentVideoContainer = video.closest('[data-e2e="recommend-list-item"]') || 
                               video.closest('[data-e2e="video-item"]') ||
                               video.closest('div[class*="DivVideoContainer"]');
    
    if (currentVideoContainer) {
        let nextVideoContainer = findNextValidVideo(currentVideoContainer);
        
        if (nextVideoContainer) {
            // Delay to ensure smooth transition and let user see the video ended completely
            setTimeout(() => {
                nextVideoContainer.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'center'
                });
                console.log('Scrolled to next valid video');
                
                // Reset handling status after successful scroll
                setTimeout(() => {
                    handledVideos.delete(video);
                }, 3000);
            }, 800); // Increased delay to let user see the video ended
        } else {
            console.log('No next valid video found, trying to load more...');
            window.scrollBy(0, window.innerHeight);
            
            setTimeout(() => {
                let retryNextContainer = findNextValidVideo(currentVideoContainer);
                if (retryNextContainer) {
                    retryNextContainer.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'center'
                    });
                    console.log('Found valid video after loading more');
                }
                
                // Reset handling status
                setTimeout(() => {
                    handledVideos.delete(video);
                }, 3000);
            }, 1500);
        }
    } else {
        console.log('Video container not found, scrolling down...');
        setTimeout(() => {
            window.scrollBy(0, window.innerHeight);
            
            // Reset handling status
            setTimeout(() => {
                handledVideos.delete(video);
            }, 3000);
        }, 1500);
    }
    
    setTimeout(setVideoSpeed, 1000);
    setTimeout(setupAutoScroll, 2000);
}

function isEndedLiveVideo(videoElement) {
    const container = videoElement.closest('[data-e2e="recommend-list-item"]') || 
                     videoElement.closest('[data-e2e="video-item"]') ||
                     videoElement.closest('div[class*="DivVideoContainer"]');
    
    if (!container) return false;
    
    const liveEndedIndicators = [
        container.querySelector('[class*="live-ended"]'),
        container.querySelector('[class*="live-end"]'),
        container.querySelector('[class*="ended"]'),
        container.querySelector('[data-e2e*="live-end"]'),
        container.querySelector('[data-e2e*="ended"]'),
        container.textContent.includes('直播结束'),
        container.textContent.includes('Live ended'),
        container.textContent.includes('Kết thúc'),
        container.textContent.includes('Đã kết thúc')
    ];
    
    return liveEndedIndicators.some(indicator => indicator);
}

function findNextValidVideo(currentContainer) {
    let nextContainer = currentContainer.nextElementSibling;
    
    while (nextContainer) {
        const video = nextContainer.querySelector('video');
        if (video) {
            if (isEndedLiveVideo(video)) {
                console.log('Skipping ended live video');
                nextContainer = nextContainer.nextElementSibling;
                continue;
            }
            return nextContainer;
        }
        nextContainer = nextContainer.nextElementSibling;
    }
    
    return null;
}

function initializeScript() {
    setVideoSpeed();
    setupAutoScroll();
    localStorage.setItem('auto_scroll', '1');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeScript);
} else {
    initializeScript();
}

function handleScroll() {
    setTimeout(() => {
        setVideoSpeed();
        setupAutoScroll();
    }, 100);
}

window.addEventListener('scroll', handleScroll);

const observer = new MutationObserver((mutations) => {
    let shouldUpdate = false;
    
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1 && (
                    node.querySelector('video') || 
                    node.tagName === 'VIDEO' ||
                    node.getAttribute?.('data-e2e')?.includes('video') ||
                    node.className?.includes('video')
                )) {
                    shouldUpdate = true;
                }
            });
        }
    });
    
    if (shouldUpdate) {
        setTimeout(() => {
            setVideoSpeed();
            setupAutoScroll();
        }, 500);
    }
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

setInterval(() => {
    setVideoSpeed();
    setupAutoScroll();
}, 3000);
